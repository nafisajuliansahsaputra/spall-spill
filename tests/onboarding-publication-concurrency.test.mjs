import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

const container = process.env.SPILL_TEST_DB_CONTAINER ?? 'supabase_db_spall-spill';
assert.match(container, /^supabase_db_spall-spill(?:-[a-z0-9-]+)?$/);
assert.ok(process.env.CI || container !== 'supabase_db_spall-spill', 'Local publication races require an explicitly isolated test container.');
function query(sql, observe = () => {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qAt'], {
      windowsHide: true, stdio: ['pipe','pipe','pipe'], timeout: 30_000,
    });
    let output = ''; let errors = '';
    child.stdout.on('data', (data) => { output += data; observe(output); });
    child.stderr.on('data', (data) => { errors += data; });
    child.on('error', reject); child.stdin.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(output.trim()) : reject(new Error(errors || `psql exited ${code}`)));
    child.stdin.end(sql);
  });
}
const jsonRows = (output) => output.split('\n').filter((line) => line.startsWith('{')).map((line) => JSON.parse(line));
async function fixture(resource = false) {
  const authId = randomUUID(); const handle = `pub-${authId.slice(0,8)}`;
  const source = `https://example.test/${handle}`;
  await query(`insert into auth.users(id,email) values('${authId}','${handle}@example.test');`);
  const ownerId = await query(`select owner_id from core.owner_auth_bindings where auth_user_id='${authId}';`);
  assert.match(ownerId, /^[a-f0-9-]{36}$/);
  // The staged endpoint is withheld from Data API roles. These isolated privileged
  // test sessions exercise its Auth-bound transaction without widening any grants.
  const auth = `set local request.jwt.claims='{"role":"authenticated","sub":"${authId}"}';`;
  const setup = await query(`begin; ${auth}
    select api.claim_current_owner_handle('${handle}',1);
    select api.set_current_owner_primary_use_case('business',2);
    select api.save_current_owner_basic_identity('Publish race',null,null,3);
    select api.save_current_owner_starter_composition('business',null,4);
    ${resource ? `select api.save_current_owner_resource_draft('menu','${source}','Race menu',null);` : ''}
    select api.advance_current_owner_relevant_first_job(5); commit;`);
  for (const row of jsonRows(setup)) assert.equal(row.status, 'success');
  if (resource) await query(`insert into core.external_destination_safety(normalized_url,url_hash,safety_status,scanner_version,checked_at,expires_at)
    values('${source}',encode(extensions.digest('${source}','sha256'),'hex'),'safe','race-fixture',now(),now()+interval '1 hour');`);
  const confirm = () => query(`begin; ${auth} select api.confirm_current_onboarding_preview(api.resolve_current_onboarding_preview()->>'snapshot_hash'); commit;`)
    .then((result) => jsonRows(result)[0]);
  const publish = (receipt,bundle) => query(`begin; ${auth} select api.publish_current_onboarding('${receipt.receipt_id}','${receipt.snapshot_hash}','${bundle}'); commit;`)
    .then((result) => jsonRows(result)[0]);
  return { authId,ownerId,source,confirm,publish };
}

test('parallel preview confirmations and duplicate first Publish produce one stable acknowledgment', async () => {
  const context = await fixture();
  try {
    const reviews = await Promise.all([context.confirm(),context.confirm()]);
    assert.equal(reviews[0].status,'success'); assert.deepEqual(reviews[0],reviews[1]);
    const results = await Promise.all([context.publish(reviews[0],'identity_only'),context.publish(reviews[1],'identity_only')]);
    assert.equal(results[0].status,'success'); assert.deepEqual(results[0],results[1]);
    assert.equal(await query(`select count(*) from core.identity_publications where owner_id='${context.ownerId}';`),'1');
    assert.equal(await query(`select count(*) from core.first_onboarding_publications where owner_id='${context.ownerId}';`),'1');
    assert.equal(await query(`select revision from core.owner_onboarding_progress where owner_id='${context.ownerId}';`),'7');
    assert.equal(await query(`select count(*) from core.spill_item_publications where owner_id='${context.ownerId}';`),'0');
  } finally { await query(`delete from auth.users where id='${context.authId}';`); }
});

test('conflicting concurrent bundles commit exactly one explicit outcome and retain Resource Working', async () => {
  const context = await fixture(true);
  try {
    const review = await context.confirm();
    const results = await Promise.all([context.publish(review,'identity_only'),context.publish(review,'resource')]);
    assert.deepEqual(results.map((result) => result.status).sort(),['conflicting_intent','success']);
    const winner = results.find((result) => result.status === 'success');
    assert.equal(await query(`select count(*) from core.identity_publications where owner_id='${context.ownerId}';`),'1');
    assert.equal(await query(`select count(*) from core.spill_item_publications where owner_id='${context.ownerId}';`),winner.bundle === 'resource' ? '1' : '0');
    assert.equal(await query(`select count(*) from core.resource_drafts where owner_id='${context.ownerId}';`),'1');
    assert.equal(await query(`select count(*) from core.spill_item_identity_registry where owner_id='${context.ownerId}';`),'1');
  } finally { await query(`delete from auth.users where id='${context.authId}';`); }
});

test('a destination verdict expiring while Publish waits for Owner lock never creates public state', async () => {
  const context = await fixture(true);
  try {
    await query(`update core.external_destination_safety set expires_at=clock_timestamp()+interval '2 seconds' where normalized_url='${context.source}';`);
    const review = await context.confirm();
    let signalLock;
    const locked = new Promise((resolve) => { signalLock = resolve; });
    const holder = query(`begin; select id from core.owners where id='${context.ownerId}' for update; select 'LOCK_HELD'; select pg_sleep(3); commit;`,
      (output) => { if (output.includes('LOCK_HELD')) signalLock(); });
    await Promise.race([locked,holder.then(() => { throw new Error('Owner lock was not observed'); })]);
    const result = await context.publish(review,'resource');
    await holder;
    assert.ok(['item_invalid','stale_preview'].includes(result.status));
    assert.equal(await query(`select count(*) from core.identity_publications where owner_id='${context.ownerId}';`),'0');
    assert.equal(await query(`select count(*) from core.spill_item_publications where owner_id='${context.ownerId}';`),'0');
    assert.equal(await query(`select onboarding_completed_at is null from core.owners where id='${context.ownerId}';`),'t');
    assert.equal(await query(`select revision from core.resource_drafts where owner_id='${context.ownerId}';`),'1');
  } finally { await query(`delete from auth.users where id='${context.authId}';`); }
});

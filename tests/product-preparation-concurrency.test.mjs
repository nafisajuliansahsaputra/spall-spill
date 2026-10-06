import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

const container = process.env.SPILL_TEST_DB_CONTAINER ?? 'supabase_db_spall-spill';
assert.match(container, /^supabase_db_spall-spill(?:-[a-z0-9-]+)?$/);
assert.ok(process.env.CI || container !== 'supabase_db_spall-spill', 'Local preparation races require an explicitly isolated test container.');
function query(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qAt'], {
      windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], timeout: 30_000,
    });
    let output = ''; let errors = '';
    child.stdout.on('data', (data) => { output += data; });
    child.stderr.on('data', (data) => { errors += data; });
    child.on('error', reject); child.stdin.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(output.trim()) : reject(new Error(errors || `psql exited ${code}`)));
    child.stdin.end(sql);
  });
}
const rows = (output) => output.split('\n').filter((line) => line.startsWith('{')).map((line) => JSON.parse(line));

test('parallel private preparation saves retain one whole winner and reject stale replacement', async () => {
  const authId = randomUUID(); const handle = `prep-${authId.slice(0,8)}`;
  let ownerId;
  try {
    await query(`insert into auth.users(id,email) values('${authId}','${handle}@example.test');`);
    ownerId = await query(`select owner_id from core.owner_auth_bindings where auth_user_id='${authId}';`);
    assert.match(ownerId, /^[a-f0-9-]{36}$/);
    const auth = `set local role authenticated; set local request.jwt.claims='{"role":"authenticated","sub":"${authId}"}';`;
    const setup = await query(`begin; ${auth}
      select api.claim_current_owner_handle('${handle}',1);
      select api.set_current_owner_primary_use_case('affiliate',2);
      select api.save_current_owner_basic_identity('Preparation race',null,null,3);
      select api.save_current_owner_starter_composition('featured',null,4);
      select api.save_current_owner_product_draft('https://example.test/product','Race Product',null); commit;`);
    for (const row of rows(setup)) assert.equal(row.status, 'success');
    const save = (url, revision) => query(`begin; ${auth}
      select api.save_current_product_preparation(null,'[{"provider_key":"shopee","destination_url":"${url}"}]',1,${revision});
      select pg_sleep(0.2); commit;`).then((output) => rows(output)[0]);
    for (const [base, expected] of [['null',1],['1',2]]) {
      const results = await Promise.all([save('https://shopee.co.id/one?affiliate=one',base),save('https://shopee.co.id/two?affiliate=two',base)]);
      assert.deepEqual(results.map((result) => result.status).sort(), ['stale_write','success']);
      const winner = results.find((result) => result.status === 'success');
      assert.equal(winner.preparation.revision, expected);
      const saved = rows(await query(`begin; ${auth} select api.resolve_current_product_preparation(); commit;`))[0];
      assert.deepEqual(saved, winner);
    }
    assert.equal(await query(`select count(*) from core.product_preparations where owner_id='${ownerId}';`),'1');
    assert.equal(await query(`select revision from core.product_drafts where owner_id='${ownerId}';`),'1');
    assert.equal(await query(`select revision from core.owner_onboarding_progress where owner_id='${ownerId}';`),'5');
    assert.equal(await query(`select count(*) from core.spill_item_identity_registry where owner_id='${ownerId}';`),'1');
    assert.equal(await query(`select count(*) from core.identity_publications where owner_id='${ownerId}';`),'0');
  } finally {
    await query(`delete from auth.users where id='${authId}';`);
    if (ownerId) await query(`delete from core.product_drafts where owner_id='${ownerId}';`);
  }
});

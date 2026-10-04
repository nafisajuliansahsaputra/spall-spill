import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

const container = process.env.SPILL_TEST_DB_CONTAINER ?? 'supabase_db_spall-spill';
assert.match(container, /^supabase_db_spall-spill(?:-[a-z0-9-]+)?$/);
function query(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qAt'], {
      windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], timeout: 30_000,
    });
    let output = ''; let errors = '';
    child.stdout.on('data', (data) => { output += data; });
    child.stderr.on('data', (data) => { errors += data; });
    child.on('error', reject);
    child.stdin.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(output.trim()) : reject(new Error(errors || `psql exited ${code}`)));
    child.stdin.end(sql);
  });
}

test('concurrent first Product saves serialize and reserve exactly one identity', async () => {
  const authId = randomUUID();
  const handle = `ref-${authId.slice(0, 8)}`;
  let ownerId;
  try {
    await query(`insert into auth.users(id,email) values ('${authId}','${handle}@example.test');`);
    ownerId = await query(`select owner_id from core.owner_auth_bindings where auth_user_id='${authId}';`);
    assert.match(ownerId, /^[a-f0-9-]{36}$/);
    const auth = `set local role authenticated; set local request.jwt.claims='{"role":"authenticated","sub":"${authId}"}';`;
    const setup = await query(`begin; ${auth}
      select api.claim_current_owner_handle('${handle}',1);
      select api.set_current_owner_primary_use_case('affiliate',2);
      select api.save_current_owner_basic_identity('Reference race',null,null,3);
      select api.save_current_owner_starter_composition('featured',null,4); commit;`);
    for (const line of setup.split('\n')) assert.equal(JSON.parse(line).status, 'success');
    const save = (name) => query(`begin; ${auth}
      select api.save_current_owner_product_draft('https://example.com/${name}',null,null);
      select pg_sleep(1); commit;`);
    const results = await Promise.all([save('one'), save('two')]);
    const statuses = results.map((output) => JSON.parse(output.split('\n').find((line) => line.startsWith('{'))).status).sort();
    assert.deepEqual(statuses, ['stale_write', 'success']);
    assert.equal(await query(`select count(*) from core.product_drafts where owner_id='${ownerId}';`), '1');
    assert.equal(await query(`select count(*) from core.spill_item_identity_registry where owner_id='${ownerId}';`), '1');
    assert.equal(await query(`select spill_reference from core.spill_item_identity_registry where owner_id='${ownerId}';`), '1');
    assert.equal(await query(`select next_reference from core.spill_reference_counters where owner_id='${ownerId}';`), '2');

    // Concurrent shared-type allocations use the same locked Owner namespace.
    const itemOne = randomUUID(); const itemTwo = randomUUID();
    await Promise.all([query(`begin; select core.reserve_spill_item_identity('${itemOne}','${ownerId}','product'); select pg_sleep(1); commit;`),
      query(`begin; select core.reserve_spill_item_identity('${itemTwo}','${ownerId}','resource'); select pg_sleep(1); commit;`)]);
    assert.equal(await query(`select string_agg(spill_reference::text,',' order by spill_reference) from core.spill_item_identity_registry where owner_id='${ownerId}';`), '1,2,3');
    assert.equal(await query(`select next_reference from core.spill_reference_counters where owner_id='${ownerId}';`), '4');
  } finally {
    // Remove test Auth/content; canonical Owner/Handle and Item reservations are permanent.
    await query(`delete from auth.users where id='${authId}';`);
    if (ownerId) await query(`delete from core.product_drafts where owner_id='${ownerId}';`);
  }
});

test('Resource first saves and parallel Product creation preserve one shared Owner sequence', async () => {
  const authId = randomUUID();
  const handle = `res-${authId.slice(0, 8)}`;
  let ownerId;
  try {
    await query(`insert into auth.users(id,email) values ('${authId}','${handle}@example.test');`);
    ownerId = await query(`select owner_id from core.owner_auth_bindings where auth_user_id='${authId}';`);
    assert.match(ownerId, /^[a-f0-9-]{36}$/);
    const auth = `set local role authenticated; set local request.jwt.claims='{"role":"authenticated","sub":"${authId}"}';`;
    const setup = await query(`begin; ${auth}
      select api.claim_current_owner_handle('${handle}',1);
      select api.set_current_owner_primary_use_case('business',2);
      select api.save_current_owner_basic_identity('Resource race',null,null,3);
      select api.save_current_owner_starter_composition('clean',null,4); commit;`);
    for (const line of setup.split('\n')) assert.equal(JSON.parse(line).status, 'success');
    const resourceSave = (title) => query(`begin; ${auth}
      select api.save_current_owner_resource_draft('menu',null,'${title}',null);
      select pg_sleep(1); commit;`);
    const productSave = () => query(`begin; ${auth}
      select api.save_current_owner_product_draft('https://example.com/product',null,null);
      select pg_sleep(1); commit;`);
    const [one, two, product] = await Promise.all([resourceSave('Menu one'), resourceSave('Menu two'), productSave()]);
    const status = (result) => JSON.parse(result.split('\n').find((line) => line.startsWith('{'))).status;
    assert.deepEqual([status(one), status(two)].sort(), ['stale_write', 'success']);
    assert.equal(status(product), 'success');
    assert.equal(await query(`select count(*) from core.resource_drafts where owner_id='${ownerId}';`), '1');
    assert.equal(await query(`select count(*) from core.product_drafts where owner_id='${ownerId}';`), '1');
    assert.equal(await query(`select string_agg(spill_reference::text,',' order by spill_reference) from core.spill_item_identity_registry where owner_id='${ownerId}';`), '1,2');
    assert.equal(await query(`select next_reference from core.spill_reference_counters where owner_id='${ownerId}';`), '3');
  } finally {
    await query(`delete from auth.users where id='${authId}';`);
    if (ownerId) {
      await query(`delete from core.product_drafts where owner_id='${ownerId}'; delete from core.resource_drafts where owner_id='${ownerId}';`);
    }
  }
});

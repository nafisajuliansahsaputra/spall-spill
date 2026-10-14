import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';

const container = process.env.SPILL_TEST_DB_CONTAINER ?? 'supabase_db_spall-spill';
assert.match(container, /^supabase_db_spall-spill(?:-[a-z0-9-]+)?$/);
assert.ok(process.env.CI || container !== 'supabase_db_spall-spill', 'Removal CAS races require explicitly isolated test database.');
function query(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['exec','-i',container,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-qAt'], {
      windowsHide: true, stdio: ['pipe','pipe','pipe'], timeout: 30_000,
    });
    let output = ''; let errors = '';
    child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { errors += data; });
    child.on('error', reject); child.stdin.on('error', reject);
    child.on('close', code => code === 0 ? resolve(output.trim()) : reject(new Error(errors || `psql exited ${code}`)));
    child.stdin.end(sql);
  });
}
let owner; let fixtureOwners = [];
const actor = '98000000-0000-4000-8000-000000000001';
const generic = '98000000-0000-4000-8000-000000000011';
const social = '98000000-0000-4000-8000-000000000012';
const auth = `set local request.jwt.claims='{"sub":"${actor}","role":"authenticated"}';`;
const result = output => JSON.parse(output.split('\n').find(line => line.startsWith('{')));
function remove(block, hold = false) {
  const request = { block_id: block, base_collection_revision: 1, confirm_removal:true };
  const json = `'${JSON.stringify(request)}'::jsonb`;
  return query(`begin; ${auth} select api.remove_current_owner_block_working(${json}); ${hold ? 'select pg_sleep(0.3);' : ''} commit;`).then(result);
}
function visibilitySave() {
  return query(`begin; ${auth} select api.save_current_owner_block_visibility_working('{"block_id":"${generic}","base_collection_revision":1,"is_visible":true}'::jsonb); select pg_sleep(0.3); commit;`).then(result);
}
function payloadSave() {
  return query(`begin; ${auth} select api.save_current_owner_block_link_working('{"block_id":"${generic}","base_collection_revision":1,"link_working":{"kind":"generic_link","title":"payload winner","social_platform":null,"destination_url":null}}'::jsonb); select pg_sleep(0.3); commit;`).then(result);
}
function move() {
  return query(`begin; ${auth} select api.move_current_owner_block_working('{"block_id":"${generic}","base_collection_revision":1,"direction":"down"}'::jsonb); select pg_sleep(0.3); commit;`).then(result);
}
const order = () => query(`select string_agg(right(block_id::text,2),',' order by position) from core.identity_blocks_working where owner_id='${owner}';`);
const revision = () => query(`select revision from core.identity_block_collections_working where owner_id='${owner}';`);
const present = block => query(`select count(*) from core.identity_blocks_working where block_id='${block}' and owner_id='${owner}';`);
before(async () => {
  await query('create extension if not exists pgtap with schema extensions;');
  const fixture = readFileSync(new URL('../supabase/tests/database/047_owner_block_removal_cas.test.sql', import.meta.url),'utf8');
  const marker = '\n-- Removal CAS race fixtures end here.\n'; assert.ok(fixture.includes(marker));
  const prefix = fixture.split(marker)[0]; assert.ok(prefix.startsWith('begin;'));
  const output = await query(prefix.replace('begin;', 'begin; set local search_path=public,extensions;') + '\nselect * from finish(); commit;');
  assert.doesNotMatch(output, /not ok/);
  owner = await query(`select owner_id from core.owner_auth_bindings where auth_user_id='${actor}';`);
  assert.match(owner, /^[a-f0-9-]{36}$/);
  fixtureOwners = (await query("select owner_id from core.owner_auth_bindings where auth_user_id in ('98000000-0000-4000-8000-000000000001','98000000-0000-4000-8000-000000000002','98000000-0000-4000-8000-000000000003');")).split('\n');
  assert.equal(fixtureOwners.length, 3); for (const id of fixtureOwners) assert.match(id, /^[a-f0-9-]{36}$/);
});
after(async () => {
  await query(`delete from auth.users where id in ('${actor}','98000000-0000-4000-8000-000000000002','98000000-0000-4000-8000-000000000003');`);
  // Retain permanent Owner/Handle identities; remove only this isolated fixture's Working records.
  if (fixtureOwners.length === 3) {
    const scoped = fixtureOwners.map(id => `'${id}'`).join(',');
    await query(`delete from core.identity_block_collections_working where owner_id in (${scoped}); delete from core.identity_connection_working where owner_id in (${scoped});`);
  }
});
async function reset() {
  // Restore only these known test-owned members between competing-action cases.
  await query(`update core.owners set account_state='active' where id='${owner}';
    update core.identity_block_collections_working set revision=1 where owner_id='${owner}';
    delete from core.identity_blocks_working where owner_id='${owner}';
    insert into core.identity_blocks_working(block_id,owner_id,kind,position,is_visible) values
      ('${generic}','${owner}','generic_link',1,false),('${social}','${owner}','social',7,true),
      ('98000000-0000-4000-8000-000000000013','${owner}','text',42,true),
      ('98000000-0000-4000-8000-000000000015','${owner}','contact',100,true),
      ('98000000-0000-4000-8000-000000000016','${owner}','media',500,true),
      ('98000000-0000-4000-8000-000000000017','${owner}','spill_cta',2147483647,true);
    insert into core.identity_block_links_working(block_id,owner_id,kind,title,social_platform,destination_url)
      values('${generic}','${owner}','generic_link','original',null,'https://original.example.test');`);
}
async function waitLock(sentinel) {
  for (let i = 0; i < 30; i++) {
    if (await query(`select exists(select 1 from pg_locks where locktype='advisory' and classid=1936744812 and objid=${sentinel} and objsubid=2 and granted);`) === 't') return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.fail('Holding transaction did not acquire row lock before sentinel');
}
test('same block/base confirmed removals have one winner and no idempotent replay success', async () => {
  await reset(); const replies = await Promise.all([remove(generic,true),remove(generic,true)]);
  assert.deepEqual(replies.map(x => x.status).sort(),['stale_write','success']);
  assert.deepEqual(replies.find(x => x.status === 'success'),{status:'success',block_id:generic,collection_revision:2});
  assert.equal(await present(generic),'0'); assert.equal(await revision(),'2');
  assert.equal(await query(`select count(*) from core.identity_block_links_working where block_id='${generic}';`),'0');
  assert.equal(await order(),'12,13,15,16,17');
  assert.equal(await query(`select source_connection_revision from core.identity_block_initialization_provenance where owner_id='${owner}';`),'3');
});
test('different removals share one aggregate winner and only its member disappears', async () => {
  await reset(); const replies = await Promise.all([remove(generic,true),remove(social,true)]);
  assert.deepEqual(replies.map(x => x.status).sort(),['stale_write','success']);
  assert.equal(await present(generic),replies[0].status === 'success' ? '0':'1');
  assert.equal(await present(social),replies[1].status === 'success' ? '0':'1');
  assert.equal(await order(),replies[0].status === 'success' ? '12,13,15,16,17':'11,13,15,16,17');
  assert.equal(await revision(),'2');
});
test('removal versus visibility has one winner without stale deletion or resurrection', async () => {
  await reset(); const replies = await Promise.all([remove(generic,true),visibilitySave()]);
  assert.deepEqual(replies.map(x => x.status).sort(),['stale_write','success']);
  assert.equal(await present(generic),replies[0].status === 'success' ? '0':'1');
  assert.equal(await query(`select is_visible from core.identity_blocks_working where block_id='${generic}';`),replies[0].status === 'success' ? '':'t');
  assert.equal(await revision(),'2');
});
test('removal versus payload save retains exact winner content or localized cascade', async () => {
  await reset(); const replies = await Promise.all([remove(generic,true),payloadSave()]);
  assert.deepEqual(replies.map(x => x.status).sort(),['stale_write','success']);
  assert.equal(await present(generic),replies[0].status === 'success' ? '0':'1');
  assert.equal(await query(`select title from core.identity_block_links_working where block_id='${generic}';`),replies[0].status === 'success' ? '':'payload winner');
  assert.equal(await revision(),'2');
});
test('removal versus move retains exact winner membership/order and no stale cascade', async () => {
  await reset(); const replies = await Promise.all([remove(generic,true),move()]);
  assert.deepEqual(replies.map(x => x.status).sort(),['stale_write','success']);
  assert.equal(await order(),replies[0].status === 'success' ? '12,13,15,16,17':'12,11,13,15,16,17');
  assert.equal(await query(`select title from core.identity_block_links_working where block_id='${generic}';`),replies[0].status === 'success' ? '':'original');
  assert.equal(await revision(),'2');
});
test('collection advance during removal wait rejects old base without deletion', async () => {
  await reset();
  const held = query(`begin; update core.identity_block_collections_working set revision=2 where owner_id='${owner}';
    select pg_advisory_xact_lock(1936744812,98); select pg_sleep(2); commit;`);
  try {
    await waitLock(98); assert.deepEqual(await remove(generic),{status:'stale_write'});
    assert.equal(await order(),'11,12,13,15,16,17'); assert.equal(await revision(),'2');
    assert.equal(await query(`select title from core.identity_block_links_working where block_id='${generic}';`),'original');
  } finally { await held; }
});
test('restriction during Owner wait denies removal without member/payload/revision change', async () => {
  await reset();
  const held = query(`begin; update core.owners set account_state='restricted' where id='${owner}';
    select pg_advisory_xact_lock(1936744812,99); select pg_sleep(2); commit;`);
  try {
    await waitLock(99); assert.deepEqual(await remove(generic),{status:'owner_not_eligible'});
    assert.equal(await order(),'11,12,13,15,16,17'); assert.equal(await revision(),'1');
    assert.equal(await query(`select title from core.identity_block_links_working where block_id='${generic}';`),'original');
  } finally { await held; }
});

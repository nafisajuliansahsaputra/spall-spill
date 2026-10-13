import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';

const container = process.env.SPILL_TEST_DB_CONTAINER ?? 'supabase_db_spall-spill';
assert.match(container, /^supabase_db_spall-spill(?:-[a-z0-9-]+)?$/);
assert.ok(process.env.CI || container !== 'supabase_db_spall-spill', 'Visibility CAS races require explicitly isolated test database.');
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
const actor = '93000000-0000-4000-8000-000000000001';
const generic = '93000000-0000-4000-8000-000000000011';
const social = '93000000-0000-4000-8000-000000000012';
const auth = `set local request.jwt.claims='{"sub":"${actor}","role":"authenticated"}';`;
const result = output => JSON.parse(output.split('\n').find(line => line.startsWith('{')));
function save(block, visible, hold = false) {
  const request = { block_id: block, base_collection_revision: 1, is_visible: visible };
  const json = `'${JSON.stringify(request)}'::jsonb`;
  return query(`begin; ${auth} select api.save_current_owner_block_visibility_working(${json}); ${hold ? 'select pg_sleep(0.3);' : ''} commit;`).then(result);
}
function payloadSave() {
  return query(`begin; ${auth} select api.save_current_owner_block_link_working('{"block_id":"${generic}","base_collection_revision":1,"link_working":{"kind":"generic_link","title":"payload winner","social_platform":null,"destination_url":null}}'::jsonb); select pg_sleep(0.3); commit;`).then(result);
}
before(async () => {
  await query('create extension if not exists pgtap with schema extensions;');
  const fixture = readFileSync(new URL('../supabase/tests/database/045_owner_block_visibility_cas.test.sql', import.meta.url),'utf8');
  const marker = '\n-- Visibility CAS race fixtures end here.\n'; assert.ok(fixture.includes(marker));
  const prefix = fixture.split(marker)[0]; assert.ok(prefix.startsWith('begin;'));
  const output = await query(prefix.replace('begin;', 'begin; set local search_path=public,extensions;') + '\nselect * from finish(); commit;');
  assert.doesNotMatch(output, /not ok/);
  owner = await query(`select owner_id from core.owner_auth_bindings where auth_user_id='${actor}';`);
  assert.match(owner, /^[a-f0-9-]{36}$/);
  fixtureOwners = (await query("select owner_id from core.owner_auth_bindings where auth_user_id in ('93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000003');")).split('\n');
  assert.equal(fixtureOwners.length, 3); for (const id of fixtureOwners) assert.match(id, /^[a-f0-9-]{36}$/);
});
after(async () => {
  await query(`delete from auth.users where id in ('${actor}','93000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000003');`);
  // Retain permanent Owner/Handle identities; remove only this isolated fixture's Working records.
  if (fixtureOwners.length === 3) {
    const scoped = fixtureOwners.map(id => `'${id}'`).join(',');
    await query(`delete from core.identity_block_collections_working where owner_id in (${scoped}); delete from core.identity_connection_working where owner_id in (${scoped});`);
  }
});
async function reset() {
  await query(`update core.owners set account_state='active' where id='${owner}';
    update core.identity_block_collections_working set revision=1 where owner_id='${owner}';
    update core.identity_blocks_working set is_visible=true where block_id='${social}';
    update core.identity_blocks_working set is_visible=false where block_id='${generic}';
    update core.identity_block_links_working set title='original',social_platform=null,destination_url='https://original.example.test' where block_id='${generic}';
    delete from core.identity_block_links_working where block_id='${social}';`);
}
async function waitLock(sentinel) {
  for (let i = 0; i < 30; i++) {
    if (await query(`select exists(select 1 from pg_locks where locktype='advisory' and classid=1936744812 and objid=${sentinel} and objsubid=2 and granted);`) === 't') return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.fail('Holding transaction did not acquire row lock before sentinel');
}
test('same block/base visibility saves have one winner with exact persisted acknowledgment', async () => {
  await reset(); const values = [true,false];
  const replies = await Promise.all(values.map(value => save(generic,value,true)));
  assert.deepEqual(replies.map(x => x.status).sort(), ['stale_write','success']);
  const winner = replies.find(x => x.status === 'success');
  assert.deepEqual(winner, { status:'success',block_id:generic,is_visible:values[replies.indexOf(winner)],collection_revision:2 });
  assert.equal(await query(`select is_visible from core.identity_blocks_working where block_id='${generic}';`),winner.is_visible ? 't':'f');
  assert.equal(await query(`select revision from core.identity_block_collections_working where owner_id='${owner}';`),'2');
  assert.equal(await query(`select title from core.identity_block_links_working where block_id='${generic}';`),'original');
});
test('different blocks share one aggregate visibility CAS winner', async () => {
  await reset(); const replies = await Promise.all([save(generic,true,true),save(social,false,true)]);
  assert.deepEqual(replies.map(x => x.status).sort(), ['stale_write','success']);
  assert.equal(await query(`select is_visible from core.identity_blocks_working where block_id='${generic}';`),replies[0].status === 'success' ? 't':'f');
  assert.equal(await query(`select is_visible from core.identity_blocks_working where block_id='${social}';`),replies[1].status === 'success' ? 'f':'t');
  assert.equal(await query(`select revision from core.identity_block_collections_working where owner_id='${owner}';`),'2');
});
test('visibility and payload save share one CAS winner without stale partial writes', async () => {
  await reset(); const replies = await Promise.all([save(generic,true,true),payloadSave()]);
  assert.deepEqual(replies.map(x => x.status).sort(), ['stale_write','success']);
  assert.equal(await query(`select is_visible from core.identity_blocks_working where block_id='${generic}';`),replies[0].status === 'success' ? 't':'f');
  assert.equal(await query(`select title from core.identity_block_links_working where block_id='${generic}';`),replies[1].status === 'success' ? 'payload winner':'original');
  assert.equal(await query(`select revision from core.identity_block_collections_working where owner_id='${owner}';`),'2');
  assert.equal(await query(`select source_connection_revision from core.identity_block_initialization_provenance where owner_id='${owner}';`),'3');
});
test('collection advance while visibility waits rejects old base without member writes', async () => {
  await reset();
  const held = query(`begin; update core.identity_block_collections_working set revision=2 where owner_id='${owner}';
    select pg_advisory_xact_lock(1936744812,93); select pg_sleep(2); commit;`);
  try {
    await waitLock(93); assert.deepEqual(await save(generic,true),{ status:'stale_write' });
    assert.equal(await query(`select is_visible from core.identity_blocks_working where block_id='${generic}';`),'f');
    assert.equal(await query(`select revision from core.identity_block_collections_working where owner_id='${owner}';`),'2');
  } finally { await held; }
});
test('restriction during Owner wait denies without member/revision writes', async () => {
  await reset();
  const held = query(`begin; update core.owners set account_state='restricted' where id='${owner}';
    select pg_advisory_xact_lock(1936744812,94); select pg_sleep(2); commit;`);
  try {
    await waitLock(94); assert.deepEqual(await save(generic,true),{ status:'owner_not_eligible' });
    assert.equal(await query(`select is_visible from core.identity_blocks_working where block_id='${generic}';`),'f');
    assert.equal(await query(`select revision from core.identity_block_collections_working where owner_id='${owner}';`),'1');
  } finally { await held; }
});

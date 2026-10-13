import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';

const container = process.env.SPILL_TEST_DB_CONTAINER ?? 'supabase_db_spall-spill';
assert.match(container, /^supabase_db_spall-spill(?:-[a-z0-9-]+)?$/);
assert.ok(process.env.CI || container !== 'supabase_db_spall-spill', 'Initialization races require explicitly isolated test database.');
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
let owner;
let fixtureOwners = [];
const actor = '89000000-0000-4000-8000-000000000001';
const intent = `'${JSON.stringify({ action: 'import_onboarding_connection', source_revision: 3, title: null, base_collection_revision: null })}'::jsonb`;
const auth = `set local request.jwt.claims='{"sub":"${actor}","role":"authenticated"}';`;
const result = output => JSON.parse(output.split('\n').find(line => line.startsWith('{')));
const initialize = () => query(`begin; ${auth} select api.initialize_current_owner_blocks_from_connection(${intent}); commit;`).then(result);
before(async () => {
  await query('create extension if not exists pgtap with schema extensions;');
  const fixture = readFileSync(new URL('../supabase/tests/database/043_owner_block_initialization.test.sql', import.meta.url),'utf8');
  const marker = '\n-- Initialization race fixtures end here.\n'; assert.ok(fixture.includes(marker));
  const prefix = fixture.split(marker)[0]; assert.ok(prefix.startsWith('begin;'));
  const output = await query(prefix.replace('begin;', 'begin; set local search_path=public,extensions;') + '\nselect * from finish(); commit;');
  assert.doesNotMatch(output, /not ok/);
  owner = await query(`select owner_id from core.owner_auth_bindings where auth_user_id='${actor}';`);
  assert.match(owner, /^[a-f0-9-]{36}$/);
  fixtureOwners = (await query("select owner_id from core.owner_auth_bindings where auth_user_id in ('89000000-0000-4000-8000-000000000001','89000000-0000-4000-8000-000000000002','89000000-0000-4000-8000-000000000003');")).split('\n');
  assert.equal(fixtureOwners.length, 3); for (const id of fixtureOwners) assert.match(id, /^[a-f0-9-]{36}$/);
});
after(async () => {
  await query(`delete from auth.users where id in ('${actor}','89000000-0000-4000-8000-000000000002','89000000-0000-4000-8000-000000000003');`);
  // Permanent Owner/Handle identity is retained. Remove only isolated fixture Working data.
  if (fixtureOwners.length === 3) {
    const scoped = fixtureOwners.map(id => `'${id}'`).join(',');
    await query(`delete from core.identity_block_collections_working where owner_id in (${scoped}); delete from core.identity_connection_working where owner_id in (${scoped});`);
  }
});
async function reset() {
  await query(`delete from core.identity_block_collections_working where owner_id='${owner}';
    update core.identity_connection_working set revision=3,destination_url='HTTPS://Private.example.test/Exact?X=1#Recoverable' where owner_id='${owner}';
    update core.owners set account_state='active' where id='${owner}';`);
}
async function assertEmpty() {
  assert.equal(await query(`select (select count(*) from core.identity_block_collections_working where owner_id='${owner}')
    +(select count(*) from core.identity_blocks_working where owner_id='${owner}')
    +(select count(*) from core.identity_block_links_working where owner_id='${owner}')
    +(select count(*) from core.identity_block_initialization_provenance where owner_id='${owner}');`),'0');
}
async function waitLock(sentinel) {
  for (let i = 0; i < 30; i++) {
    if (await query(`select exists(select 1 from pg_locks where locktype='advisory' and classid=1936744812 and objid=${sentinel} and objsubid=2 and granted);`) === 't') return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.fail('Holding transaction did not acquire row lock before sentinel');
}
test('competing explicit imports commit exactly one collection/member/payload/provenance', async () => {
  await reset();
  const create = () => query(`begin; ${auth} select api.initialize_current_owner_blocks_from_connection(${intent}); select pg_sleep(0.3); commit;`).then(result);
  const replies = await Promise.all([create(),create()]);
  assert.deepEqual(replies.map(x => x.status).sort(), ['already_initialized','success']);
  const winner = replies.find(x => x.status === 'success');
  assert.deepEqual(Object.keys(winner).sort(), ['block_id','collection_revision','status']);
  assert.equal(winner.collection_revision, 1);
  assert.equal(await query(`select count(*) from core.identity_blocks_working where owner_id='${owner}';`),'1');
  assert.equal(await query(`select count(*) from core.identity_block_links_working where owner_id='${owner}';`),'1');
  assert.equal(await query(`select initial_block_id from core.identity_block_initialization_provenance where owner_id='${owner}';`),winner.block_id);
  assert.equal(await query(`select revision from core.identity_connection_working where owner_id='${owner}';`),'3');
});
for (const commit of [true,false]) {
  test(`locked source update ${commit ? 'commit denies stale import' : 'rollback preserves original exact import'}`, async () => {
    await reset();
    const held = query(`begin; update core.identity_connection_working set revision=4,destination_url='https://new.example.test/path' where owner_id='${owner}';
      select pg_advisory_xact_lock(1936744812,89); select pg_sleep(2); ${commit ? 'commit' : 'rollback'};`);
    try {
      await waitLock(89); const reply = await initialize();
      assert.equal(reply.status,commit ? 'stale_source' : 'success');
      if (commit) await assertEmpty();
      else assert.equal(await query(`select destination_url from core.identity_block_links_working where owner_id='${owner}';`),'HTTPS://Private.example.test/Exact?X=1#Recoverable');
    } finally { await held; }
  });
}
test('restriction committed while initializer waits for Owner lock denies without writes', async () => {
  await reset();
  const held = query(`begin; update core.owners set account_state='restricted' where id='${owner}';
    select pg_advisory_xact_lock(1936744812,90); select pg_sleep(2); commit;`);
  try { await waitLock(90); assert.deepEqual(await initialize(),{ status: 'owner_not_eligible' }); await assertEmpty(); }
  finally { await held; }
});

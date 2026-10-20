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
const actor = 'a5000000-0000-4000-8000-000000000001';
const importIntent = `'${JSON.stringify({ action: 'import_onboarding_connection', source_revision: 3, title: null, base_collection_revision: null })}'::jsonb`;
const auth = `set local request.jwt.claims='{"sub":"${actor}","role":"authenticated"}';`;
const result = output => JSON.parse(output.split('\n').find(line => line.startsWith('{')));
const importSource = () => query(`begin; ${auth} select api.initialize_current_owner_blocks_from_connection(${importIntent}); commit;`).then(result);
before(async () => {
  await query('create extension if not exists pgtap with schema extensions;');
  const fixture = readFileSync(new URL('../supabase/tests/database/055_owner_first_text_initialization.test.sql', import.meta.url),'utf8');
  const marker = '\n-- First Text initialization race fixtures end here.\n'; assert.ok(fixture.includes(marker));
  const prefix = fixture.split(marker)[0]; assert.ok(prefix.startsWith('begin;'));
  const output = await query(prefix.replace('begin;', 'begin; set local search_path=public,extensions;') + '\nselect * from finish(); commit;');
  assert.doesNotMatch(output, /not ok/);
  owner = await query(`select owner_id from core.owner_auth_bindings where auth_user_id='${actor}';`);
  assert.match(owner, /^[a-f0-9-]{36}$/);
  fixtureOwners = (await query("select owner_id from core.owner_auth_bindings where auth_user_id in ('a5000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000002','a5000000-0000-4000-8000-000000000003');")).split('\n');
  assert.equal(fixtureOwners.length, 3); for (const id of fixtureOwners) assert.match(id, /^[a-f0-9-]{36}$/);
});
after(async () => {
  await query(`delete from auth.users where id in ('${actor}','a5000000-0000-4000-8000-000000000002','a5000000-0000-4000-8000-000000000003');`);
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
     +(select count(*) from core.identity_block_links_working where owner_id='${owner}') +(select count(*) from core.identity_block_texts_working where owner_id='${owner}')
    +(select count(*) from core.identity_block_initialization_provenance where owner_id='${owner}');`),'0');
}
async function waitLock(sentinel) {
  for (let i = 0; i < 30; i++) {
    if (await query(`select exists(select 1 from pg_locks where locktype='advisory' and classid=1936744812 and objid=${sentinel} and objsubid=2 and granted);`) === 't') return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.fail('Holding transaction did not acquire row lock before sentinel');
}
const manualIntent = `'${JSON.stringify({action:'initialize_text_block',base_collection_revision:null,is_visible:false,text_working:{kind:'text',text:'raw Text <script>recoverable</script>'}})}'::jsonb`;
const manual = () => query(`begin; ${auth} select api.initialize_current_owner_blocks_from_text(${manualIntent}); commit;`).then(result);
async function assertWinner(winner, imported) {
  assert.deepEqual(Object.keys(winner).sort(), ['block_id','collection_revision','status']);
  assert.equal(winner.collection_revision,1);
  assert.equal(await query(`select revision from core.identity_block_collections_working where owner_id='${owner}';`),'1');
  assert.equal(await query(`select count(*) from core.identity_blocks_working where owner_id='${owner}';`),'1');
  assert.equal(await query(`select block_id from core.${imported?'identity_block_links_working':'identity_block_texts_working'} where owner_id='${owner}';`),winner.block_id);
  assert.equal(await query(`select position||':'||is_visible::text from core.identity_blocks_working where block_id='${winner.block_id}';`),imported ? '1:true' : '1:false');
  assert.equal(await query(`select ${imported?'destination_url':'text_content'} from core.${imported?'identity_block_links_working':'identity_block_texts_working'} where block_id='${winner.block_id}';`),imported ? 'HTTPS://Private.example.test/Exact?X=1#Recoverable' : 'raw Text <script>recoverable</script>');
  assert.equal(await query(`select count(*) from core.identity_block_texts_working where owner_id='${owner}';`),imported ? '0' : '1');
  assert.equal(await query(`select count(*) from core.identity_block_links_working where owner_id='${owner}';`),imported ? '1' : '0');
  assert.equal(await query(`select count(*) from core.identity_block_initialization_provenance where owner_id='${owner}';`),imported ? '1' : '0');
  if (imported) assert.equal(await query(`select initial_block_id from core.identity_block_initialization_provenance where owner_id='${owner}';`),winner.block_id);
  assert.equal(await query(`select revision||':'||destination_url from core.identity_connection_working where owner_id='${owner}';`),'3:HTTPS://Private.example.test/Exact?X=1#Recoverable');
}
test('competing first Text initializations commit exactly one collection/member/payload without provenance',async () => {
  await reset();
  const call=()=>query(`begin; ${auth} select api.initialize_current_owner_blocks_from_text(${manualIntent}); select pg_sleep(0.3); commit;`).then(result);
  const replies=await Promise.all([call(),call()]);
  assert.deepEqual(replies.map(x=>x.status).sort(),['already_initialized','success']);
  await assertWinner(replies.find(x=>x.status==='success'),false);
});
test('simultaneous manual and source initialization share a single winner',async () => {
  await reset(); const replies=await Promise.all([manual(),importSource()]);
  assert.deepEqual(replies.map(x=>x.status).sort(),['already_initialized','success']);
  await assertWinner(replies.find(x=>x.status==='success'),replies[1].status==='success');
});
for (const imported of [false,true]) {
  test(`${imported?'import':'manual'} winner held before competing initializer preserves exact provenance`,async () => {
    await reset();
    const fn=imported?'initialize_current_owner_blocks_from_connection':'initialize_current_owner_blocks_from_text';
    const held=query(`begin; ${auth} select api.${fn}(${imported?importIntent:manualIntent}); select pg_advisory_xact_lock(1936744812,114); select pg_sleep(1); commit;`);
    try {
      await waitLock(114); const loser=await (imported?manual():importSource());
      assert.deepEqual(loser,{status:'already_initialized'}); await assertWinner(result(await held),imported);
    } finally { await held; }
  });
}
test('restriction committed during manual Owner wait denies all creation',async () => {
  await reset(); const held=query(`begin; update core.owners set account_state='restricted' where id='${owner}'; select pg_advisory_xact_lock(1936744812,115); select pg_sleep(1); commit;`);
  try { await waitLock(115); assert.deepEqual(await manual(),{status:'owner_not_eligible'}); await assertEmpty(); }
  finally { await held; }
});
test('empty collection committed during manual Owner wait conflicts without replacement',async () => {
  await reset(); const held=query(`begin; select id from core.owners where id='${owner}' for update; insert into core.identity_block_collections_working(owner_id) values('${owner}'); select pg_advisory_xact_lock(1936744812,116); select pg_sleep(1); commit;`);
  try {
    await waitLock(116); assert.deepEqual(await manual(),{status:'already_initialized'});
    assert.equal(await query(`select revision from core.identity_block_collections_working where owner_id='${owner}';`),'1');
    assert.equal(await query(`select (select count(*) from core.identity_blocks_working where owner_id='${owner}') +(select count(*) from core.identity_block_links_working where owner_id='${owner}') +(select count(*) from core.identity_block_texts_working where owner_id='${owner}')+(select count(*) from core.identity_block_initialization_provenance where owner_id='${owner}');`),'0');
  } finally { await held; }
});

const linkIntent = `'${JSON.stringify({action:'initialize_link_block',base_collection_revision:null,is_visible:true,link_working:{kind:'social',title:null,social_platform:null,destination_url:'raw Link'}})}'::jsonb`;
const link = () => query(`begin; ${auth} select api.initialize_current_owner_blocks_from_link(${linkIntent}); commit;`).then(result);
async function assertTextOrLink(winner, linked) {
  assert.deepEqual(Object.keys(winner).sort(), ['block_id','collection_revision','status']);
  assert.equal(winner.collection_revision,1);
  assert.equal(await query(`select count(*) from core.identity_blocks_working where owner_id='${owner}';`),'1');
  assert.equal(await query(`select kind||':'||position||':'||is_visible::text from core.identity_blocks_working where block_id='${winner.block_id}';`),linked?'social:1:true':'text:1:false');
  assert.equal(await query(`select count(*) from core.identity_block_texts_working where owner_id='${owner}';`),linked?'0':'1');
  assert.equal(await query(`select count(*) from core.identity_block_links_working where owner_id='${owner}';`),linked?'1':'0');
  assert.equal(await query(`select count(*) from core.identity_block_initialization_provenance where owner_id='${owner}';`),'0');
  assert.equal(await query(`select revision from core.identity_block_collections_working where owner_id='${owner}';`),'1');
  assert.equal(await query(`select ${linked?'destination_url':'text_content'} from core.${linked?'identity_block_links_working':'identity_block_texts_working'} where block_id='${winner.block_id}';`),linked?'raw Link':'raw Text <script>recoverable</script>');
  assert.equal(await query(`select revision||':'||destination_url from core.identity_connection_working where owner_id='${owner}';`),'3:HTTPS://Private.example.test/Exact?X=1#Recoverable');
}
test('simultaneous Text and Link initializers admit one typed winner without conversion',async () => {
  await reset(); const replies=await Promise.all([manual(),link()]);
  assert.deepEqual(replies.map(x=>x.status).sort(),['already_initialized','success']);
  await assertTextOrLink(replies.find(x=>x.status==='success'),replies[1].status==='success');
});
for (const linked of [false,true]) {
  test(`${linked?'Link':'Text'} held winner prevents another initializer from replacing typed content`,async () => {
    await reset(); const fn=linked?'initialize_current_owner_blocks_from_link':'initialize_current_owner_blocks_from_text';
    const held=query(`begin; ${auth} select api.${fn}(${linked?linkIntent:manualIntent}); select pg_advisory_xact_lock(1936744812,151); select pg_sleep(1); commit;`);
    try { await waitLock(151); assert.deepEqual(await (linked?manual():link()),{status:'already_initialized'});
      await assertTextOrLink(result(await held),linked); }
    finally { await held; }
  });
}
test('binding removed while Text waits for Owner is rechecked before any creation',async () => {
  await reset(); const held=query(`begin; select id from core.owners where id='${owner}' for update; select pg_advisory_xact_lock(1936744812,152); select pg_sleep(1); delete from core.owner_auth_bindings where auth_user_id='${actor}'; commit;`);
  try { await waitLock(152); assert.deepEqual(await manual(),{status:'unavailable'}); await assertEmpty(); }
  finally { await held; await query(`insert into core.owner_auth_bindings(auth_user_id,owner_id) values('${actor}','${owner}');`); }
});

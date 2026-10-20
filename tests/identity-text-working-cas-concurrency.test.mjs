import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';

const container = process.env.SPILL_TEST_DB_CONTAINER ?? 'supabase_db_spall-spill';
assert.match(container, /^supabase_db_spall-spill(?:-[a-z0-9-]+)?$/);
assert.ok(process.env.CI || container !== 'supabase_db_spall-spill', 'Text save CAS races require explicitly isolated test database.');
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
const actor = '9f000000-0000-4000-8000-000000000001';
const generic = '9f000000-0000-4000-8000-000000000011';
const social = '9f000000-0000-4000-8000-000000000012';
const auth = `set local request.jwt.claims='{"sub":"${actor}","role":"authenticated"}';`;
const result = output => JSON.parse(output.split('\n').find(line => line.startsWith('{')));
const textBlock = '9f000000-0000-4000-8000-000000000013';
const secondText = '9f000000-0000-4000-8000-000000000019';
function invoke(rpc, input, hold = true) {
  const json = `'${JSON.stringify(input).replaceAll("'", "''")}'::jsonb`;
  return query(`begin; ${auth} select api.${rpc}(${json}); ${hold ? 'select pg_sleep(0.3);' : ''} commit;`).then(result);
}
function save(block, text, hold = true) {
  return invoke('save_current_owner_block_text_working',{block_id:block,base_collection_revision:1,text_working:{kind:'text',text}},hold);
}
const revision = () => query(`select revision from core.identity_block_collections_working where owner_id='${owner}';`);
const content = block => query(`select coalesce(text_content,'<null>') from core.identity_block_texts_working where block_id='${block}';`);
before(async () => {
  await query('create extension if not exists pgtap with schema extensions;');
  const fixture = readFileSync(new URL('../supabase/tests/database/054_owner_text_working_cas.test.sql', import.meta.url),'utf8');
  const marker = '\n-- Text save CAS race fixtures end here.\n'; assert.ok(fixture.includes(marker));
  const prefix = fixture.split(marker)[0]; assert.ok(prefix.startsWith('begin;'));
  const output = await query(prefix.replace('begin;', 'begin; set local search_path=public,extensions;') + '\nselect * from finish(); commit;');
  assert.doesNotMatch(output, /not ok/);
  owner = await query(`select owner_id from core.owner_auth_bindings where auth_user_id='${actor}';`);
  assert.match(owner, /^[a-f0-9-]{36}$/);
  fixtureOwners = (await query("select owner_id from core.owner_auth_bindings where auth_user_id in ('9f000000-0000-4000-8000-000000000001','9f000000-0000-4000-8000-000000000002','9f000000-0000-4000-8000-000000000003');")).split('\n');
  assert.equal(fixtureOwners.length, 3); for (const id of fixtureOwners) assert.match(id, /^[a-f0-9-]{36}$/);
});
after(async () => {
  await query(`delete from auth.users where id in ('${actor}','9f000000-0000-4000-8000-000000000002','9f000000-0000-4000-8000-000000000003');`);
  // Retain permanent Owner/Handle identities; remove only this isolated fixture's Working records.
  if (fixtureOwners.length === 3) {
    const scoped = fixtureOwners.map(id => `'${id}'`).join(',');
    await query(`delete from core.identity_block_collections_working where owner_id in (${scoped}); delete from core.identity_connection_working where owner_id in (${scoped});`);
  }
});
async function reset() {
  await query(`update core.owners set account_state='active' where id='${owner}';
    update core.identity_block_collections_working set revision=1 where owner_id='${owner}';
    delete from core.identity_blocks_working where owner_id='${owner}';
    insert into core.identity_blocks_working(block_id,owner_id,kind,position,is_visible) values
      ('${generic}','${owner}','generic_link',1,false),('${social}','${owner}','social',7,true),
      ('${textBlock}','${owner}','text',42,true),('${secondText}','${owner}','text',1100,false);
    insert into core.identity_block_links_working(block_id,owner_id,kind,title,social_platform,destination_url)
      values('${generic}','${owner}','generic_link','original',null,'https://original.example.test');
    insert into core.identity_block_texts_working(block_id,owner_id,kind,text_content)
      values('${textBlock}','${owner}','text','original');`);
}
async function waitLock(sentinel) {
  for (let i = 0; i < 30; i++) {
    if (await query(`select exists(select 1 from pg_locks where locktype='advisory' and classid=1936744812 and objid=${sentinel} and objsubid=2 and granted);`) === 't') return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.fail('Holding transaction did not acquire row lock before sentinel');
}

test('same Text/base has one winner without stale overwrite', async () => {
  await reset(); const texts = ['first','second']; const replies = await Promise.all(texts.map(text => save(textBlock,text)));
  assert.deepEqual(replies.map(x=>x.status).sort(),['stale_write','success']);
  assert.equal(await content(textBlock),texts[replies.findIndex(x=>x.status==='success')]);
  assert.equal(await revision(),'2');
});
test('different Text members share collection CAS; missing loser payload stays absent', async () => {
  await reset(); const replies = await Promise.all([save(textBlock,'first'),save(secondText,'second')]);
  assert.deepEqual(replies.map(x=>x.status).sort(),['stale_write','success']);
  assert.equal(await content(textBlock),replies[0].status==='success'?'first':'original');
  assert.equal(await content(secondText),replies[1].status==='success'?'second':'');
  assert.equal(await revision(),'2');
});
const competitors = [
  {name:'Link content save',rpc:'save_current_owner_block_link_working',input:{block_id:generic,base_collection_revision:1,
    link_working:{kind:'generic_link',title:'Link winner',social_platform:null,destination_url:null}},kind:'link'},
  {name:'Text allocation',rpc:'add_current_owner_text_block_working',input:{action:'add_text_block',base_collection_revision:1,is_visible:false,text_working:{kind:'text',text:'new Text'}},kind:'text-add'},
  {name:'Link allocation',rpc:'add_current_owner_link_block_working',input:{action:'add_link_block',base_collection_revision:1,is_visible:false,link_working:{kind:'generic_link',title:'new Link',social_platform:null,destination_url:null}},kind:'link-add'},
  {name:'Text visibility',rpc:'save_current_owner_block_visibility_working',input:{block_id:textBlock,base_collection_revision:1,is_visible:false},kind:'visibility'},
  {name:'Text move',rpc:'move_current_owner_block_working',input:{block_id:textBlock,base_collection_revision:1,direction:'up'},kind:'move'},
  {name:'Text removal',rpc:'remove_current_owner_block_working',input:{block_id:textBlock,base_collection_revision:1,confirm_removal:true},kind:'remove'},
];
for (const action of competitors) {
  test(`Text save versus ${action.name} has one aggregate winner with exact state`,async()=>{
    await reset(); const [saved,other]=await Promise.all([save(textBlock,'Text winner'),invoke(action.rpc,action.input)]);
    assert.deepEqual([saved.status,other.status].sort(),['stale_write','success']);
    const won=saved.status==='success'; assert.equal(await revision(),'2');
    assert.equal(await content(textBlock),won?'Text winner':action.kind==='remove'?'':'original');
    assert.equal(await query(`select source_connection_revision from core.identity_block_initialization_provenance where owner_id='${owner}';`),'3');
    if(action.kind==='link')assert.equal(await query(`select title from core.identity_block_links_working where block_id='${generic}';`),won?'original':'Link winner');
    if(action.kind.endsWith('-add')){
      assert.equal(await query(`select count(*) from core.identity_blocks_working where owner_id='${owner}';`),won?'4':'5');
      if(!won){
        assert.match(other.block_id,/^[a-f0-9-]{36}$/);
        assert.equal(await query(`select count(*) from core.identity_blocks_working where block_id='${other.block_id}' and owner_id='${owner}';`),'1');
        if(action.kind==='text-add')assert.equal(await content(other.block_id),'new Text');
        else assert.equal(await query(`select title from core.identity_block_links_working where block_id='${other.block_id}';`),'new Link');
      }
    }
    if(action.kind==='visibility')assert.equal(await query(`select is_visible from core.identity_blocks_working where block_id='${textBlock}';`),won?'t':'f');
    if(action.kind==='move')assert.equal(await query(`select string_agg(right(block_id::text,2),',' order by position) from core.identity_blocks_working where owner_id='${owner}';`),won?'11,12,13,19':'11,13,12,19');
    if(action.kind==='remove')assert.equal(await query(`select count(*) from core.identity_blocks_working where block_id='${textBlock}';`),won?'1':'0');
  });
}
test('collection advance during wait rejects stale Text without changing payload',async()=>{
  await reset();const held=query(`begin;update core.identity_block_collections_working set revision=2 where owner_id='${owner}';select pg_advisory_xact_lock(1936744812,1471);select pg_sleep(2);commit;`);
  try{await waitLock(1471);assert.deepEqual(await save(textBlock,'stale',false),{status:'stale_write'});
    assert.equal(await content(textBlock),'original');assert.equal(await revision(),'2');}finally{await held;}
});
test('restriction while waiting Owner denies Text save with no bump',async()=>{
  await reset();const held=query(`begin;update core.owners set account_state='restricted' where id='${owner}';select pg_advisory_xact_lock(1936744812,1472);select pg_sleep(2);commit;`);
  try{await waitLock(1472);assert.deepEqual(await save(textBlock,'denied',false),{status:'owner_not_eligible'});
    assert.equal(await content(textBlock),'original');assert.equal(await revision(),'1');}finally{await held;}
});

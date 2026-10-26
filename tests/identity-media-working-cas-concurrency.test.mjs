import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';

const container = process.env.SPILL_TEST_DB_CONTAINER ?? 'supabase_db_spall-spill';
assert.match(container, /^supabase_db_spall-spill(?:-[a-z0-9-]+)?$/);
assert.ok(process.env.CI || container !== 'supabase_db_spall-spill', 'Media save CAS races require explicitly isolated test database.');
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
const actor = '22900000-0000-4000-8000-000000000001';
const generic = '22900000-0000-4000-8000-000000000011';
const social = '22900000-0000-4000-8000-000000000012';
const auth = `set local request.jwt.claims='{"sub":"${actor}","role":"authenticated"}';`;
const result = output => JSON.parse(output.split('\n').find(line => line.startsWith('{')));
const mediaBlock = '22900000-0000-4000-8000-000000000013';
const secondMedia = '22900000-0000-4000-8000-000000000019';
function invoke(rpc, input, hold = true) {
  const json = `'${JSON.stringify(input).replaceAll("'", "''")}'::jsonb`;
  return query(`begin; ${auth} select api.${rpc}(${json}); ${hold ? 'select pg_sleep(0.3);' : ''} commit;`).then(result);
}
const asset = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function save(block, text, hold = true, key = asset) {
  return invoke('save_current_owner_block_media_working',{block_id:block,base_collection_revision:1,media_working:{kind:'media',asset_key:key,alt_text:text}},hold);
}
const revision = () => query(`select revision from core.identity_block_collections_working where owner_id='${owner}';`);
const content = block => query(`select coalesce(alt_text,'<null>') from core.identity_block_media_working where block_id='${block}';`);
const payload = block => query(`select jsonb_build_object('asset_key',asset_key,'alt_text',alt_text) from core.identity_block_media_working where block_id='${block}';`).then(value=>value?JSON.parse(value):null);
const originalPayload={asset_key:null,alt_text:'original'};
const savedPayload=value=>({asset_key:asset,alt_text:value});
before(async () => {
  await query('create extension if not exists pgtap with schema extensions;');
  const fixture = readFileSync(new URL('../supabase/tests/database/063_owner_media_working_cas.test.sql', import.meta.url),'utf8');
  const marker = '\n-- Media save CAS race fixtures end here.\n'; assert.ok(fixture.includes(marker));
  const prefix = fixture.split(marker)[0]; assert.ok(prefix.startsWith('begin;'));
  const output = await query(prefix.replace('begin;', 'begin; set local search_path=public,extensions;') + '\nselect * from finish(); commit;');
  assert.doesNotMatch(output, /not ok/);
  owner = await query(`select owner_id from core.owner_auth_bindings where auth_user_id='${actor}';`);
  assert.match(owner, /^[a-f0-9-]{36}$/);
  fixtureOwners = (await query("select owner_id from core.owner_auth_bindings where auth_user_id in ('22900000-0000-4000-8000-000000000001','22900000-0000-4000-8000-000000000002','22900000-0000-4000-8000-000000000003');")).split('\n');
  assert.equal(fixtureOwners.length, 3); for (const id of fixtureOwners) assert.match(id, /^[a-f0-9-]{36}$/);
});
after(async () => {
  await query(`delete from core.identity_blocks_working where owner_id='${owner}'; delete from core.profile_media_assets where source_upload_intent_id in ('${actor}','22900000-0000-4000-8000-000000000002'); delete from core.profile_media_upload_intents where id in ('${actor}','22900000-0000-4000-8000-000000000002');`);
  await query(`delete from auth.users where id in ('${actor}','22900000-0000-4000-8000-000000000002','22900000-0000-4000-8000-000000000003');`);
  // Retain permanent Owner/Handle identities; remove only this isolated fixture's Working records.
  if (fixtureOwners.length === 3) {
    const scoped = fixtureOwners.map(id => `'${id}'`).join(',');
    await query(`delete from core.identity_block_collections_working where owner_id in (${scoped}); delete from core.identity_connection_working where owner_id in (${scoped});`);
  }
});
async function reset() {
  await query(`update core.owners set account_state='active' where id='${owner}';
    update core.profile_media_assets set byte_size=12 where asset_key='${asset}';
    update core.profile_media_upload_intents set status='consumed',consumed_at=now() where id='${actor}';
    update core.identity_block_collections_working set revision=1 where owner_id='${owner}';
    delete from core.identity_blocks_working where owner_id='${owner}';
    insert into core.identity_blocks_working(block_id,owner_id,kind,position,is_visible) values
      ('${generic}','${owner}','generic_link',1,false),('${social}','${owner}','social',7,true),
      ('${mediaBlock}','${owner}','media',42,true),('${secondMedia}','${owner}','media',1100,false),
      ('22900000-0000-4000-8000-000000000020','${owner}','text',2000,true),
      ('22900000-0000-4000-8000-000000000022','${owner}','contact',2100,true);
    insert into core.identity_block_links_working(block_id,owner_id,kind,title,social_platform,destination_url)
      values('${generic}','${owner}','generic_link','original',null,'https://original.example.test');
    insert into core.identity_block_media_working(block_id,owner_id,kind,alt_text)
      values('${mediaBlock}','${owner}','media','original');
    insert into core.identity_block_texts_working(block_id,owner_id,kind,text_content)
      values('22900000-0000-4000-8000-000000000020','${owner}','text','Original Text');
    insert into core.identity_block_contacts_working(block_id,owner_id,kind,contact_value)
      values('22900000-0000-4000-8000-000000000022','${owner}','contact','Original Contact');`);
}
async function waitLock(sentinel) {
  for (let i = 0; i < 30; i++) {
    if (await query(`select exists(select 1 from pg_locks where locktype='advisory' and classid=1936744812 and objid=${sentinel} and objsubid=2 and granted);`) === 't') return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.fail('Holding transaction did not acquire row lock before sentinel');
}

test('same Media/base has one winner without stale overwrite', async () => {
  await reset(); const texts = ['first','second']; const replies = await Promise.all(texts.map(text => save(mediaBlock,text)));
  assert.deepEqual(replies.map(x=>x.status).sort(),['stale_write','success']);
  assert.equal(await content(mediaBlock),texts[replies.findIndex(x=>x.status==='success')]);
  assert.deepEqual(await payload(mediaBlock),savedPayload(texts[replies.findIndex(x=>x.status==='success')]));
  assert.equal(await revision(),'2');
});
test('different Media members share collection CAS; missing loser payload stays absent', async () => {
  await reset(); const replies = await Promise.all([save(mediaBlock,'first'),save(secondMedia,'second')]);
  assert.deepEqual(replies.map(x=>x.status).sort(),['stale_write','success']);
  assert.equal(await content(mediaBlock),replies[0].status==='success'?'first':'original');
  assert.equal(await content(secondMedia),replies[1].status==='success'?'second':'');
  assert.deepEqual(await payload(mediaBlock),replies[0].status==='success'?savedPayload('first'):originalPayload);
  assert.deepEqual(await payload(secondMedia),replies[1].status==='success'?savedPayload('second'):null);
  assert.equal(await revision(),'2');
});
const competitors = [
  {name:'Contact content save',rpc:'save_current_owner_block_contact_working',input:{block_id:'22900000-0000-4000-8000-000000000022',base_collection_revision:1,contact_working:{kind:'contact',contact_type:null,label:null,value:'Contact winner'}},kind:'contact-save'},
  {name:'Text content save',rpc:'save_current_owner_block_text_working',input:{block_id:'22900000-0000-4000-8000-000000000020',base_collection_revision:1,text_working:{kind:'text',text:'Text winner'}},kind:'text-save'},
  {name:'Contact allocation',rpc:'add_current_owner_contact_block_working',input:{action:'add_contact_block',base_collection_revision:1,is_visible:false,contact_working:{kind:'contact',contact_type:null,label:null,value:'new Contact'}},kind:'contact-add'},
  {name:'Link content save',rpc:'save_current_owner_block_link_working',input:{block_id:generic,base_collection_revision:1,
    link_working:{kind:'generic_link',title:'Link winner',social_platform:null,destination_url:null}},kind:'link'},
  {name:'Text allocation',rpc:'add_current_owner_text_block_working',input:{action:'add_text_block',base_collection_revision:1,is_visible:false,text_working:{kind:'text',text:'new Text'}},kind:'text-add'},
  {name:'Link allocation',rpc:'add_current_owner_link_block_working',input:{action:'add_link_block',base_collection_revision:1,is_visible:false,link_working:{kind:'generic_link',title:'new Link',social_platform:null,destination_url:null}},kind:'link-add'},
  {name:'Media visibility',rpc:'save_current_owner_block_visibility_working',input:{block_id:mediaBlock,base_collection_revision:1,is_visible:false},kind:'visibility'},
  {name:'Media move',rpc:'move_current_owner_block_working',input:{block_id:mediaBlock,base_collection_revision:1,direction:'up'},kind:'move'},
  {name:'Media removal',rpc:'remove_current_owner_block_working',input:{block_id:mediaBlock,base_collection_revision:1,confirm_removal:true},kind:'remove'},
];
for (const action of competitors) {
  test(`Media save versus ${action.name} has one aggregate winner with exact state`,async()=>{
    await reset(); const [saved,other]=await Promise.all([save(mediaBlock,'Media winner'),invoke(action.rpc,action.input)]);
    assert.deepEqual([saved.status,other.status].sort(),['stale_write','success']);
    const won=saved.status==='success'; assert.equal(await revision(),'2');
    assert.equal(await content(mediaBlock),won?'Media winner':action.kind==='remove'?'':'original');
    assert.equal(await query(`select text_content from core.identity_block_texts_working where block_id='22900000-0000-4000-8000-000000000020';`),!won&&action.kind==='text-save'?'Text winner':'Original Text');
    assert.deepEqual(await payload(mediaBlock),won?savedPayload('Media winner'):action.kind==='remove'?null:originalPayload);
    assert.equal(await query(`select contact_value from core.identity_block_contacts_working where block_id='22900000-0000-4000-8000-000000000022';`),!won&&action.kind==='contact-save'?'Contact winner':'Original Contact');
    if(action.kind==='link')assert.equal(await query(`select title from core.identity_block_links_working where block_id='${generic}';`),won?'original':'Link winner');
    if(action.kind.endsWith('-add')){
      assert.equal(await query(`select count(*) from core.identity_blocks_working where owner_id='${owner}';`),won?'6':'7');
      if(!won){
        assert.match(other.block_id,/^[a-f0-9-]{36}$/);
        assert.equal(await query(`select count(*) from core.identity_blocks_working where block_id='${other.block_id}' and owner_id='${owner}';`),'1');
        if(action.kind==='text-add')assert.equal(await query(`select text_content from core.identity_block_texts_working where block_id='${other.block_id}';`),'new Text');
        else if(action.kind==='contact-add')assert.equal(await query(`select contact_value from core.identity_block_contacts_working where block_id='${other.block_id}';`),'new Contact');
        else assert.equal(await query(`select title from core.identity_block_links_working where block_id='${other.block_id}';`),'new Link');
      }
    }
    if(action.kind==='visibility')assert.equal(await query(`select is_visible from core.identity_blocks_working where block_id='${mediaBlock}';`),won?'t':'f');
    if(action.kind==='move')assert.equal(await query(`select string_agg(right(block_id::text,2),',' order by position) from core.identity_blocks_working where owner_id='${owner}';`),won?'11,12,13,19,20,22':'11,13,12,19,20,22');
    if(action.kind==='remove')assert.equal(await query(`select count(*) from core.identity_blocks_working where block_id='${mediaBlock}';`),won?'1':'0');
  });
}
test('collection advance during wait rejects stale Media without changing payload',async()=>{
  await reset();const held=query(`begin;update core.identity_block_collections_working set revision=2 where owner_id='${owner}';select pg_advisory_xact_lock(1936744812,2291);select pg_sleep(2);commit;`);
  try{await waitLock(2291);assert.deepEqual(await save(mediaBlock,'stale',false),{status:'stale_write'});
    assert.equal(await content(mediaBlock),'original');assert.deepEqual(await payload(mediaBlock),originalPayload);assert.equal(await revision(),'2');}finally{await held;}
});
test('restriction while waiting Owner denies Media save with no bump',async()=>{
  await reset();const held=query(`begin;update core.owners set account_state='restricted' where id='${owner}';select pg_advisory_xact_lock(1936744812,2292);select pg_sleep(2);commit;`);
  try{await waitLock(2292);assert.deepEqual(await save(mediaBlock,'denied',false),{status:'owner_not_eligible'});
    assert.equal(await content(mediaBlock),'original');assert.deepEqual(await payload(mediaBlock),originalPayload);assert.equal(await revision(),'1');}finally{await held;}
});

for (const dependency of ['asset','intent']) {
  test(`${dependency} change while waiting denies stale canonical selection without bump`,async()=>{
    await reset();
    const sql=dependency==='asset'
      ? `update core.profile_media_assets set byte_size=11 where asset_key='${asset}';`
      : `update core.profile_media_upload_intents set status='rejected',consumed_at=null where id='${actor}';`;
    const held=query(`begin;${sql}select pg_advisory_xact_lock(1936744812,2293);select pg_sleep(2);commit;`);
    try { await waitLock(2293);
      assert.deepEqual(await save(mediaBlock,'denied',false),{status:'invalid_asset'});
      assert.deepEqual(await payload(mediaBlock),originalPayload);assert.equal(await revision(),'1');
    } finally {await held;}
  });
  test(`Media save retains ${dependency} share lock until commit`,async()=>{
    await reset();
    const input={block_id:mediaBlock,base_collection_revision:1,media_working:{kind:'media',asset_key:asset,alt_text:'locked'}};
    const held=query(`begin;${auth}select api.save_current_owner_block_media_working('${JSON.stringify(input)}'::jsonb);select pg_advisory_xact_lock(1936744812,2294);select pg_sleep(2);commit;`);
    try {await waitLock(2294);
      const table=dependency==='asset'?'profile_media_assets':'profile_media_upload_intents';
      const predicate=dependency==='asset'?`asset_key='${asset}'`:`id='${actor}'`;
      // NOWAIT deterministically proves the lock is held; no timing-only elapsed assertion.
      await assert.rejects(query(`begin;select 1 from core.${table} where ${predicate} for update nowait;rollback;`),/could not obtain lock/);
    } finally {await held;}
    assert.deepEqual(await payload(mediaBlock),savedPayload('locked'));assert.equal(await revision(),'2');
  });
}

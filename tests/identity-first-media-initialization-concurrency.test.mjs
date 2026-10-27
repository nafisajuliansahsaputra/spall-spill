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
const asset='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const actor = '23300000-0000-4000-8000-000000000001';
const importIntent = `'${JSON.stringify({ action: 'import_onboarding_connection', source_revision: 3, title: null, base_collection_revision: null })}'::jsonb`;
const auth = `set local request.jwt.claims='{"sub":"${actor}","role":"authenticated"}';`;
const result = output => JSON.parse(output.split('\n').find(line => line.startsWith('{')));
before(async () => {
  await query('create extension if not exists pgtap with schema extensions;');
  const fixture = readFileSync(new URL('../supabase/tests/database/065_owner_first_media_initialization.test.sql', import.meta.url),'utf8');
  const marker = '\n-- First Media initialization race fixtures end here.\n'; assert.ok(fixture.includes(marker));
  const prefix = fixture.split(marker)[0]; assert.ok(prefix.startsWith('begin;'));
  const output = await query(prefix.replace('begin;', 'begin; set local search_path=public,extensions;') + '\nselect * from finish(); commit;');
  assert.doesNotMatch(output, /not ok/);
  owner = await query(`select owner_id from core.owner_auth_bindings where auth_user_id='${actor}';`);
  assert.match(owner, /^[a-f0-9-]{36}$/);
  fixtureOwners = (await query("select owner_id from core.owner_auth_bindings where auth_user_id in ('23300000-0000-4000-8000-000000000001','23300000-0000-4000-8000-000000000002','23300000-0000-4000-8000-000000000003');")).split('\n');
  assert.equal(fixtureOwners.length, 3); for (const id of fixtureOwners) assert.match(id, /^[a-f0-9-]{36}$/);
});
after(async () => {
  await query(`delete from auth.users where id in ('${actor}','23300000-0000-4000-8000-000000000002','23300000-0000-4000-8000-000000000003');`);
  // Permanent Owner/Handle identity is retained. Remove only isolated fixture Working data.
  if (fixtureOwners.length === 3) {
    const scoped = fixtureOwners.map(id => `'${id}'`).join(',');
    await query(`delete from core.identity_block_collections_working where owner_id in (${scoped}); delete from core.identity_connection_working where owner_id in (${scoped}); delete from core.profile_media_assets where owner_id in (${scoped}); delete from core.profile_media_upload_intents where owner_id in (${scoped});`);
  }
});
async function reset() {
  await query(`delete from core.identity_block_collections_working where owner_id='${owner}';
    update core.identity_connection_working set revision=3,destination_url='HTTPS://Private.example.test/Exact?X=1#Recoverable' where owner_id='${owner}';
    update core.profile_media_assets set byte_size=12 where owner_id='${owner}';
    update core.profile_media_upload_intents set status='consumed',consumed_at=now() where id='${actor}';
    update core.owners set account_state='active' where id='${owner}';`);
}
async function assertEmpty() {
  for (const table of ['identity_block_collections_working','identity_blocks_working','identity_block_links_working','identity_block_texts_working','identity_block_media_working','identity_block_contacts_working','identity_block_initialization_provenance']) {
    assert.equal(await query(`select count(*) from core.${table} where owner_id='${owner}';`),'0');
  }
}
async function waitLock(sentinel) {
  for (let i=0;i<30;i++) {
    if (await query(`select exists(select 1 from pg_locks where locktype='advisory' and classid=1936744812 and objid=${sentinel} and objsubid=2 and granted);`) === 't') return;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.fail('Holding transaction did not acquire row lock before sentinel');
}
const mediaWorking={kind:'media',asset_key:asset,alt_text:'raw Media <script>recoverable</script>'};
const sqlJson=value=>`'${JSON.stringify(value).replaceAll("'","''")}'::jsonb`;
const mediaIntent=sqlJson({action:'initialize_media_block',base_collection_revision:null,is_visible:false,media_working:mediaWorking});
const textIntent=sqlJson({action:'initialize_text_block',base_collection_revision:null,is_visible:true,text_working:{kind:'text',text:'raw Text'}});
const linkIntent=sqlJson({action:'initialize_link_block',base_collection_revision:null,is_visible:true,link_working:{kind:'social',title:null,social_platform:null,destination_url:'raw Link'}});
const contactIntent=sqlJson({action:'initialize_contact_block',base_collection_revision:null,is_visible:true,contact_working:{kind:'contact',contact_type:'email',label:null,value:'raw Contact'}});
const initializers={contact:['initialize_current_owner_blocks_from_contact',contactIntent],media:['initialize_current_owner_blocks_from_media',mediaIntent],text:['initialize_current_owner_blocks_from_text',textIntent],link:['initialize_current_owner_blocks_from_link',linkIntent],import:['initialize_current_owner_blocks_from_connection',importIntent]};
const invoke=(type)=>{const [fn,intent]=initializers[type];return query(`begin; ${auth} select api.${fn}(${intent}); commit;`).then(result);};
async function assertWinner(winner,type,expected=mediaWorking) {
  assert.deepEqual(Object.keys(winner).sort(),['block_id','collection_revision','status']);
  assert.equal(winner.status,'success'); assert.equal(winner.collection_revision,1);
  assert.match(winner.block_id,/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
  assert.equal(await query(`select revision from core.identity_block_collections_working where owner_id='${owner}';`),'1');
  assert.equal(await query(`select count(*) from core.identity_blocks_working where owner_id='${owner}';`),'1');
  assert.equal(await query(`select kind||':'||position||':'||is_visible::text from core.identity_blocks_working where block_id='${winner.block_id}' and owner_id='${owner}';`),{media:'media:1:false',contact:'contact:1:true',text:'text:1:true',link:'social:1:true',import:'generic_link:1:true'}[type]);
  for (const [kind,table] of [['media','identity_block_media_working'],['contact','identity_block_contacts_working'],['text','identity_block_texts_working'],['link','identity_block_links_working']]) {
    const hasPayload=kind===type || (kind==='link' && type==='import');
    assert.equal(await query(`select count(*) from core.${table} where owner_id='${owner}';`),hasPayload?'1':'0');
    if (hasPayload) assert.equal(await query(`select block_id from core.${table} where owner_id='${owner}';`),winner.block_id);
  }
  if (type==='media') {
    const raw=await query(`select jsonb_build_object('kind',kind,'asset_key',asset_key,'alt_text',alt_text) from core.identity_block_media_working where block_id='${winner.block_id}';`);
    assert.deepEqual(JSON.parse(raw),expected);
  } else if(type==='contact') {
    assert.deepEqual(JSON.parse(await query(`select jsonb_build_object('kind',kind,'contact_type',contact_type,'label',label,'value',contact_value) from core.identity_block_contacts_working where block_id='${winner.block_id}';`)),{kind:'contact',contact_type:'email',label:null,value:'raw Contact'});
  } else {
    const table=type==='text'?'identity_block_texts_working':'identity_block_links_working';
    const column=type==='text'?'text_content':'destination_url';
    assert.equal(await query(`select ${column} from core.${table} where block_id='${winner.block_id}';`),{text:'raw Text',link:'raw Link',import:'HTTPS://Private.example.test/Exact?X=1#Recoverable'}[type]);
  }
  assert.equal(await query(`select count(*) from core.identity_block_initialization_provenance where owner_id='${owner}';`),type==='import'?'1':'0');
  if (type==='import') {
    const provenance=await query(`select jsonb_build_object('block_id',initial_block_id,'revision',source_connection_revision,'kind',source_connection_kind,'url',source_destination_url) from core.identity_block_initialization_provenance where owner_id='${owner}';`);
    assert.deepEqual(JSON.parse(provenance),{block_id:winner.block_id,revision:3,kind:'generic_link',url:'HTTPS://Private.example.test/Exact?X=1#Recoverable'});
  }
  assert.equal(await query(`select revision||':'||destination_url from core.identity_connection_working where owner_id='${owner}';`),'3:HTTPS://Private.example.test/Exact?X=1#Recoverable');
}
test('competing first Media tuples commit exactly one whole payload and no provenance',async()=>{
  await reset();
  const alternative={kind:'media',asset_key:null,alt_text:'different raw Media'};
  const call=working=>query(`begin; ${auth} select api.initialize_current_owner_blocks_from_media(${sqlJson({action:'initialize_media_block',base_collection_revision:null,is_visible:false,media_working:working})}); select pg_sleep(0.3); commit;`).then(result);
  const replies=await Promise.all([call(mediaWorking),call(alternative)]);
  assert.deepEqual(replies.map(x=>x.status).sort(),['already_initialized','success']);
  const index=replies.findIndex(x=>x.status==='success');
  await assertWinner(replies[index],'media',index===0?mediaWorking:alternative);
});
for (const other of ['import','text','link','contact']) {
  test(`simultaneous Media and ${other} initialization admit one typed winner`,async()=>{
    await reset(); const replies=await Promise.all([invoke('media'),invoke(other)]);
    assert.deepEqual(replies.map(x=>x.status).sort(),['already_initialized','success']);
    await assertWinner(replies.find(x=>x.status==='success'),replies[0].status==='success'?'media':other);
  });
  for (const mediaWins of [false,true]) {
    test(`${mediaWins?'Media':other} held winner prevents competing initialization conversion`,async()=>{
      await reset(); const type=mediaWins?'media':other; const [fn,intent]=initializers[type];
      const held=query(`begin; ${auth} select api.${fn}(${intent}); select pg_advisory_xact_lock(1936744812,196); select pg_sleep(1); commit;`);
      try {
        await waitLock(196); assert.deepEqual(await invoke(mediaWins?other:'media'),{status:'already_initialized'});
        await assertWinner(result(await held),type);
      } finally {await held;}
    });
  }
}
test('restriction committed during Media Owner wait denies all creation',async()=>{
  await reset(); const held=query(`begin; update core.owners set account_state='restricted' where id='${owner}'; select pg_advisory_xact_lock(1936744812,197); select pg_sleep(1); commit;`);
  try {await waitLock(197); assert.deepEqual(await invoke('media'),{status:'owner_not_eligible'}); await assertEmpty();}
  finally {await held;}
});
test('empty collection committed during Media Owner wait conflicts without replacement',async()=>{
  await reset(); const held=query(`begin; select id from core.owners where id='${owner}' for update; insert into core.identity_block_collections_working(owner_id) values('${owner}'); select pg_advisory_xact_lock(1936744812,198); select pg_sleep(1); commit;`);
  try {
    await waitLock(198); assert.deepEqual(await invoke('media'),{status:'already_initialized'});
    assert.equal(await query(`select revision from core.identity_block_collections_working where owner_id='${owner}';`),'1');
    for(const table of ['identity_blocks_working','identity_block_links_working','identity_block_texts_working','identity_block_media_working','identity_block_contacts_working','identity_block_initialization_provenance']) assert.equal(await query(`select count(*) from core.${table} where owner_id='${owner}';`),'0');
  } finally {await held;}
});
test('binding removed while Media waits for Owner is rechecked before creation',async()=>{
  await reset(); const held=query(`begin; select id from core.owners where id='${owner}' for update; select pg_advisory_xact_lock(1936744812,199); select pg_sleep(1); delete from core.owner_auth_bindings where auth_user_id='${actor}'; commit;`);
  try {await waitLock(199); assert.deepEqual(await invoke('media'),{status:'unavailable'}); await assertEmpty();}
  finally {await held; await query(`insert into core.owner_auth_bindings(auth_user_id,owner_id) values('${actor}','${owner}');`);}
});

for(const dependency of ['asset','intent']){
 test(`${dependency} invalidation while first Media waits creates no collection`,async()=>{
  await reset();const sql=dependency==='asset'?`update core.profile_media_assets set byte_size=11 where asset_key='${asset}';`:`update core.profile_media_upload_intents set status='rejected',consumed_at=null where id='${actor}';`;
  const held=query(`begin;${sql}select pg_advisory_xact_lock(1936744812,2331);select pg_sleep(2);commit;`);
  try{await waitLock(2331);assert.deepEqual(await invoke('media'),{status:'invalid_asset'});await assertEmpty();}finally{await held;}
 });
 test(`first Media retains ${dependency} share lock through commit`,async()=>{
  await reset();const held=query(`begin;${auth}select api.initialize_current_owner_blocks_from_media(${mediaIntent});select pg_advisory_xact_lock(1936744812,2332);select pg_sleep(2);commit;`);
  try{await waitLock(2332);const table=dependency==='asset'?'profile_media_assets':'profile_media_upload_intents';const predicate=dependency==='asset'?`asset_key='${asset}'`:`id='${actor}'`;
   await assert.rejects(query(`begin;select 1 from core.${table} where ${predicate} for update nowait;rollback;`),/could not obtain lock/);
  }finally{await held;}await assertWinner(result(await held),'media');
 });
}

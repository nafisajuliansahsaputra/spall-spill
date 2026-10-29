import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { before, beforeEach, after, test } from 'node:test';

const container = process.env.SPILL_TEST_DB_CONTAINER ?? 'supabase_db_spall-spill';
assert.match(container, /^supabase_db_spall-spill(?:-[a-z0-9-]+)?$/);
assert.ok(process.env.CI || container !== 'supabase_db_spall-spill', 'Profile text races require explicitly isolated test database.');
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
let fixtureOwners=[];
const actor='24900000-0000-4000-8000-000000000001';
const auth=`set local request.jwt.claims='{"sub":"${actor}","role":"authenticated"}';`;
const start={expected_collection_revision:null,after_position:null};
const result=output=>JSON.parse(output.split('\n').find(line=>line.startsWith('{')));
const read=request=>query(`begin; ${auth} select api.resolve_current_owner_editable_identity_working_page('${JSON.stringify(request)}'::jsonb); commit;`).then(result);
before(async()=>{
  await query('create extension if not exists pgtap with schema extensions;');
  const fixture=readFileSync(new URL('../supabase/tests/database/071_owner_profile_photo_working.test.sql',import.meta.url),'utf8');
  const marker='\n-- Profile photo CAS fixtures end here.\n';assert.ok(fixture.includes(marker));
  const prefix=fixture.split(marker)[0];assert.ok(prefix.startsWith('begin;'));
  const output=await query(prefix.replace('begin;','begin; set local search_path=public,extensions;')+'\nselect * from finish(); commit;');
  assert.doesNotMatch(output,/not ok/);
  fixtureOwners=(await query("select owner_id from core.owner_auth_bindings where auth_user_id in ('24900000-0000-4000-8000-000000000001','24900000-0000-4000-8000-000000000002');")).split('\n');
  assert.equal(fixtureOwners.length,2);for(const id of fixtureOwners)assert.match(id,/^[a-f0-9-]{36}$/);
  owner=await query(`select owner_id from core.owner_auth_bindings where auth_user_id='${actor}';`);assert.match(owner,/^[a-f0-9-]{36}$/);
});
after(async()=>{
  await query("delete from auth.users where id in ('24900000-0000-4000-8000-000000000001','24900000-0000-4000-8000-000000000002');");
  // Preserve permanent fixture Owner/Handle identity; remove only isolated Working fixture data.
  if(fixtureOwners.length===2)await query(`delete from core.identity_block_collections_working where owner_id in (${fixtureOwners.map(id=>`'${id}'`).join(',')});
    delete from core.identity_connection_working where owner_id in (${fixtureOwners.map(id=>`'${id}'`).join(',')});
    delete from core.identity_layout_working where owner_id in (${fixtureOwners.map(id=>`'${id}'`).join(',')});
    delete from core.identity_working where owner_id in (${fixtureOwners.map(id=>`'${id}'`).join(',')});
    delete from core.profile_media_assets where owner_id in (${fixtureOwners.map(id=>`'${id}'`).join(',')});
    delete from core.profile_media_upload_intents where owner_id in (${fixtureOwners.map(id=>`'${id}'`).join(',')});`);
});
const actors=[actor,'24900000-0000-4000-8000-000000000002'];
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',C='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const authFor=sub=>`set local request.jwt.claims='{"sub":"${sub}","role":"authenticated"}';`;
const photo=(key,source=2,text=1,sub=actor)=>query(`begin; ${authFor(sub)} select api.save_current_owner_profile_photo_working('${JSON.stringify({action:'save_profile_photo_working',base_profile_revision:source,base_text_revision:text,profile_asset_key:key})}'); commit;`).then(result);
beforeEach(async()=>{
 const ids=fixtureOwners.map(id=>`'${id}'`).join(',');
 await query(`update core.owners set account_state='active' where id in (${ids});
  update core.identity_working set revision=2,profile_asset_key=null where owner_id in (${ids});
  update core.identity_profile_text_working set display_name=null,bio=E' Raw\r\nBio ',revision=1,source_profile_revision=2 where owner_id='${owner}';
  update core.profile_media_upload_intents set status='consumed',consumed_at=now() where owner_id in (${ids});`);
});
async function waitBarrier(sentinel){
 for(let i=0;i<30;i++){
  if(await query(`select exists(select 1 from pg_locks where locktype='advisory' and classid=1936744812 and objid=${sentinel} and objsubid=2 and granted);`)==='t')return;
  await new Promise(resolve=>setTimeout(resolve,50));
 }
 assert.fail('Owned photo transaction did not reach barrier');
}
test('competing selections commit one complete source/text vector',async()=>{
 const replies=await Promise.all([photo(A),photo(C)]);assert.deepEqual(replies.map(x=>x.status).sort(),['stale_source','success']);
 const page=await read(start);assert.equal(page.profile_working.revision,3);assert.equal(page.profile_text_working.revision,2);
 assert.equal(page.profile_text_working.source_profile_revision,3);assert.equal(page.profile_text_working.display_name,null);
 assert.equal(page.profile_text_working.bio,' Raw\r\nBio ');assert.equal(page.profile_text_state,'saved');assert.ok([A,C].includes(page.profile_working.profile_asset_key));
});
test('same-key no-op preserves source/text timestamps; removal retains assets',async()=>{
 await photo(A);const before=await query(`select to_jsonb(p)||jsonb_build_object('recovery',to_jsonb(t)) from core.identity_working p join core.identity_profile_text_working t using(owner_id) where owner_id='${owner}';`);
 assert.equal((await photo(A,3,2)).changed,false);
 assert.equal(await query(`select to_jsonb(p)||jsonb_build_object('recovery',to_jsonb(t)) from core.identity_working p join core.identity_profile_text_working t using(owner_id) where owner_id='${owner}';`),before);
 assert.deepEqual(await photo(null,3,2),{status:'success',changed:true,profile_revision:4,text_revision:3,profile_asset_key:null});
 assert.equal(await query(`select count(*) from core.profile_media_assets where owner_id in (${fixtureOwners.map(id=>`'${id}'`).join(',')});`),'3');
});
test('text and photo competing with same bases preserve winning content without silent rebase',async()=>{
 const body={action:'save_profile_text_working',base_profile_revision:2,base_text_revision:1,profile_text_working:{display_name:' Updated raw ',bio:null}};
 const text=query(`begin; ${authFor(actor)} select api.save_current_owner_profile_text_working('${JSON.stringify(body)}'); commit;`).then(result);
 const replies=await Promise.all([photo(A),text]);assert.equal(replies.filter(x=>x.status==='success').length,1);
 assert.ok(replies.some(x=>['stale_source','stale_write'].includes(x.status)));
 const page=await read(start);assert.equal(page.profile_text_state,'saved');assert.equal(page.profile_text_working.revision,2);
 if(page.profile_working.profile_asset_key===A){assert.equal(page.profile_text_working.display_name,null);assert.equal(page.profile_working.revision,3);}
 else {assert.equal(page.profile_working.profile_asset_key,null);assert.equal(page.profile_text_working.display_name,' Updated raw ');assert.equal(page.profile_working.revision,2);}
});
test('earlier source drift cannot be silently rebased by photo action',async()=>{
 await query(`update core.identity_working set revision=3 where owner_id='${owner}';`);
 assert.deepEqual(await photo(A,3,1),{status:'stale_source'});const page=await read(start);
 assert.equal(page.profile_text_state,'source_changed');assert.equal(page.profile_working.profile_asset_key,null);assert.equal(page.profile_text_working.source_profile_revision,2);
});
test('parallel Owners select only own assets; missing text stays absent',async()=>{
 const replies=await Promise.all([photo(A),photo(B,2,null,actors[1])]);assert.ok(replies.every(x=>x.status==='success'));
 const other=result(await query(`begin; ${authFor(actors[1])} select api.resolve_current_owner_editable_identity_working_page('${JSON.stringify(start)}'); commit;`));
 assert.equal(other.profile_working.profile_asset_key,B);assert.equal(other.profile_text_working,null);
 assert.deepEqual(await photo(A,3,null,actors[1]),{status:'invalid_asset'});
});
test('restriction committed while photo waits prevents every component change',async()=>{
 const sentinel=249001;const held=query(`begin; update core.owners set account_state='restricted' where id='${owner}'; select pg_advisory_xact_lock(1936744812,${sentinel}); select pg_sleep(1); commit;`);
 await waitBarrier(sentinel);assert.deepEqual(await photo(A),{status:'owner_not_eligible'});await held;
 assert.equal(await query(`select revision||':'||coalesce(profile_asset_key,'null') from core.identity_working where owner_id='${owner}';`),'2:null');
 assert.equal(await query(`select revision||':'||source_profile_revision from core.identity_profile_text_working where owner_id='${owner}';`),'1:2');
});
test('intent loses consumed state while photo waits on metadata: reject before writes',async()=>{
 const sentinel=249002;const held=query(`begin; update core.profile_media_upload_intents set status='processing',consumed_at=null where id='${actor}'; select pg_advisory_xact_lock(1936744812,${sentinel}); select pg_sleep(1); commit;`);
 await waitBarrier(sentinel);assert.deepEqual(await photo(A),{status:'invalid_asset'});await held;
 assert.equal(await query(`select revision||':'||coalesce(profile_asset_key,'null') from core.identity_working where owner_id='${owner}';`),'2:null');
 assert.equal(await query(`select revision||':'||source_profile_revision from core.identity_profile_text_working where owner_id='${owner}';`),'1:2');
});
test('held editable page sees coherent old photo/text pair; fresh page sees coherent new pair',async()=>{
 const sentinel=249003;
 const held=query(`begin; ${authFor(actor)} with barrier as materialized(select pg_advisory_xact_lock(1936744812,${sentinel}),pg_sleep(1)) select api.resolve_current_owner_editable_identity_working_page('${JSON.stringify(start)}') from barrier; commit;`).then(result);
 await waitBarrier(sentinel);assert.equal((await photo(A)).status,'success');
 const page=await held;assert.equal(page.profile_working.revision,2);assert.equal(page.profile_working.profile_asset_key,null);assert.equal(page.profile_text_working.revision,1);assert.equal(page.profile_text_working.source_profile_revision,2);
 const fresh=await read(start);assert.equal(fresh.profile_working.revision,3);assert.equal(fresh.profile_working.profile_asset_key,A);assert.equal(fresh.profile_text_working.revision,2);assert.equal(fresh.profile_text_working.source_profile_revision,3);
});

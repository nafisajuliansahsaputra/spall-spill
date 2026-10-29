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
const actor='24800000-0000-4000-8000-000000000001';
const auth=`set local request.jwt.claims='{"sub":"${actor}","role":"authenticated"}';`;
const start={expected_collection_revision:null,after_position:null};
const result=output=>JSON.parse(output.split('\n').find(line=>line.startsWith('{')));
const read=request=>query(`begin; ${auth} select api.resolve_current_owner_editable_identity_working_page('${JSON.stringify(request)}'::jsonb); commit;`).then(result);
before(async()=>{
  await query('create extension if not exists pgtap with schema extensions;');
  const fixture=readFileSync(new URL('../supabase/tests/database/070_owner_profile_text_working.test.sql',import.meta.url),'utf8');
  const marker='\n-- Recoverable profile text fixtures end here.\n';assert.ok(fixture.includes(marker));
  const prefix=fixture.split(marker)[0];assert.ok(prefix.startsWith('begin;'));
  const output=await query(prefix.replace('begin;','begin; set local search_path=public,extensions;')+'\nselect * from finish(); commit;');
  assert.doesNotMatch(output,/not ok/);
  fixtureOwners=(await query("select owner_id from core.owner_auth_bindings where auth_user_id in ('24800000-0000-4000-8000-000000000001','24800000-0000-4000-8000-000000000002');")).split('\n');
  assert.equal(fixtureOwners.length,2);for(const id of fixtureOwners)assert.match(id,/^[a-f0-9-]{36}$/);
  owner=await query(`select owner_id from core.owner_auth_bindings where auth_user_id='${actor}';`);assert.match(owner,/^[a-f0-9-]{36}$/);
});
after(async()=>{
  await query("delete from auth.users where id in ('24800000-0000-4000-8000-000000000001','24800000-0000-4000-8000-000000000002');");
  // Preserve permanent fixture Owner/Handle identity; remove only isolated Working fixture data.
  if(fixtureOwners.length===2)await query(`delete from core.identity_block_collections_working where owner_id in (${fixtureOwners.map(id=>`'${id}'`).join(',')});
    delete from core.identity_connection_working where owner_id in (${fixtureOwners.map(id=>`'${id}'`).join(',')});
    delete from core.identity_layout_working where owner_id in (${fixtureOwners.map(id=>`'${id}'`).join(',')});
    delete from core.identity_working where owner_id in (${fixtureOwners.map(id=>`'${id}'`).join(',')});`);
});
const actors=[actor,'24800000-0000-4000-8000-000000000002'];
const authFor=sub=>`set local request.jwt.claims='{"sub":"${sub}","role":"authenticated"}';`;
const save=(name,base=null,source=2,sub=actor)=>query(`begin; ${authFor(sub)} select api.save_current_owner_profile_text_working('${JSON.stringify({action:'save_profile_text_working',base_profile_revision:source,base_text_revision:base,profile_text_working:{display_name:name,bio:' Raw\r\nBio '}})}'); commit;`).then(result);
beforeEach(async()=>{
  const own=fixtureOwners.map(id=>`'${id}'`).join(',');
  await query(`update core.owners set account_state='active' where id in (${own});
    update core.identity_working set revision=2 where owner_id in (${own});
    update core.identity_layout_working set starter_key='clean',revision=7 where owner_id in (${own});
    delete from core.identity_profile_text_working where owner_id in (${own});`);
});
async function waitBarrier(sentinel){
  for(let i=0;i<30;i++){
    if(await query(`select exists(select 1 from pg_locks where locktype='advisory' and classid=1936744812 and objid=${sentinel} and objsubid=2 and granted);`)==='t')return;
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  assert.fail('Owned transaction did not reach barrier');
}
test('concurrent creation protects exact raw content with one acknowledgment',async()=>{
  const replies=await Promise.all([save(null),save(' B ')]);
  assert.deepEqual(replies.map(x=>x.status).sort(),['stale_write','success']);
  assert.equal(replies.find(x=>x.status==='success').text_revision,1);
  const page=await read(start);assert.equal(page.status,'success');assert.equal(page.profile_text_state,'saved');
  assert.ok([null,' B '].includes(page.profile_text_working.display_name));assert.equal(page.profile_text_working.bio,' Raw\r\nBio ');
  assert.deepEqual(page.revision_vector,{profile:2,layout:7,connection:3,blocks:1,profile_text:1});
  assert.equal(page.collection.blocks.length,6);
});
test('concurrent updates and same-base replay never overwrite latest recovery',async()=>{
  await save('original');const replies=await Promise.all([save(' A ',1),save(' B ',1)]);
  assert.deepEqual(replies.map(x=>x.status).sort(),['stale_write','success']);
  const before=await read(start);assert.equal(before.profile_text_working.revision,2);
  assert.deepEqual(await save('overwrite',1),{status:'stale_write'});
  assert.deepEqual((await read(start)).profile_text_working,before.profile_text_working);
});
test('source revision changed while save waits denies, preserves raw and allows explicit rebase',async()=>{
  await save('kept');const sentinel=248001;
  const held=query(`begin; update core.identity_working set revision=3 where owner_id='${owner}'; select pg_advisory_xact_lock(1936744812,${sentinel}); select pg_sleep(1); commit;`);
  await waitBarrier(sentinel);assert.deepEqual(await save('stale',1),{status:'stale_source'});await held;
  const page=await read(start);assert.equal(page.profile_text_state,'source_changed');assert.equal(page.profile_text_working.display_name,'kept');
  assert.deepEqual(await save(' rebased ',1,3),{status:'success',text_revision:2,source_profile_revision:3});
  assert.equal((await read(start)).profile_text_state,'saved');
});
test('layout and text writes keep independent revisions and content',async()=>{
  const layout=query(`begin; ${authFor(actor)} select api.save_current_owner_layout_working('{"action":"save_layout_working","base_layout_revision":7,"starter_key":"featured"}'); commit;`).then(result);
  assert.ok((await Promise.all([save(null),layout])).every(x=>x.status==='success'));
  const page=await read(start);assert.equal(page.revision_vector.layout,8);assert.equal(page.revision_vector.profile_text,1);
  assert.equal(page.revision_vector.profile,2);assert.equal(page.revision_vector.blocks,1);assert.equal(page.collection.blocks.length,6);
});
test('parallel Owners can only create/read their own recoverable text',async()=>{
  const replies=await Promise.all([save('private A',null,2,actors[0]),save('private B',null,2,actors[1])]);
  assert.ok(replies.every(x=>x.status==='success'));
  for(let i=0;i<actors.length;i++){
    const page=result(await query(`begin; ${authFor(actors[i])} select api.resolve_current_owner_editable_identity_working_page('${JSON.stringify(start)}'); commit;`));
    assert.equal(page.profile_text_working.display_name,i===0?'private A':'private B');assert.equal(page.profile_text_working.revision,1);
  }
});
test('restriction while waiting on Owner prevents recovery creation',async()=>{
  const sentinel=248002;
  const held=query(`begin; update core.owners set account_state='restricted' where id='${owner}'; select pg_advisory_xact_lock(1936744812,${sentinel}); select pg_sleep(1); commit;`);
  await waitBarrier(sentinel);assert.deepEqual(await save('denied'),{status:'owner_not_eligible'});await held;
  assert.deepEqual(await read(start),{status:'unavailable'});
  assert.equal(await query(`select count(*) from core.identity_profile_text_working where owner_id='${owner}';`),'0');
});
function heldRead(sentinel){
  return query(`begin; ${authFor(actor)} with barrier as materialized
    (select pg_advisory_xact_lock(1936744812,${sentinel}),pg_sleep(1))
    select api.resolve_current_owner_editable_identity_working_page('${JSON.stringify(start)}') from barrier; commit;`).then(result);
}
test('source and recovery revision pair share one held statement snapshot',async()=>{
  await save('before');const sentinel=248003;const held=heldRead(sentinel);await waitBarrier(sentinel);
  const body={action:'save_profile_text_working',base_profile_revision:3,base_text_revision:1,profile_text_working:{display_name:'after',bio:null}};
  await query(`begin; ${authFor(actor)} update core.identity_working set revision=3 where owner_id='${owner}'; select api.save_current_owner_profile_text_working('${JSON.stringify(body)}'); commit;`);
  const page=await held;assert.equal(page.profile_working.revision,2);assert.equal(page.profile_text_working.revision,1);
  assert.equal(page.profile_text_working.source_profile_revision,2);assert.equal(page.profile_text_working.display_name,'before');
  const fresh=await read(start);assert.equal(fresh.profile_working.revision,3);assert.equal(fresh.profile_text_working.revision,2);
  assert.equal(fresh.profile_text_working.source_profile_revision,3);assert.equal(fresh.profile_text_working.display_name,'after');
});
test('snapshot can precede restriction; fresh read denies every private part',async()=>{
  await save(null);const sentinel=248004;const held=heldRead(sentinel);await waitBarrier(sentinel);
  await query(`update core.owners set account_state='restricted' where id='${owner}';`);
  const page=await held;assert.equal(page.status,'success');assert.equal(page.profile_text_working.revision,1);
  assert.deepEqual(await read(start),{status:'unavailable'});
});

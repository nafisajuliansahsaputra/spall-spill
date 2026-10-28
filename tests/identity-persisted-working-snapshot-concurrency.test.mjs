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
let fixtureOwners=[];
const actor='24500000-0000-4000-8000-000000000001';
const auth=`set local request.jwt.claims='{"sub":"${actor}","role":"authenticated"}';`;
const start={expected_collection_revision:null,after_position:null};
const continuation={expected_collection_revision:1,after_position:1};
const result=output=>JSON.parse(output.split('\n').find(line=>line.startsWith('{')));
const read=request=>query(`begin; ${auth} select api.resolve_current_owner_identity_working_page('${JSON.stringify(request)}'::jsonb); commit;`).then(result);
before(async()=>{
  await query('create extension if not exists pgtap with schema extensions;');
  const fixture=readFileSync(new URL('../supabase/tests/database/068_owner_persisted_identity_working_page.test.sql',import.meta.url),'utf8');
  const marker='\n-- Persisted Identity snapshot race fixtures end here.\n';assert.ok(fixture.includes(marker));
  const prefix=fixture.split(marker)[0];assert.ok(prefix.startsWith('begin;'));
  const output=await query(prefix.replace('begin;','begin; set local search_path=public,extensions;')+'\nselect * from finish(); commit;');
  assert.doesNotMatch(output,/not ok/);
  fixtureOwners=(await query("select owner_id from core.owner_auth_bindings where auth_user_id in ('24500000-0000-4000-8000-000000000001','24500000-0000-4000-8000-000000000002');")).split('\n');
  assert.equal(fixtureOwners.length,2);for(const id of fixtureOwners)assert.match(id,/^[a-f0-9-]{36}$/);
  owner=await query(`select owner_id from core.owner_auth_bindings where auth_user_id='${actor}';`);assert.match(owner,/^[a-f0-9-]{36}$/);
});
after(async()=>{
  await query("delete from auth.users where id in ('24500000-0000-4000-8000-000000000001','24500000-0000-4000-8000-000000000002');");
  // Preserve permanent fixture Owner/Handle identity; remove only isolated Working fixture data.
  if(fixtureOwners.length===2)await query(`delete from core.identity_block_collections_working where owner_id in (${fixtureOwners.map(id=>`'${id}'`).join(',')});
    delete from core.identity_connection_working where owner_id in (${fixtureOwners.map(id=>`'${id}'`).join(',')});
    delete from core.identity_layout_working where owner_id in (${fixtureOwners.map(id=>`'${id}'`).join(',')});
    delete from core.identity_working where owner_id in (${fixtureOwners.map(id=>`'${id}'`).join(',')});`);
});
async function reset(){
  await query(`delete from core.identity_blocks_working where owner_id='${owner}' and position>6;
    update core.identity_block_collections_working set revision=1 where owner_id='${owner}';
    update core.owners set account_state='active' where id='${owner}';
    update core.identity_working set display_name='Private Identity',revision=2 where owner_id='${owner}';
    update core.identity_layout_working set starter_key='clean',revision=7 where owner_id='${owner}';
    update core.identity_connection_working set destination_url='HTTPS://Private.example.test/Keep?X=1#Exact',revision=3 where owner_id='${owner}';
    update core.identity_block_texts_working set text_content=E' <Text>\\n ' where owner_id='${owner}';`);
}
async function waitLock(){
  for(let i=0;i<30;i++){
    if(await query("select exists(select 1 from pg_locks where locktype='advisory' and classid=1936744812 and objid=245 and objsubid=2 and granted);")==='t')return;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.fail('Page snapshot statement did not enter barrier');
}
function heldRead(request){
  // One SELECT obtains its statement snapshot before the materialized barrier waits.
  return query(`begin; ${auth} with barrier as materialized
    (select pg_advisory_xact_lock(1936744812,245),pg_sleep(1))
    select api.resolve_current_owner_identity_working_page('${JSON.stringify(request)}'::jsonb) from barrier; commit;`).then(result);
}
for(const request of [start,continuation]){
  test(`${request.after_position===null?'start':'continuation'} page retains one snapshot across concurrent canonical addition`,async()=>{
    await reset();const before=await read(request);assert.equal(before.status,'success');
    const held=heldRead(request);
    try{
      await waitLock();
      const intent={action:'add_link_block',base_collection_revision:1,is_visible:false,link_working:{kind:'generic_link',title:'new concurrent',social_platform:null,destination_url:'javascript:raw'}};
      const added=result(await query(`begin; ${auth} select api.add_current_owner_link_block_working('${JSON.stringify(intent)}'); commit;`));
      assert.equal(added.status,'success');assert.equal(added.collection_revision,2);
      assert.deepEqual(await held,before);
      if(request.after_position!==null)assert.deepEqual(await read(request),{status:'stale_read'});
      const fresh=await read(start);assert.equal(fresh.collection.revision,2);assert.equal(fresh.collection.blocks.length,7);
      assert.equal(fresh.collection.blocks.at(-1).block_id,added.block_id);
      assert.equal(fresh.collection.blocks.at(-1).working.title,'new concurrent');
    }finally{await held;}
  });
}
test('page snapshot may precede concurrent restriction; fresh call denies without private rows',async()=>{
  await reset();const before=await read(start);const held=heldRead(start);
  try{
    await waitLock();await query(`update core.owners set account_state='restricted' where id='${owner}';`);
    assert.deepEqual(await held,before);assert.deepEqual(await read(start),{status:'unavailable'});
  }finally{await held;}
});

test('typed Text payload and collection revision retain one statement snapshot',async()=>{
  await reset();const before=await read(start);const held=heldRead(start);
  try{
    await waitLock();
    const request={block_id:'24500000-0000-4000-8000-000000000004',base_collection_revision:1,text_working:{kind:'text',text:'New private Text'}};
    const saved=result(await query(`begin; ${auth} select api.save_current_owner_block_text_working('${JSON.stringify(request)}'); commit;`));
    assert.equal(saved.status,'success');assert.deepEqual(await held,before);
    const fresh=await read(start);assert.equal(fresh.collection.revision,2);assert.equal(fresh.collection.blocks[3].working.text,'New private Text');
  }finally{await held;}
});

test('persisted profile/layout/vector share the held statement snapshot',async()=>{
  await reset();const before=await read(start);const held=heldRead(start);
  try{
    await waitLock();
    await query(`begin;update core.identity_working set display_name='Concurrent Profile',revision=3 where owner_id='${owner}';
      update core.identity_layout_working set starter_key='business',revision=8 where owner_id='${owner}';commit;`);
    assert.deepEqual(await held,before);
    const fresh=await read(start);assert.equal(fresh.profile_working.display_name,'Concurrent Profile');
    assert.equal(fresh.layout_working.starter_key,'business');
    assert.deepEqual(fresh.revision_vector,{profile:3,layout:8,connection:3,blocks:1});
    assert.equal(fresh.publication_comparison,'not_assessed');
  }finally{await held;}
});
test('source slot changes remain separate from modular blocks and vector follows exact source revision',async()=>{
  await reset();const before=await read(start);const held=heldRead(start);
  try{
    await waitLock();
    await query(`update core.identity_connection_working set destination_url='HTTPS://Changed.example.test/Exact#Raw',revision=4 where owner_id='${owner}';`);
    assert.deepEqual(await held,before);
    const fresh=await read(start);assert.equal(fresh.connection_source_working.destination_url,'HTTPS://Changed.example.test/Exact#Raw');
    assert.equal(fresh.revision_vector.connection,4);assert.equal(fresh.collection.blocks.length,6);
  }finally{await held;}
});

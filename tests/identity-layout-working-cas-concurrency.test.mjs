import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { before, beforeEach, after, test } from 'node:test';

const container = process.env.SPILL_TEST_DB_CONTAINER ?? 'supabase_db_spall-spill';
assert.match(container, /^supabase_db_spall-spill(?:-[a-z0-9-]+)?$/);
assert.ok(process.env.CI || container !== 'supabase_db_spall-spill', 'Layout CAS races require explicitly isolated test database.');
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
const actor='24700000-0000-4000-8000-000000000001';
const auth=`set local request.jwt.claims='{"sub":"${actor}","role":"authenticated"}';`;
const start={expected_collection_revision:null,after_position:null};
const result=output=>JSON.parse(output.split('\n').find(line=>line.startsWith('{')));
const read=request=>query(`begin; ${auth} select api.resolve_current_owner_identity_working_page('${JSON.stringify(request)}'::jsonb); commit;`).then(result);
before(async()=>{
  await query('create extension if not exists pgtap with schema extensions;');
  const fixture=readFileSync(new URL('../supabase/tests/database/069_owner_layout_working_cas.test.sql',import.meta.url),'utf8');
  const marker='\n-- Layout CAS fixtures end here.\n';assert.ok(fixture.includes(marker));
  const prefix=fixture.split(marker)[0];assert.ok(prefix.startsWith('begin;'));
  const output=await query(prefix.replace('begin;','begin; set local search_path=public,extensions;')+'\nselect * from finish(); commit;');
  assert.doesNotMatch(output,/not ok/);
  fixtureOwners=(await query("select owner_id from core.owner_auth_bindings where auth_user_id in ('24700000-0000-4000-8000-000000000001','24700000-0000-4000-8000-000000000002');")).split('\n');
  assert.equal(fixtureOwners.length,2);for(const id of fixtureOwners)assert.match(id,/^[a-f0-9-]{36}$/);
  owner=await query(`select owner_id from core.owner_auth_bindings where auth_user_id='${actor}';`);assert.match(owner,/^[a-f0-9-]{36}$/);
});
after(async()=>{
  await query("delete from auth.users where id in ('24700000-0000-4000-8000-000000000001','24700000-0000-4000-8000-000000000002');");
  // Preserve permanent fixture Owner/Handle identity; remove only isolated Working fixture data.
  if(fixtureOwners.length===2)await query(`delete from core.identity_block_collections_working where owner_id in (${fixtureOwners.map(id=>`'${id}'`).join(',')});
    delete from core.identity_connection_working where owner_id in (${fixtureOwners.map(id=>`'${id}'`).join(',')});
    delete from core.identity_layout_working where owner_id in (${fixtureOwners.map(id=>`'${id}'`).join(',')});
    delete from core.identity_working where owner_id in (${fixtureOwners.map(id=>`'${id}'`).join(',')});`);
});
const actors=[actor,'24700000-0000-4000-8000-000000000002'];
const authFor=sub=>`set local request.jwt.claims='{"sub":"${sub}","role":"authenticated"}';`;
const save=(key,sub=actor,base=7)=>query(`begin; ${authFor(sub)} select api.save_current_owner_layout_working('${JSON.stringify({action:'save_layout_working',starter_key:key,base_layout_revision:base})}'); commit;`).then(result);
beforeEach(async()=>{
  await query(`update core.owners set account_state='active' where id in (${fixtureOwners.map(id=>`'${id}'`).join(',')});
    update core.identity_layout_working set starter_key='clean',revision=7 where owner_id in (${fixtureOwners.map(id=>`'${id}'`).join(',')});
    delete from core.identity_blocks_working where owner_id='${owner}' and position>6;
    update core.identity_block_collections_working set revision=1 where owner_id='${owner}';`);
});
test('competing different recipes commit only one revision; stale replay cannot overwrite',async()=>{
  const replies=await Promise.all([save('featured'),save('business')]);
  assert.deepEqual(replies.map(x=>x.status).sort(),['stale_write','success']);
  const ack=replies.find(x=>x.status==='success');assert.equal(ack.changed,true);assert.equal(ack.layout_working.revision,8);
  assert.deepEqual(await save('social_focus'),{status:'stale_write'});
  const snapshot=await read(start);assert.equal(snapshot.status,'success');assert.deepEqual(snapshot.layout_working,ack.layout_working);
  assert.deepEqual(snapshot.revision_vector,{profile:2,layout:8,connection:3,blocks:1});assert.equal(snapshot.collection.blocks.length,6);
});
test('same-key concurrent no-ops preserve exact revision and timestamp',async()=>{
  const before=await query(`select updated_at from core.identity_layout_working where owner_id='${owner}';`);
  const replies=await Promise.all([save('clean'),save('clean')]);
  assert.ok(replies.every(x=>x.status==='success'&&x.changed===false&&x.layout_working.revision===7));
  assert.equal(await query(`select updated_at from core.identity_layout_working where owner_id='${owner}';`),before);
});
test('parallel Owners change only own recipe; primary use case grants no distinction',async()=>{
  const replies=await Promise.all([save('featured',actors[0]),save('business',actors[1])]);
  assert.ok(replies.every(x=>x.status==='success'));
  for(let i=0;i<actors.length;i++){
    const snapshot=result(await query(`begin; ${authFor(actors[i])} select api.resolve_current_owner_identity_working_page('${JSON.stringify(start)}'); commit;`));
    assert.deepEqual(snapshot.layout_working,replies[i].layout_working);assert.equal(snapshot.revision_vector.layout,8);
  }
});
test('layout and block append serialize Owner yet keep independent revision/content boundaries',async()=>{
  const addition=query(`begin; ${authFor(actor)} select api.add_current_owner_spill_cta_block_working('{"action":"add_spill_cta_block","base_collection_revision":1,"is_visible":false,"spill_cta_working":{"kind":"spill_cta","target":"owner_spill"}}'); commit;`).then(result);
  const replies=await Promise.all([save('featured'),addition]);assert.ok(replies.every(x=>x.status==='success'));
  const snapshot=await read(start);assert.equal(snapshot.revision_vector.layout,8);assert.equal(snapshot.revision_vector.blocks,2);
  assert.equal(snapshot.collection.blocks.length,7);assert.equal(snapshot.profile_working.display_name,'Private Identity');
});
test('restriction committed while save waits on Owner denies mutation',async()=>{
  const sentinel=247001;
  const held=query(`begin; update core.owners set account_state='restricted' where id='${owner}'; select pg_advisory_xact_lock(1936744812,${sentinel}); select pg_sleep(1); commit;`);
  let locked=false;
  for(let i=0;i<30;i++){
    locked=await query(`select exists(select 1 from pg_locks where locktype='advisory' and classid=1936744812 and objid=${sentinel} and objsubid=2 and granted);`)==='t';
    if(locked)break; await new Promise(resolve=>setTimeout(resolve,50));
  }
  assert.ok(locked,'Owner restriction must hold row lock before save');
  assert.deepEqual(await save('featured'),{status:'owner_not_eligible'});await held;
  assert.equal(await query(`select starter_key||':'||revision from core.identity_layout_working where owner_id='${owner}';`),'clean:7');
});

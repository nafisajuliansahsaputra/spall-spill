import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { before, after, beforeEach, test } from 'node:test';

const container = process.env.SPILL_TEST_DB_CONTAINER ?? 'supabase_db_spall-spill';
assert.match(container, /^supabase_db_spall-spill(?:-[a-z0-9-]+)?$/);
assert.ok(process.env.CI || container !== 'supabase_db_spall-spill', 'Requires an explicitly isolated database.');
function query(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['exec','-i',container,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-qAt'],
      { stdio:['pipe','pipe','pipe'], timeout:30000 });
    let output='', errors='';
    child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { errors += chunk; });
    child.once('error', reject); child.stdin.once('error', reject);
    child.once('close', code => code===0 ? resolve(output.trim()) : reject(new Error(errors || `psql ${code}`)));
    child.stdin.end(sql);
  });
}
const actors=['24300000-0000-4000-8000-000000000001','24300000-0000-4000-8000-000000000002'];
const auth = actor => `set local request.jwt.claims='{"sub":"${actor}"}';`;
const result = text => JSON.parse(text.split('\n').find(line=>line.startsWith('{')));
const intent = initialize => ({ action:initialize?'initialize_spill_cta_block':'add_spill_cta_block',
  base_collection_revision:initialize?null:1,is_visible:true,spill_cta_working:{kind:'spill_cta',target:'owner_spill'} });
const execute = (initialize,actor=actors[0]) => query(`begin; ${auth(actor)} select api.${initialize?'initialize_current_owner_blocks_from_spill_cta':'add_current_owner_spill_cta_block_working'}('${JSON.stringify(intent(initialize))}'); select pg_sleep(0.3); commit;`).then(result);
let owners=[];
before(async () => {
  await query('create extension if not exists pgtap with schema extensions;');
  const fixture=readFileSync(new URL('../supabase/tests/database/066_owner_spill_cta_working.test.sql',import.meta.url),'utf8');
  const marker='-- Spill CTA race fixtures end here.'; assert.ok(fixture.includes(marker));
  const output=await query(fixture.split(marker)[0].replace('begin;','begin; set local search_path=public,extensions;')+'select * from finish(); commit;');
  assert.doesNotMatch(output,/not ok/);
  owners=(await query(`select owner_id from core.owner_auth_bindings where auth_user_id in ('${actors.join("','")}') order by auth_user_id;`)).split('\n');
  assert.equal(owners.length,2); for(const owner of owners)assert.match(owner,/^[a-f0-9-]{36}$/);
});
beforeEach(async () => {
  await query(`update core.owners set account_state='active' where id in ('${owners.join("','")}'); delete from core.identity_block_collections_working where owner_id in ('${owners.join("','")}');`);
});
after(async () => {
  if(owners.length===2)await query(`delete from core.identity_block_collections_working where owner_id in ('${owners.join("','")}'); delete from auth.users where id in ('${actors.join("','")}');`);
});
test('competing explicit first CTA initializations allocate one stable member/marker',async()=>{
  const replies=await Promise.all([execute(true),execute(true)]);
  assert.deepEqual(replies.map(x=>x.status).sort(),['already_initialized','success']);
  assert.equal(await query(`select count(*)||':'||max(c.revision) from core.identity_block_spill_cta_working m join core.identity_block_collections_working c using(owner_id) where m.owner_id='${owners[0]}';`),'1:1');
});
test('competing append commands share one collection CAS, replay never creates second member',async()=>{
  await execute(true); const replies=await Promise.all([execute(false),execute(false)]);
  assert.deepEqual(replies.map(x=>x.status).sort(),['stale_write','success']);
  assert.equal((await execute(false)).status,'stale_write');
  assert.equal(await query(`select count(*)||':'||max(c.revision) from core.identity_block_spill_cta_working m join core.identity_block_collections_working c using(owner_id) where m.owner_id='${owners[0]}';`),'2:2');
});
test('append competes with visibility under the same aggregate revision',async()=>{
  const first=await execute(true);
  const visibility=query(`begin; ${auth(actors[0])} select api.save_current_owner_block_visibility_working('{"block_id":"${first.block_id}","base_collection_revision":1,"is_visible":false}'); select pg_sleep(0.3); commit;`).then(result);
  const replies=await Promise.all([execute(false),visibility]);
  assert.deepEqual(replies.map(x=>x.status).sort(),['stale_write','success']);
  assert.equal(await query(`select revision from core.identity_block_collections_working where owner_id='${owners[0]}';`),'2');
});
test('parallel distinct Owners allocate/read only their own semantic targets',async()=>{
  const replies=await Promise.all(actors.map(actor=>execute(true,actor)));
  assert.ok(replies.every(x=>x.status==='success')); assert.notEqual(replies[0].block_id,replies[1].block_id);
  for(let i=0;i<2;i++){
    const own=result(await query(`begin; ${auth(actors[i])} select api.resolve_current_owner_spill_cta_block_working('${replies[i].block_id}'); rollback;`));
    assert.equal(own.block.spill_cta_working.target,'owner_spill');
    const denied=result(await query(`begin; ${auth(actors[i])} select api.resolve_current_owner_spill_cta_block_working('${replies[1-i].block_id}'); rollback;`));
    assert.deepEqual(denied,{status:'unavailable'});
  }
});
test('Owner restriction committed while allocator waits wins before any initialization',async()=>{
  const sentinel=243001;
  const held=query(`begin; update core.owners set account_state='restricted' where id='${owners[0]}'; select pg_advisory_xact_lock(1936744812,${sentinel}); select pg_sleep(1); commit;`);
  let locked=false;
  for(let i=0;i<30;i++){
    locked=await query(`select exists(select 1 from pg_locks where locktype='advisory' and classid=1936744812 and objid=${sentinel} and objsubid=2 and granted);`)==='t';
    if(locked)break; await new Promise(resolve=>setTimeout(resolve,50));
  }
  assert.ok(locked,'Owner transaction must hold row lock before allocator');
  assert.equal((await execute(true)).status,'owner_not_eligible'); await held;
  assert.equal(await query(`select count(*) from core.identity_block_collections_working where owner_id='${owners[0]}';`),'0');
});

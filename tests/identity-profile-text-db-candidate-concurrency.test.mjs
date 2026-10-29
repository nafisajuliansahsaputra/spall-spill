import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { before, beforeEach, after, test } from 'node:test';

const container = process.env.SPILL_TEST_DB_CONTAINER ?? 'supabase_db_spall-spill';
assert.match(container, /^supabase_db_spall-spill(?:-[a-z0-9-]+)?$/);
assert.ok(process.env.CI || container !== 'supabase_db_spall-spill', 'Candidate validation requires explicitly isolated test database.');
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
const actor='25400000-0000-4000-8000-000000000001';
const auth=`set local request.jwt.claims='{"sub":"${actor}","role":"authenticated"}';`;
const start={expected_collection_revision:null,after_position:null};
const result=output=>JSON.parse(output.split('\n').find(line=>line.startsWith('{')));
const read=request=>query(`begin; ${auth} select api.resolve_current_owner_identity_review_snapshot('${JSON.stringify(request)}'::jsonb); commit;`).then(result);
before(async()=>{
  await query('create extension if not exists pgtap with schema extensions;');
  const fixture=readFileSync(new URL('../supabase/tests/database/074_owner_profile_text_db_candidate.test.sql',import.meta.url),'utf8');
  const marker='\n-- Profile/Text DB candidate fixtures end here.\n';assert.ok(fixture.includes(marker));
  const prefix=fixture.split(marker)[0];assert.ok(prefix.startsWith('begin;'));
  const output=await query(prefix.replace('begin;','begin; set local search_path=public,extensions;')+'\nselect ok(true); select * from finish(); commit;');
  assert.doesNotMatch(output,/not ok/);
  fixtureOwners=(await query("select owner_id from core.owner_auth_bindings where auth_user_id in ('25400000-0000-4000-8000-000000000001','25400000-0000-4000-8000-000000000002');")).split('\n');
  assert.equal(fixtureOwners.length,2);for(const id of fixtureOwners)assert.match(id,/^[a-f0-9-]{36}$/);
  owner=await query(`select owner_id from core.owner_auth_bindings where auth_user_id='${actor}';`);assert.match(owner,/^[a-f0-9-]{36}$/);
});
const confirm=hash=>query(`begin; ${auth} select api.confirm_current_owner_identity_working_review('${JSON.stringify({action:'confirm_identity_working_review',snapshot_hash:hash})}'); commit;`).then(result);
const prepare=intent=>query(`begin; ${auth} select api.prepare_current_owner_identity_profile_text_candidate('${JSON.stringify(intent)}'); commit;`).then(result);
let intent;
beforeEach(async()=>{
 await query(`insert into core.owner_auth_bindings(auth_user_id,owner_id) values('${actor}','${owner}') on conflict(auth_user_id) do nothing;
 update core.owners set account_state='active' where id='${owner}';
 update core.identity_working set display_name='Private Identity',revision=2 where owner_id='${owner}';
 delete from core.identity_working_review_receipts where owner_id='${owner}';`);
 const snapshot=await read(start); const receipt=await confirm(snapshot.snapshot_hash);assert.equal(receipt.status,'success');
 intent={action:'prepare_identity_profile_text_candidate',receipt_id:receipt.receipt_id,snapshot_hash:snapshot.snapshot_hash};
});
async function waitBarrier(sentinel){
 for(let i=0;i<30;i++){
  if(await query(`select exists(select 1 from pg_locks where locktype='advisory' and classid=1936744812 and objid=${sentinel} and objsubid=2 and granted);`)==='t')return;
  await new Promise(resolve=>setTimeout(resolve,50));
 }assert.fail('Owned transaction did not reach barrier');
}
const heldOwner=(sql,sentinel)=>query(`begin; select id from core.owners where id='${owner}' for update; ${sql}
 select pg_advisory_xact_lock(1936744812,${sentinel});select pg_sleep(1);commit;`);
test('parallel same receipt preparation returns exact same candidate and leaves receipt untouched',async()=>{
 const before=await query(`select to_jsonb(r) from core.identity_working_review_receipts r where owner_id='${owner}';`);
 const replies=await Promise.all([prepare(intent),prepare(intent)]);
 assert.equal(replies[0].assessment,'candidate_validated');assert.deepEqual(replies[0],replies[1]);
 assert.equal(await query(`select to_jsonb(r) from core.identity_working_review_receipts r where owner_id='${owner}';`),before);
});
test('content changes while waiting on Owner invalidate complete reviewed graph',async()=>{
 const held=heldOwner(`update core.identity_working set display_name='Changed',revision=3 where owner_id='${owner}';`,254001);
 await waitBarrier(254001);assert.deepEqual(await prepare(intent),{status:'stale_review'});await held;
});
test('receipt expires while waiting despite transaction start timestamp being valid',async()=>{
 await query(`update core.identity_working_review_receipts set issued_at=now()-interval '10 minutes'+interval '500 milliseconds',
 expires_at=now()+interval '500 milliseconds' where owner_id='${owner}';`);
 const held=heldOwner('',254002);await waitBarrier(254002);
 assert.deepEqual(await prepare(intent),{status:'review_expired'});await held;
});
test('restriction after lock wait denies any candidate',async()=>{
 const held=heldOwner(`update core.owners set account_state='restricted' where id='${owner}';`,254003);
 await waitBarrier(254003);assert.deepEqual(await prepare(intent),{status:'owner_not_eligible'});await held;
});
test('binding removal after lock wait denies stale actor',async()=>{
 const held=heldOwner(`delete from core.owner_auth_bindings where auth_user_id='${actor}';`,254004);
 await waitBarrier(254004);assert.ok(['unavailable','owner_missing'].includes((await prepare(intent)).status));await held;
});
test('receipt rotation after lock wait rejects replaced receipt even for same graph',async()=>{
 const held=heldOwner(`update core.identity_working_review_receipts set receipt_id=gen_random_uuid() where owner_id='${owner}';`,254005);
 await waitBarrier(254005);assert.deepEqual(await prepare(intent),{status:'stale_review'});await held;
});
after(async()=>{
 await query(`delete from auth.users where id in('25400000-0000-4000-8000-000000000001','25400000-0000-4000-8000-000000000002');`);
 if(fixtureOwners.length===2)await query(`delete from core.identity_working_review_receipts where owner_id in(${fixtureOwners.map(id=>`'${id}'`).join(',')});
 delete from core.identity_block_collections_working where owner_id in(${fixtureOwners.map(id=>`'${id}'`).join(',')});
 delete from core.identity_layout_working where owner_id in(${fixtureOwners.map(id=>`'${id}'`).join(',')});
 delete from core.identity_working where owner_id in(${fixtureOwners.map(id=>`'${id}'`).join(',')});`);
});

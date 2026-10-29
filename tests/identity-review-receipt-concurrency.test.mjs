import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { before, beforeEach, after, test } from 'node:test';

const container = process.env.SPILL_TEST_DB_CONTAINER ?? 'supabase_db_spall-spill';
assert.match(container, /^supabase_db_spall-spill(?:-[a-z0-9-]+)?$/);
assert.ok(process.env.CI || container !== 'supabase_db_spall-spill', 'Destination review requires explicitly isolated test database.');
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
const actor='25200000-0000-4000-8000-000000000001';
const auth=`set local request.jwt.claims='{"sub":"${actor}","role":"authenticated"}';`;
const start={expected_collection_revision:null,after_position:null};
const result=output=>JSON.parse(output.split('\n').find(line=>line.startsWith('{')));
const read=request=>query(`begin; ${auth} select api.resolve_current_owner_identity_review_snapshot('${JSON.stringify(request)}'::jsonb); commit;`).then(result);
before(async()=>{
  await query('create extension if not exists pgtap with schema extensions;');
  const fixture=readFileSync(new URL('../supabase/tests/database/073_owner_identity_review_receipt.test.sql',import.meta.url),'utf8');
  const marker='\n-- Whole Identity receipt fixtures end here.\n';assert.ok(fixture.includes(marker));
  const prefix=fixture.split(marker)[0];assert.ok(prefix.startsWith('begin;'));
  const output=await query(prefix.replace('begin;','begin; set local search_path=public,extensions;')+'\nselect * from finish(); commit;');
  assert.doesNotMatch(output,/not ok/);
  fixtureOwners=(await query("select owner_id from core.owner_auth_bindings where auth_user_id in ('25200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000002');")).split('\n');
  assert.equal(fixtureOwners.length,2);for(const id of fixtureOwners)assert.match(id,/^[a-f0-9-]{36}$/);
  owner=await query(`select owner_id from core.owner_auth_bindings where auth_user_id='${actor}';`);assert.match(owner,/^[a-f0-9-]{36}$/);
});
const sourceUrl='https://receipt252-native.example.test/source';
const confirm=(hash,sub=actor)=>query(`begin; set local request.jwt.claims='{"sub":"${sub}","role":"authenticated"}';
  select api.confirm_current_owner_identity_working_review('${JSON.stringify({action:'confirm_identity_working_review',snapshot_hash:hash})}'); commit;`).then(result);
beforeEach(async()=>{
  await query(`insert into core.owner_auth_bindings(auth_user_id,owner_id) values('${actor}','${owner}') on conflict(auth_user_id) do nothing;
    update core.owners set account_state='active' where id in(${fixtureOwners.map(id=>`'${id}'`).join(',')});
    delete from core.identity_working_review_receipts where owner_id in(${fixtureOwners.map(id=>`'${id}'`).join(',')});
    update core.identity_working set display_name='Private Identity',revision=2 where owner_id='${owner}';
    update core.identity_connection_working set destination_url='${sourceUrl}',revision=3 where owner_id='${owner}';
    delete from core.external_destination_safety where normalized_url='${sourceUrl}';
    insert into core.external_destination_safety(normalized_url,url_hash,safety_status,scanner_version,checked_at,expires_at,revision)
      values('${sourceUrl}',encode(extensions.digest('${sourceUrl}','sha256'),'hex'),'safe','fixture',now()-interval '1 minute',now()+interval '1 hour',1);`);
});
async function waitBarrier(sentinel){
  for(let i=0;i<30;i++){
    if(await query(`select exists(select 1 from pg_locks where locktype='advisory' and classid=1936744812 and objid=${sentinel} and objsubid=2 and granted);`)==='t')return;
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  assert.fail('Owned transaction did not reach barrier');
}
const heldOwner=(sql,sentinel)=>query(`begin; select id from core.owners where id='${owner}' for update;
  ${sql} select pg_advisory_xact_lock(1936744812,${sentinel}); select pg_sleep(1); commit;`);
test('parallel confirmations of same graph reuse one UUID and fixed expiry',async()=>{
  const snapshot=await read(start);assert.equal(snapshot.status,'success');
  const results=await Promise.all([confirm(snapshot.snapshot_hash),confirm(snapshot.snapshot_hash)]);
  assert.equal(results[0].status,'success');assert.deepEqual(results[0],results[1]);
  assert.equal(await query(`select count(*) from core.identity_working_review_receipts where owner_id='${owner}';`),'1');
  assert.equal(await query(`select expires_at=issued_at+interval '10 minutes' from core.identity_working_review_receipts where owner_id='${owner}';`),'t');
});
test('content changed while waiting on Owner rejects old confirmation and preserves previous receipt',async()=>{
  const snapshot=await read(start);const old=await confirm(snapshot.snapshot_hash);assert.equal(old.status,'success');
  const held=heldOwner(`update core.identity_working set display_name='After',revision=3 where owner_id='${owner}';`,252001);
  await waitBarrier(252001);assert.deepEqual(await confirm(snapshot.snapshot_hash),{status:'stale_review'});await held;
  assert.equal(await query(`select receipt_id from core.identity_working_review_receipts where owner_id='${owner}';`),old.receipt_id);
  const fresh=await read(start);assert.notEqual(fresh.snapshot_hash,snapshot.snapshot_hash);
  assert.notEqual((await confirm(fresh.snapshot_hash)).receipt_id,old.receipt_id);
});
test('external safety changed while waiting rejects confirmation without a content revision bump',async()=>{
  const snapshot=await read(start);
  const held=heldOwner(`update core.external_destination_safety set safety_status='blocked',reason_codes=array['fixture'],revision=2 where normalized_url='${sourceUrl}';`,252002);
  await waitBarrier(252002);assert.deepEqual(await confirm(snapshot.snapshot_hash),{status:'stale_review'});await held;
  const fresh=await read(start);assert.deepEqual(fresh.revision_vector,snapshot.revision_vector);assert.equal(fresh.source_destination_safety.status,'blocked');
  assert.equal(await query(`select count(*) from core.identity_working_review_receipts where owner_id='${owner}';`),'0');
});
test('restriction while waiting prevents confirmation and private snapshot disclosure',async()=>{
  const snapshot=await read(start);const held=heldOwner(`update core.owners set account_state='restricted' where id='${owner}';`,252003);
  await waitBarrier(252003);assert.deepEqual(await confirm(snapshot.snapshot_hash),{status:'owner_not_eligible'});await held;
  assert.deepEqual(await read(start),{status:'unavailable'});
});
test('binding removed during Owner wait never confirms for stale binding',async()=>{
  const snapshot=await read(start);const held=heldOwner(`delete from core.owner_auth_bindings where auth_user_id='${actor}';`,252004);
  await waitBarrier(252004);const reply=await confirm(snapshot.snapshot_hash);await held;
  assert.ok(['unavailable','owner_missing'].includes(reply.status));
  assert.equal(await query(`select count(*) from core.identity_working_review_receipts where owner_id='${owner}';`),'0');
});
test('concurrent renewal of expired same-hash receipt rotates exactly once',async()=>{
  const snapshot=await read(start);const old=await confirm(snapshot.snapshot_hash);
  await query(`update core.identity_working_review_receipts set issued_at=issued_at-interval '11 minutes',expires_at=expires_at-interval '11 minutes' where owner_id='${owner}';`);
  const replies=await Promise.all([confirm(snapshot.snapshot_hash),confirm(snapshot.snapshot_hash)]);
  assert.equal(replies[0].status,'success');assert.deepEqual(replies[0],replies[1]);assert.notEqual(replies[0].receipt_id,old.receipt_id);
});
test('parallel different Owners confirm only their own graph, never each others hash',async()=>{
  const own=await read(start);const foreignActor='25200000-0000-4000-8000-000000000002';
  const foreign=result(await query(`begin; set local request.jwt.claims='{"sub":"${foreignActor}"}'; select api.resolve_current_owner_identity_review_snapshot('${JSON.stringify(start)}'); commit;`));
  assert.notEqual(own.snapshot_hash,foreign.snapshot_hash);
  const replies=await Promise.all([confirm(own.snapshot_hash),confirm(foreign.snapshot_hash,foreignActor)]);
  assert.ok(replies.every(x=>x.status==='success'));assert.notEqual(replies[0].receipt_id,replies[1].receipt_id);
  assert.deepEqual(await confirm(own.snapshot_hash,foreignActor),{status:'stale_review'});
});
test('complete graph, safety and server digest share one held statement snapshot',async()=>{
  const before=await read(start);const sentinel=252005;
  const held=query(`begin; ${auth} with barrier as materialized (select pg_advisory_xact_lock(1936744812,${sentinel}),pg_sleep(1))
    select api.resolve_current_owner_identity_review_snapshot('${JSON.stringify(start)}') from barrier; commit;`).then(result);
  await waitBarrier(sentinel);
  await query(`begin; update core.identity_working set display_name='Changed',revision=3 where owner_id='${owner}';
    update core.external_destination_safety set safety_status='review',reason_codes=array['fixture'],revision=2 where normalized_url='${sourceUrl}'; commit;`);
  const previous=await held;assert.deepEqual(previous,before);
  const fresh=await read(start);assert.equal(fresh.profile_working.display_name,'Changed');assert.equal(fresh.source_destination_safety.status,'review');
  assert.notEqual(fresh.snapshot_hash,previous.snapshot_hash);
});
after(async()=>{
  await query(`delete from core.external_destination_safety where normalized_url='${sourceUrl}';
    delete from auth.users where id in('25200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000002');`);
  if(fixtureOwners.length===2)await query(`delete from core.identity_working_review_receipts where owner_id in(${fixtureOwners.map(id=>`'${id}'`).join(',')});
    delete from core.identity_block_collections_working where owner_id in(${fixtureOwners.map(id=>`'${id}'`).join(',')});
    delete from core.identity_connection_working where owner_id in(${fixtureOwners.map(id=>`'${id}'`).join(',')});
    delete from core.identity_layout_working where owner_id in(${fixtureOwners.map(id=>`'${id}'`).join(',')});
    delete from core.identity_working where owner_id in(${fixtureOwners.map(id=>`'${id}'`).join(',')});`);
});

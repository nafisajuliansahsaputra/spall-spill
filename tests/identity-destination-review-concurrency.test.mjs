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
const actor='25100000-0000-4000-8000-000000000001';
const auth=`set local request.jwt.claims='{"sub":"${actor}","role":"authenticated"}';`;
const start={expected_collection_revision:null,after_position:null};
const result=output=>JSON.parse(output.split('\n').find(line=>line.startsWith('{')));
const read=request=>query(`begin; ${auth} select api.resolve_current_owner_identity_destination_review_page('${JSON.stringify(request)}'::jsonb); commit;`).then(result);
before(async()=>{
  await query('create extension if not exists pgtap with schema extensions;');
  const fixture=readFileSync(new URL('../supabase/tests/database/072_owner_identity_destination_review.test.sql',import.meta.url),'utf8');
  const marker='\n-- Destination review fixtures end here.\n';assert.ok(fixture.includes(marker));
  const prefix=fixture.split(marker)[0];assert.ok(prefix.startsWith('begin;'));
  const output=await query(prefix.replace('begin;','begin; set local search_path=public,extensions;')+'\nselect * from finish(); commit;');
  assert.doesNotMatch(output,/not ok/);
  fixtureOwners=(await query("select owner_id from core.owner_auth_bindings where auth_user_id in ('25100000-0000-4000-8000-000000000001','25100000-0000-4000-8000-000000000002');")).split('\n');
  assert.equal(fixtureOwners.length,2);for(const id of fixtureOwners)assert.match(id,/^[a-f0-9-]{36}$/);
  owner=await query(`select owner_id from core.owner_auth_bindings where auth_user_id='${actor}';`);assert.match(owner,/^[a-f0-9-]{36}$/);
});
const sourceUrl='https://snapshot251.example.test/source';
const nextUrl='https://snapshot251.example.test/next';
const linkUrl='https://snapshot251.example.test/link';
beforeEach(async()=>{
  await query(`update core.owners set account_state='active' where id='${owner}';
    update core.identity_connection_working set destination_url='${sourceUrl}',revision=3 where owner_id='${owner}';
    update core.identity_blocks_working set is_visible=true where block_id='25100000-0000-4000-8000-000000000001';
    update core.identity_block_links_working set destination_url='${linkUrl}' where block_id='25100000-0000-4000-8000-000000000001';
    delete from core.external_destination_safety where normalized_url in('${sourceUrl}','${nextUrl}','${linkUrl}');
    insert into core.external_destination_safety(normalized_url,url_hash,safety_status,scanner_version,checked_at,expires_at,revision)
      select url,encode(extensions.digest(url,'sha256'),'hex'),'safe','fixture',now()-interval '1 minute',now()+interval '1 hour',1
      from (values('${sourceUrl}'),('${nextUrl}'),('${linkUrl}')) u(url);`);
});
async function waitBarrier(sentinel){
  for(let i=0;i<30;i++){
    if(await query(`select exists(select 1 from pg_locks where locktype='advisory' and classid=1936744812 and objid=${sentinel} and objsubid=2 and granted);`)==='t')return;
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  assert.fail('Owned transaction did not reach snapshot barrier');
}
function heldRead(sentinel){
  return query(`begin; ${auth} with barrier as materialized
    (select pg_advisory_xact_lock(1936744812,${sentinel}),pg_sleep(1))
    select api.resolve_current_owner_identity_destination_review_page('${JSON.stringify(start)}') from barrier; commit;`).then(result);
}
test('source and active modular link verdicts share held statement snapshot without content revision changes',async()=>{
  const held=heldRead(251001);await waitBarrier(251001);
  await query(`update core.external_destination_safety set safety_status='blocked',reason_codes=array['fixture'],revision=2
    where normalized_url in('${sourceUrl}','${linkUrl}');`);
  const old=await held;assert.equal(old.status,'success');assert.equal(old.source_destination_safety.status,'safe');
  assert.equal(old.collection.blocks[0].destination_safety.status,'safe');
  const fresh=await read(start);assert.equal(fresh.source_destination_safety.status,'blocked');
  assert.equal(fresh.collection.blocks[0].destination_safety.status,'blocked');assert.deepEqual(old.revision_vector,fresh.revision_vector);
});
test('changed source URL and associated verdict cannot form mixed-snapshot review',async()=>{
  const held=heldRead(251002);await waitBarrier(251002);
  await query(`begin; update core.identity_connection_working set destination_url='${nextUrl}',revision=4 where owner_id='${owner}';
    update core.external_destination_safety set safety_status='review',reason_codes=array['fixture'],revision=2 where normalized_url='${nextUrl}'; commit;`);
  const old=await held;assert.equal(old.connection_source_working.destination_url,sourceUrl);assert.equal(old.source_destination_safety.status,'safe');
  const fresh=await read(start);assert.equal(fresh.connection_source_working.destination_url,nextUrl);assert.equal(fresh.source_destination_safety.status,'review');
  assert.equal(fresh.source_destination_safety.revision,2);assert.equal(fresh.revision_vector.connection,4);
});
test('source and active link expiry observations advance without rewriting Working',async()=>{
  const held=heldRead(251003);await waitBarrier(251003);
  await query(`update core.external_destination_safety set checked_at=now()-interval '2 hours',expires_at=now()-interval '1 hour',revision=2
    where normalized_url in('${sourceUrl}','${linkUrl}');`);
  const old=await held;assert.equal(old.source_destination_safety.status,'safe');assert.equal(old.collection.blocks[0].destination_safety.status,'safe');
  const fresh=await read(start);assert.equal(fresh.source_destination_safety.status,'pending');assert.equal(fresh.collection.blocks[0].destination_safety.status,'pending');
  assert.deepEqual(old.revision_vector,fresh.revision_vector);
});
test('restriction after snapshot does not authorize a fresh private graph or safety read',async()=>{
  const held=heldRead(251004);await waitBarrier(251004);
  await query(`update core.owners set account_state='restricted' where id='${owner}';`);
  assert.equal((await held).status,'success');assert.deepEqual(await read(start),{status:'unavailable'});
});
after(async()=>{
  await query(`delete from core.external_destination_safety where normalized_url in('${sourceUrl}','${nextUrl}','${linkUrl}');`);
});
after(async()=>{
  await query("delete from auth.users where id in ('25100000-0000-4000-8000-000000000001','25100000-0000-4000-8000-000000000002');");
  // Preserve permanent fixture Owner/Handle identity; remove only isolated Working fixture data.
  if(fixtureOwners.length===2)await query(`delete from core.identity_block_collections_working where owner_id in (${fixtureOwners.map(id=>`'${id}'`).join(',')});
    delete from core.identity_connection_working where owner_id in (${fixtureOwners.map(id=>`'${id}'`).join(',')});
    delete from core.identity_layout_working where owner_id in (${fixtureOwners.map(id=>`'${id}'`).join(',')});
    delete from core.identity_working where owner_id in (${fixtureOwners.map(id=>`'${id}'`).join(',')});`);
});

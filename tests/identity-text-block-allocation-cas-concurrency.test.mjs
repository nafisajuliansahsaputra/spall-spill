import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';

const container = process.env.SPILL_TEST_DB_CONTAINER ?? 'supabase_db_spall-spill';
assert.match(container, /^supabase_db_spall-spill(?:-[a-z0-9-]+)?$/);
assert.ok(process.env.CI || container !== 'supabase_db_spall-spill', 'Addition CAS races require explicitly isolated test database.');
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
const actor = '9e000000-0000-4000-8000-000000000001';
const generic = '9e000000-0000-4000-8000-000000000011';
const social = '9e000000-0000-4000-8000-000000000012';
const auth = `set local request.jwt.claims='{"sub":"${actor}","role":"authenticated"}';`;
const result = output => JSON.parse(output.split('\n').find(line => line.startsWith('{')));
function remove(block, hold = false) {
  const request = { block_id: block, base_collection_revision: 1, confirm_removal:true };
  const json = `'${JSON.stringify(request)}'::jsonb`;
  return query(`begin; ${auth} select api.remove_current_owner_block_working(${json}); ${hold ? 'select pg_sleep(0.3);' : ''} commit;`).then(result);
}
function add(text) {
  const request = { action:'add_text_block',base_collection_revision:1,is_visible:false,
    text_working:{kind:'text',text} };
  return query(`begin; ${auth} select api.add_current_owner_text_block_working('${JSON.stringify(request)}'::jsonb); select pg_sleep(0.3); commit;`).then(result);
}
function visibilitySave() {
  return query(`begin; ${auth} select api.save_current_owner_block_visibility_working('{"block_id":"${generic}","base_collection_revision":1,"is_visible":true}'::jsonb); select pg_sleep(0.3); commit;`).then(result);
}
function payloadSave() {
  return query(`begin; ${auth} select api.save_current_owner_block_link_working('{"block_id":"${generic}","base_collection_revision":1,"link_working":{"kind":"generic_link","title":"payload winner","social_platform":null,"destination_url":null}}'::jsonb); select pg_sleep(0.3); commit;`).then(result);
}
function move() {
  return query(`begin; ${auth} select api.move_current_owner_block_working('{"block_id":"${generic}","base_collection_revision":1,"direction":"down"}'::jsonb); select pg_sleep(0.3); commit;`).then(result);
}
const order = () => query(`select string_agg(right(block_id::text,2),',' order by position) from core.identity_blocks_working where owner_id='${owner}';`);
const revision = () => query(`select revision from core.identity_block_collections_working where owner_id='${owner}';`);
const present = block => query(`select count(*) from core.identity_blocks_working where block_id='${block}' and owner_id='${owner}';`);
before(async () => {
  await query('create extension if not exists pgtap with schema extensions;');
  const fixture = readFileSync(new URL('../supabase/tests/database/053_owner_text_block_allocation_cas.test.sql', import.meta.url),'utf8');
  const marker = '\n-- Text allocation CAS race fixtures end here.\n'; assert.ok(fixture.includes(marker));
  const prefix = fixture.split(marker)[0]; assert.ok(prefix.startsWith('begin;'));
  const output = await query(prefix.replace('begin;', 'begin; set local search_path=public,extensions;') + '\nselect * from finish(); commit;');
  assert.doesNotMatch(output, /not ok/);
  owner = await query(`select owner_id from core.owner_auth_bindings where auth_user_id='${actor}';`);
  assert.match(owner, /^[a-f0-9-]{36}$/);
  fixtureOwners = (await query("select owner_id from core.owner_auth_bindings where auth_user_id in ('9e000000-0000-4000-8000-000000000001','9e000000-0000-4000-8000-000000000002','9e000000-0000-4000-8000-000000000003');")).split('\n');
  assert.equal(fixtureOwners.length, 3); for (const id of fixtureOwners) assert.match(id, /^[a-f0-9-]{36}$/);
});
after(async () => {
  await query(`delete from auth.users where id in ('${actor}','9e000000-0000-4000-8000-000000000002','9e000000-0000-4000-8000-000000000003');`);
  // Retain permanent Owner/Handle identities; remove only this isolated fixture's Working records.
  if (fixtureOwners.length === 3) {
    const scoped = fixtureOwners.map(id => `'${id}'`).join(',');
    await query(`delete from core.identity_block_collections_working where owner_id in (${scoped}); delete from core.identity_connection_working where owner_id in (${scoped});`);
  }
});
async function reset() {
  // Restore only these known test-owned members between competing-action cases.
  await query(`update core.owners set account_state='active' where id='${owner}';
    update core.identity_block_collections_working set revision=1 where owner_id='${owner}';
    delete from core.identity_blocks_working where owner_id='${owner}';
    insert into core.identity_blocks_working(block_id,owner_id,kind,position,is_visible) values
      ('${generic}','${owner}','generic_link',1,false),('${social}','${owner}','social',7,true),
      ('9e000000-0000-4000-8000-000000000013','${owner}','text',42,true),
      ('9e000000-0000-4000-8000-000000000015','${owner}','contact',100,true),
      ('9e000000-0000-4000-8000-000000000016','${owner}','media',500,true),
      ('9e000000-0000-4000-8000-000000000017','${owner}','spill_cta',1000,true);
    insert into core.identity_block_links_working(block_id,owner_id,kind,title,social_platform,destination_url)
      values('${generic}','${owner}','generic_link','original',null,'https://original.example.test');`);
}
async function waitLock(sentinel) {
  for (let i = 0; i < 30; i++) {
    if (await query(`select exists(select 1 from pg_locks where locktype='advisory' and classid=1936744812 and objid=${sentinel} and objsubid=2 and granted);`) === 't') return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.fail('Holding transaction did not acquire row lock before sentinel');
}

const added = () => query(`select count(*) from core.identity_blocks_working where owner_id='${owner}' and position=1001;`);
async function assertAddition(reply,title) {
  assert.match(reply.block_id,/^[a-f0-9-]{36}$/);
  assert.deepEqual(Object.keys(reply).sort(),['block_id','collection_revision','status']);
  assert.equal(reply.collection_revision,2);
  assert.equal(await query(`select text_content from core.identity_block_texts_working where block_id='${reply.block_id}' and owner_id='${owner}' and kind='text';`),title);
  assert.equal(await query(`select is_visible from core.identity_blocks_working where block_id='${reply.block_id}' and owner_id='${owner}' and position=1001;`),'f');
  assert.equal(await query(`select source_connection_revision from core.identity_block_initialization_provenance where owner_id='${owner}';`),'3');
}
test('parallel same-base additions have one atomic server allocation and stale loser',async()=>{
  await reset();const replies=await Promise.all([add('first'),add('second')]);
  assert.deepEqual(replies.map(x=>x.status).sort(),['stale_write','success']);
  const index=replies.findIndex(x=>x.status==='success');await assertAddition(replies[index],index===0?'first':'second');
  assert.equal(await added(),'1');assert.equal(await revision(),'2');
  assert.equal(await query(`select count(*) from core.identity_blocks_working where owner_id='${owner}';`),'7');
});
for(const [name,compete] of [['payload',payloadSave],['visibility',visibilitySave],['move',move],['removal',()=>remove(generic,true)]]) {
  test(`addition versus ${name} has one aggregate winner without stale member or payload writes`,async()=>{
    await reset();const replies=await Promise.all([add('addition winner'),compete()]);
    assert.deepEqual(replies.map(x=>x.status).sort(),['stale_write','success']);
    const wins=replies[0].status==='success';if(wins)await assertAddition(replies[0],'addition winner');
    assert.equal(await added(),wins?'1':'0');assert.equal(await revision(),'2');
    assert.equal(await present(generic),!wins&&name==='removal'?'0':'1');
    assert.equal(await query(`select title from core.identity_block_links_working where block_id='${generic}';`),
      !wins&&name==='removal'?'':!wins&&name==='payload'?'payload winner':'original');
    assert.equal(await query(`select is_visible from core.identity_blocks_working where block_id='${generic}';`),
      !wins&&name==='removal'?'':!wins&&name==='visibility'?'t':'f');
    assert.equal(await query(`select position from core.identity_blocks_working where block_id='${generic}';`),
      !wins&&name==='removal'?'':!wins&&name==='move'?'7':'1');
  });
}
test('collection advance during allocation wait rejects old base without any new block',async()=>{
  await reset();const held=query(`begin;update core.identity_block_collections_working set revision=2 where owner_id='${owner}';select pg_advisory_xact_lock(1936744812,108);select pg_sleep(2);commit;`);
  try{await waitLock(108);assert.deepEqual(await add('never'),{status:'stale_write'});assert.equal(await added(),'0');assert.equal(await order(),'11,12,13,15,16,17');assert.equal(await revision(),'2');}finally{await held;}
});
test('restriction during Owner wait denies allocation without any new block',async()=>{
  await reset();const held=query(`begin;update core.owners set account_state='restricted' where id='${owner}';select pg_advisory_xact_lock(1936744812,109);select pg_sleep(2);commit;`);
  try{await waitLock(109);assert.deepEqual(await add('never'),{status:'owner_not_eligible'});assert.equal(await added(),'0');assert.equal(await order(),'11,12,13,15,16,17');assert.equal(await revision(),'1');}finally{await held;}
});

test('same-base additions at999 preserve one bounded1000 winner and complete paged readback', async () => {
  await reset();
  await query(`insert into core.identity_blocks_working(owner_id,kind,position,is_visible)
    select '${owner}','contact',g,false from generate_series(1001,1993) g;`);
  assert.equal(await query(`select count(*) from core.identity_blocks_working where owner_id='${owner}';`),'999');
  const replies = await Promise.all([add('capacity first'),add('capacity second')]);
  assert.deepEqual(replies.map(x=>x.status).sort(),['stale_write','success']);
  const winner = replies.find(x=>x.status==='success');
  assert.deepEqual(Object.keys(winner).sort(),['block_id','collection_revision','status']);
  assert.equal(winner.collection_revision,2);
  assert.equal(await revision(),'2');
  const expected = await query(`select jsonb_agg(block_id::text order by position) from core.identity_blocks_working where owner_id='${owner}';`);
  assert.equal(JSON.parse(expected).length,1000);
  const fresh = { action:'add_text_block',base_collection_revision:2,is_visible:false,
    text_working:{kind:'text',text:'must not allocate'} };
  assert.deepEqual(await query(`begin; ${auth} select api.add_current_owner_text_block_working('${JSON.stringify(fresh)}'::jsonb); commit;`).then(result),{status:'unavailable'});
  assert.equal(await revision(),'2');
  assert.equal(await query(`select jsonb_agg(block_id::text order by position) from core.identity_blocks_working where owner_id='${owner}';`),expected);
  assert.deepEqual(await query(`begin; ${auth} select api.resolve_current_owner_blocks_working(); commit;`).then(result),{status:'unavailable'});
  const rows = []; let request = {expected_collection_revision:null,after_position:null};
  let terminal = false;
  for(let pageIndex=0;pageIndex<10;pageIndex++) {
    const page = await query(`begin; ${auth} select api.resolve_current_owner_blocks_working_page('${JSON.stringify(request)}'::jsonb); commit;`).then(result);
    assert.equal(page.status,'success');assert.equal(page.collection.revision,2);
    assert.equal(page.current_handle,'text-add-000001');assert.equal(page.primary_use_case,'personal');
    assert.equal(page.collection.blocks.length,100);
    rows.push(...page.collection.blocks);
    const last = rows.at(-1).position;
    assert.equal(page.collection.has_more,pageIndex<9);
    assert.equal(page.collection.next_after_position,pageIndex<9?last:null);
    if(!page.collection.has_more){terminal=true;break;}
    request={expected_collection_revision:2,after_position:last};
  }
  assert.equal(terminal,true);assert.equal(rows.length,1000);
  assert.equal(new Set(rows.map(x=>x.block_id)).size,1000);
  assert.deepEqual(rows.map(x=>x.block_id),JSON.parse(expected));
  assert.ok(rows.every((x,i)=>i===0||rows[i-1].position<x.position));
  const allocated = rows.find(x=>x.block_id===winner.block_id);
  assert.equal(allocated.position,1994);assert.equal(allocated.is_visible,false);
  assert.equal(allocated.kind,'text');assert.equal(allocated.payload_state,'not_implemented');assert.equal(allocated.link_working,null);
  const selected = await query(`begin; ${auth} select api.resolve_current_owner_text_block_working('${winner.block_id}'); commit;`).then(result);
  assert.equal(selected.status,'success');assert.equal(selected.collection_revision,2);
  assert.equal(selected.block.payload_state,'present');
  assert.deepEqual(selected.block.text_working,{text:replies[0].status==='success'?'capacity first':'capacity second'});
  assert.equal(await query(`select source_connection_revision from core.identity_block_initialization_provenance where owner_id='${owner}';`),'3');
});

test('Text and Link additions share the aggregate CAS without a second typed allocation', async()=>{
  await reset();
  const request={action:'add_link_block',base_collection_revision:1,is_visible:true,
    link_working:{kind:'generic_link',title:'Link winner',social_platform:null,destination_url:null}};
  const link=query(`begin; ${auth} select api.add_current_owner_link_block_working('${JSON.stringify(request)}'::jsonb); select pg_sleep(0.3); commit;`).then(result);
  const replies=await Promise.all([add('Text winner'),link]);
  assert.deepEqual(replies.map(x=>x.status).sort(),['stale_write','success']);
  const textWins=replies[0].status==='success';
  assert.equal(await query(`select count(*) from core.identity_block_texts_working where owner_id='${owner}';`),textWins?'1':'0');
  assert.equal(await query(`select count(*) from core.identity_block_links_working where owner_id='${owner}';`),textWins?'1':'2');
  if(textWins)await assertAddition(replies[0],'Text winner');
  else assert.equal(await query(`select title from core.identity_block_links_working where block_id='${replies[1].block_id}' and owner_id='${owner}';`),'Link winner');
  assert.equal(await revision(),'2');assert.equal(await added(),'1');
  assert.equal(await query(`select count(*) from core.identity_blocks_working where owner_id='${owner}';`),'7');
});

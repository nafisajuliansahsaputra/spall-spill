import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { test } from 'node:test';
const container=process.env.SPILL_TEST_DB_CONTAINER??'supabase_db_spall-spill';
const database=process.env.SPILL_TEST_DB_NAME??'postgres';
assert.match(container,/^supabase_db_spall-spill(?:-[a-z0-9-]+)?$/);
assert.match(database,/^(postgres|spall_starter_recovery_[a-z0-9_]+)$/);
assert.ok(process.env.CI||database!=='postgres'||container!=='supabase_db_spall-spill','Requires isolated test storage');
function session(sql,keepOpen=false){
 const child=spawn('docker',['exec','-i',container,'psql','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-qAt'],{stdio:['pipe','pipe','pipe'],timeout:30000});let out='',errors='';
 let mark;const ready=new Promise(resolve=>{mark=resolve;});
 const done=new Promise((resolve,reject)=>{child.stdout.on('data',x=>{out+=x;if(out.includes('owner_locked'))mark();});child.stderr.on('data',x=>errors+=x);child.on('error',reject);child.stdin.on('error',reject);child.on('close',code=>code===0?resolve(out.trim()):reject(Error(errors||`psql exit ${code}`)));});
 if(keepOpen)child.stdin.write(sql);else child.stdin.end(sql);return {done,ready,release:()=>child.stdin.end('commit;\n')};
}
const query=sql=>session(sql).done;
test('Resource creation serializes duplicate/distinct intents and preserves raw Working CAS',async()=>{
 const subject=randomUUID(),key=randomUUID(),handle='resource267-'+subject.replaceAll('-','').slice(0,15);let owner;
 try{
  await query(`begin;insert into auth.users(id,email)values('${subject}','${subject}@example.test');
   update core.owners set onboarding_completed_at=now() where id=(select owner_id from core.owner_auth_bindings where auth_user_id='${subject}');
   update core.owner_onboarding_progress set current_step='preview_publish',primary_use_case='personal' where owner_id=(select owner_id from core.owner_auth_bindings where auth_user_id='${subject}');
   insert into core.owner_handle_namespaces(normalized_handle,owner_id,namespace_kind)select '${handle}',owner_id,'current' from core.owner_auth_bindings where auth_user_id='${subject}';
   insert into core.identity_working(owner_id,display_name,revision)select owner_id,'Resource Owner',1 from core.owner_auth_bindings where auth_user_id='${subject}';
   insert into core.identity_layout_working(owner_id,starter_key,revision)select owner_id,'clean',1 from core.owner_auth_bindings where auth_user_id='${subject}';commit;`);
  owner=await query(`select owner_id from core.owner_auth_bindings where auth_user_id='${subject}';`);assert.match(owner,/^[a-f0-9-]{36}$/);
  const create=async(creation,title='Resource')=>JSON.parse(await query(`begin;set local role service_role;select api.execute_owner_resource_catalog_server('${subject}','create_current_owner_resource_draft','${JSON.stringify({input_draft:{creation_id:creation,resource_type:'document',title,source_url:null}})}');commit;`));
  const locked=session(`begin;select id from core.owners where id='${owner}' for update;select 'owner_locked';\n`,true);
  await Promise.race([locked.ready,locked.done.then(()=>{throw Error('Owner barrier exited before release');})]);
  const duplicate=Promise.all([create(key),create(key)]);
  try{
   const deadline=Date.now()+5000;let blocked=0;
   while(blocked<2){blocked=Number(await query(`select count(*) from pg_stat_activity where wait_event_type='Lock' and query like '%execute_owner_resource_catalog_server%' and query like '%${subject}%';`));if(blocked<2){assert.ok(Date.now()<deadline,'Both real requests must wait behind the Owner lock');await new Promise(resolve=>setTimeout(resolve,25));}}
  }finally{locked.release();await locked.done;}

  const same=await duplicate;assert.deepEqual(same[0],same[1]);assert.equal(same[0].reference,1);
  const distinct=await Promise.all([create(randomUUID(),'Second'),create(randomUUID(),'Third')]);assert.deepEqual(distinct.map(x=>x.reference).sort(),[2,3]);
  assert.equal((await create(key,'Changed intent')).status,'conflicting_intent');
  assert.equal(await query(`select count(*) from core.workspace_resource_drafts where owner_id='${owner}';`),'3');
  const save=async title=>JSON.parse(await query(`begin;set local role service_role;select api.execute_owner_starter_recovery_server('${subject}','save_current_owner_starter_item_working','${JSON.stringify({input_working:{reference:1,base_source_revision:1,base_working_revision:null,working:{title,source_url:'raw pending source',resource_type:'portfolio'}}})}');commit;`));
  assert.deepEqual((await Promise.all([save('Raw A'),save('Raw B')])).map(x=>x.status).sort(),['stale_write','success']);
  assert.equal(await query(`select title from core.workspace_resource_drafts where owner_id='${owner}' and spill_reference=1;`),'Resource');
  assert.equal(await query(`select count(*) from core.spill_item_identity_registry where owner_id='${owner}';`),'3');
 }finally{
  await query(`delete from auth.users where id='${subject}';`);
  if(owner){const reserved=await query(`select count(*) from core.spill_item_identity_registry where owner_id='${owner}';`);await query(`delete from core.owner_handle_namespaces where owner_id='${owner}';delete from core.owners where id='${owner}';`);
   assert.equal(await query(`select count(*) from core.workspace_resource_drafts where owner_id='${owner}';`),'0');
   assert.equal(await query(`select count(*) from core.spill_item_identity_registry where owner_id='${owner}';`),reserved);
  }
 }
});

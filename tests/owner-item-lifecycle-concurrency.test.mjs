import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {test} from 'node:test';
const container=process.env.SPILL_TEST_DB_CONTAINER??'supabase_db_spall-spill';
const database=process.env.SPILL_TEST_DB_NAME??'postgres';
assert.match(container,/^supabase_db_spall-spill(?:-[a-z0-9-]+)?$/);
assert.match(database,/^(postgres|spall_lifecycle_[a-z0-9_]+)$/);
assert.ok(process.env.CI||container!=='supabase_db_spall-spill'||database!=='postgres','Isolated test database required');
function session(sql,open=false){
 const child=spawn('docker',['exec','-i',container,'psql','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-qAt'],{stdio:['pipe','pipe','pipe'],timeout:30000});let out='',err='',mark;
 const ready=new Promise(r=>{mark=r;});const done=new Promise((resolve,reject)=>{child.stdout.on('data',v=>{out+=v;if(out.includes('owner_locked'))mark();});child.stderr.on('data',v=>err+=v);child.on('error',reject);child.stdin.on('error',reject);child.on('close',code=>code===0?resolve(out.trim()):reject(Error(err||`psql exit ${code}`)));});
 if(open)child.stdin.write(sql);else child.stdin.end(sql);return {ready,done,release:()=>child.stdin.end('commit;\n')};
}
const query=sql=>session(sql).done;
test('lifecycle real lock barriers serialize replay/stale commands and restriction wins',async()=>{
 const subject=randomUUID(),handle='life282-'+subject.replaceAll('-','').slice(0,15);
 await query(`begin;insert into auth.users(id,email)values('${subject}','${subject}@example.test');
 update core.owners set onboarding_completed_at=now() where id=(select owner_id from core.owner_auth_bindings where auth_user_id='${subject}');
 update core.owner_onboarding_progress set current_step='preview_publish',primary_use_case='personal' where owner_id=(select owner_id from core.owner_auth_bindings where auth_user_id='${subject}');
 insert into core.owner_handle_namespaces(normalized_handle,owner_id,namespace_kind)select '${handle}',owner_id,'current' from core.owner_auth_bindings where auth_user_id='${subject}';
 insert into core.identity_publications(owner_id,snapshot,identity_revision,layout_revision,published_at)select owner_id,'{"display_name":"Lifecycle fixture","bio":null,"starter_key":"clean","profile_asset_key":null,"connection":null}',1,1,now() from core.owner_auth_bindings where auth_user_id='${subject}';
 insert into core.workspace_resource_drafts(owner_id,creation_id,resource_type,title,source_url)select owner_id,gen_random_uuid(),'website','Published Resource','https://resource.example.test/a' from core.owner_auth_bindings where auth_user_id='${subject}';
 insert into core.spill_item_publications(item_id,owner_id,item_type,spill_reference,working_revision,snapshot,published_at)select d.id,d.owner_id,'resource',d.spill_reference,1,jsonb_build_object('resource_type',d.resource_type,'title',d.title,'source_url',d.source_url),now() from core.workspace_resource_drafts d join core.owner_auth_bindings b on b.owner_id=d.owner_id where b.auth_user_id='${subject}';commit;`);
 const owner=await query(`select owner_id from core.owner_auth_bindings where auth_user_id='${subject}';`);assert.match(owner,/^[a-f0-9-]{36}$/);
 const command=(action,state,revision,intent=randomUUID())=>({intent_id:intent,reference:1,action,expected_lifecycle:state,expected_revision:revision,confirmed:action==='archive'});
 const call=async c=>JSON.parse(await query(`begin;set local role service_role;select api.execute_owner_spill_lifecycle_server('${subject}','change_current_owner_spill_lifecycle','${JSON.stringify({input_command:c})}');commit;`));
 async function race(commands,restrict=false){
  const lock=session(`begin;select id from core.owners where id='${owner}' for update;${restrict?`update core.owners set account_state='restricted' where id='${owner}';`:''}select 'owner_locked';\n`,true);
  await Promise.race([lock.ready,lock.done.then(()=>{throw Error('Owner lock exited early');})]);const pending=Promise.all(commands.map(call));
  try{const until=Date.now()+5000;let waiting=0;while(waiting<commands.length){waiting=Number(await query(`select count(*) from pg_stat_activity where wait_event_type='Lock' and query like '%execute_owner_spill_lifecycle_server%' and query like '%${subject}%';`));if(waiting<commands.length){assert.ok(Date.now()<until,'Every actual command must block on Owner lock');await new Promise(r=>setTimeout(r,25));}}}
  finally{lock.release();await lock.done;}return pending;
 }
 const hide=command('hide','published',1);const duplicates=await race([hide,hide]);assert.deepEqual(duplicates[0],duplicates[1]);assert.equal(duplicates[0].revision,2);
 assert.equal(await query(`select count(*) from core.spill_lifecycle_commands where owner_id='${owner}';`),'1');
 assert.equal(await query(`select actor_subject from core.spill_lifecycle_commands where owner_id='${owner}';`),subject);
 assert.equal((await call(command('restore','hidden',2))).revision,3);
 const distinct=await race([command('hide','published',3),command('archive','published',3)]);assert.deepEqual(distinct.map(x=>x.status).sort(),['stale_write','success']);
 assert.equal(await query(`select publication_revision from core.spill_item_publications where owner_id='${owner}';`),'4');
 const old=await call(hide);assert.equal(old.revision,2);assert.equal(await query(`select publication_revision from core.spill_item_publications where owner_id='${owner}';`),'4');
 const state=await query(`select lifecycle_state from core.spill_item_publications where owner_id='${owner}';`);
 const denied=await race([command('restore',state,4)],true);assert.equal(denied[0].status,'owner_not_eligible');assert.equal((await call(hide)).status,'owner_not_eligible');
 assert.equal(await query(`select snapshot->>'title' from core.spill_item_publications where owner_id='${owner}';`),'Published Resource');
 assert.equal(await query(`select spill_reference from core.spill_item_publications where owner_id='${owner}';`),'1');
 // The isolated database/container is disposable. Immutable receipt fixtures stay
 // until test-runtime teardown; do not bypass receipt controls to clean them up.
});

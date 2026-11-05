import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { test } from 'node:test';
const container=process.env.SPILL_TEST_DB_CONTAINER??'supabase_db_spall-spill';
const database=process.env.SPILL_TEST_DB_NAME??'postgres';
assert.match(container,/^supabase_db_spall-spill(?:-[a-z0-9-]+)?$/);
assert.match(database,/^(postgres|spall_(?:profile_editor|starter_recovery)_[a-z0-9_]+)$/);
assert.ok(process.env.CI||database!=='postgres'||container!=='supabase_db_spall-spill','Requires isolated test storage');
function query(sql) { return new Promise((resolve,reject)=>{
 const child=spawn('docker',['exec','-i',container,'psql','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-qAt'],{stdio:['pipe','pipe','pipe'],timeout:30000});
 let output='',errors='';child.stdout.on('data',x=>{output+=x;});child.stderr.on('data',x=>{errors+=x;});child.on('error',reject);child.stdin.on('error',reject);
 child.on('close',code=>code===0?resolve(output.trim()):reject(new Error(errors||`psql exited ${code}`)));child.stdin.end(sql);
}); }
test('starter recovery gateway preserves one winner and stable identity under simultaneous Working creation',async()=>{
 const subject=randomUUID(); const handle='starter261-'+subject.replaceAll('-','').slice(0,16);
 let owner;
 try {
  await query(`begin; insert into auth.users(id,email) values('${subject}','${subject}@example.test');
   update core.owners set onboarding_completed_at=now() where id=(select owner_id from core.owner_auth_bindings where auth_user_id='${subject}');
   update core.owner_onboarding_progress set current_step='preview_publish',primary_use_case='personal' where owner_id=(select owner_id from core.owner_auth_bindings where auth_user_id='${subject}');
   insert into core.owner_handle_namespaces(normalized_handle,owner_id,namespace_kind) select '${handle}',owner_id,'current' from core.owner_auth_bindings where auth_user_id='${subject}';
   insert into core.identity_working(owner_id,display_name,bio,revision) select owner_id,'Source',null,2 from core.owner_auth_bindings where auth_user_id='${subject}';
   insert into core.identity_layout_working(owner_id,starter_key,revision) select owner_id,'clean',1 from core.owner_auth_bindings where auth_user_id='${subject}'; commit;`);
  await query(`insert into core.product_drafts(owner_id,source_url,title,revision) select owner_id,'https://shop.example.test/item','Source Product',2 from core.owner_auth_bindings where auth_user_id='${subject}';`);
  owner=await query(`select owner_id from core.owner_auth_bindings where auth_user_id='${subject}';`);assert.match(owner,/^[a-f0-9-]{36}$/);
  const save=async name=>{
   const payload=JSON.stringify({input_working:{reference:1,base_source_revision:2,base_working_revision:null,working:{title:name,source_url:'raw incomplete source',resource_type:null}}});
   return JSON.parse(await query(`begin;set local role service_role;select api.execute_owner_starter_recovery_server('${subject}','save_current_owner_starter_item_working','${payload}'::jsonb);commit;`));
  };
  const replies=await Promise.all([save(' Raw A '),save(' Raw B ')]);
  assert.deepEqual(replies.map(x=>x.status).sort(),['stale_write','success']);
  const saved=JSON.parse(await query(`select jsonb_build_object('name',title,'revision',revision) from core.starter_item_working where owner_id='${owner}';`));
  assert.equal(saved.revision,1);assert.ok([' Raw A ',' Raw B '].includes(saved.name));
  assert.equal((await save('Replay')).status,'stale_write');
  assert.equal(await query(`select title from core.product_drafts where owner_id='${owner}';`),'Source Product');
  assert.equal(await query(`select count(*) from core.spill_item_identity_registry where owner_id='${owner}';`),'1');
 } finally {
  await query(`delete from auth.users where id='${subject}';`);
  if(owner)await query(`delete from core.starter_item_working where owner_id='${owner}';delete from core.product_drafts where owner_id='${owner}';delete from core.identity_layout_working where owner_id='${owner}';delete from core.identity_working where owner_id='${owner}';`);
 }
});

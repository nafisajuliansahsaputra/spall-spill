import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

const container = process.env.SPILL_TEST_DB_CONTAINER ?? 'supabase_db_spall-spill';
assert.match(container, /^supabase_db_spall-spill(?:-[a-z0-9-]+)?$/);
assert.ok(process.env.CI || container !== 'supabase_db_spall-spill', 'Local Product review races require an explicitly isolated test container.');
function query(sql) {
  return new Promise((resolve,reject) => {
    const child = spawn('docker',['exec','-i',container,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-qAt'], {
      windowsHide: true, stdio: ['pipe','pipe','pipe'], timeout: 30_000,
    });
    let output=''; let errors='';
    child.stdout.on('data',(data) => { output+=data; }); child.stderr.on('data',(data) => { errors+=data; });
    child.on('error',reject); child.stdin.on('error',reject);
    child.on('close',(code) => code===0 ? resolve(output.trim()) : reject(new Error(errors || `psql exited ${code}`)));
    child.stdin.end(sql);
  });
}
const rows = (output) => output.split('\n').filter((line) => line.startsWith('{')).map((line) => JSON.parse(line));
test('a concurrent preparation save makes the old preview receipt unusable for Publish', async () => {
  const authId=randomUUID(); const handle=`review-${authId.slice(0,8)}`; let ownerId;
  const claims=`set local request.jwt.claims='{"role":"authenticated","sub":"${authId}"}';`;
  const auth=`set local role authenticated; ${claims}`;
  try {
    await query(`insert into auth.users(id,email) values('${authId}','${handle}@example.test');`);
    ownerId=await query(`select owner_id from core.owner_auth_bindings where auth_user_id='${authId}';`);
    assert.match(ownerId,/^[a-f0-9-]{36}$/);
    const setup=await query(`begin; ${auth}
      select api.claim_current_owner_handle('${handle}',1);
      select api.set_current_owner_primary_use_case('affiliate',2);
      select api.save_current_owner_basic_identity('Product review race',null,null,3);
      select api.save_current_owner_starter_composition('featured',null,4);
      select api.save_current_owner_product_draft('https://shopee.co.id/item','Review Product',null);
      select api.save_current_product_preparation(null,'[{"provider_key":"shopee","destination_url":"https://shopee.co.id/item?affiliate=one"}]',1,null);
      select api.advance_current_owner_relevant_first_job(5); commit;`);
    for(const row of rows(setup)) assert.equal(row.status,'success');
    const preview=rows(await query(`begin; ${auth} select api.resolve_current_onboarding_preview(); commit;`))[0];
    const confirm=(hash) => query(`begin; ${auth} select api.confirm_current_onboarding_preview('${hash}'); commit;`).then((out) => rows(out)[0]);
    const receipt=await confirm(preview.snapshot_hash); assert.equal(receipt.status,'success');
    const [saved,review]=await Promise.all([
      query(`begin; ${auth} select api.save_current_product_preparation(null,'[{"provider_key":"shopee","destination_url":"https://shopee.co.id/item?affiliate=two"}]',1,1); select pg_sleep(0.2); commit;`).then((out) => rows(out)[0]),
      confirm(preview.snapshot_hash),
    ]);
    assert.equal(saved.status,'success'); assert.ok(['success','stale_preview'].includes(review.status));
    assert.equal((await confirm(preview.snapshot_hash)).status,'stale_preview');
    // Isolated privileged test of the still-withheld staged Publish transaction.
    const publish=rows(await query(`begin; ${claims} select api.publish_current_onboarding('${receipt.receipt_id}','${receipt.snapshot_hash}','identity_only'); commit;`))[0];
    assert.equal(publish.status,'stale_preview');
    assert.equal(await query(`select count(*) from core.identity_publications where owner_id='${ownerId}';`),'0');
    assert.equal(await query(`select onboarding_completed_at is null from core.owners where id='${ownerId}';`),'t');
    const current=rows(await query(`begin; ${auth} select api.resolve_current_onboarding_preview(); commit;`))[0];
    assert.notEqual(current.snapshot_hash,preview.snapshot_hash);
    const newReceipt=await confirm(current.snapshot_hash); assert.equal(newReceipt.status,'success');
    assert.notEqual(newReceipt.receipt_id,receipt.receipt_id);
    assert.equal(await query(`select count(*) from core.onboarding_preview_receipts where owner_id='${ownerId}';`),'1');
    assert.equal(await query(`select revision from core.product_drafts where owner_id='${ownerId}';`),'1');
    assert.equal(await query(`select revision from core.owner_onboarding_progress where owner_id='${ownerId}';`),'6');
  } finally {
    await query(`delete from auth.users where id='${authId}';`);
    if(ownerId) await query(`delete from core.product_drafts where owner_id='${ownerId}';`);
  }
});

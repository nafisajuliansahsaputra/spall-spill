import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { after, test } from 'node:test';
const container = process.env.SPILL_TEST_DB_CONTAINER ?? 'supabase_db_spall-spill';
assert.match(container, /^supabase_db_spall-spill(?:-[a-z0-9-]+)?$/);
assert.ok(process.env.CI || container !== 'supabase_db_spall-spill', 'Retention tests require an explicitly isolated test container.');
const job = "(select jobid from cron.job where jobname='spall-product-click-retention-v1' and username='postgres')";
const keys = Array.from({ length: 6 }, () => createHash('sha256').update(randomBytes(32)).digest('hex'));
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
const pause = () => new Promise(resolve => setTimeout(resolve, 200));
const restore = () => query(`select cron.alter_job(${job},schedule:='* * * * *',active:=false);`);
after(async () => {
  await restore();
  await query(`delete from core.product_click_intents where token_hash in (${keys.map(k => `'${k}'`).join(',')});`);
});
test('a competing retention tick returns busy without blocking or duplicating cleanup', async () => {
  const held = query('begin; select pg_advisory_xact_lock(1936744812,1); select pg_sleep(3); commit;');
  try {
    let acquired = false;
    for (let i = 0; i < 10; i++) {
      if (await query("select exists(select 1 from pg_locks where locktype='advisory' and classid=1936744812 and objid=1 and objsubid=2 and granted);") === 't') { acquired = true; break; }
      await pause();
    }
    assert.ok(acquired, 'Holding connection actually acquired the transaction advisory lock');
    const result = JSON.parse(await query('select core.run_product_click_retention_tick();'));
    assert.deepEqual(result, { status: 'busy', intents_deleted: 0, history_deleted: 0 });
  } finally { await held; }
});
test('real isolated cron execution removes expired intents and retains unexpired authority', async () => {
  assert.equal(await query(`select active from cron.job where jobid=${job};`), 'f');
  const ms = Number(await query('select floor(extract(epoch from clock_timestamp())*1000)::bigint;'));
  const records = keys.map((key, index) => {
    const issued = index < 5 ? ms - 130000 : ms;
    const value = { purpose: 'published-product-click-v1', confirmation_hash: 'a'.repeat(64),
      binding: { handle: 'retention-fixture', spill_reference: 1, provider_key: 'shopee', publication_token: 'a'.repeat(64), destination_hash: 'b'.repeat(64) },
      issued_at: issued, expires_at: issued + 120000 };
    return `('${key}','${JSON.stringify(value)}'::jsonb)`;
  });
  await query(`insert into core.product_click_intents(token_hash,record) values ${records.join(',')};`);
  const baseline = await query(`select coalesce(max(runid),0) from cron.job_run_details where jobid=${job};`);
  assert.match(baseline, /^\d+$/);
  try {
    await query(`select cron.alter_job(${job},schedule:='1 second',active:=true);`);
    let observed = false;
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      const succeeded = await query(`select exists(select 1 from cron.job_run_details where jobid=${job} and runid>${baseline} and status='succeeded');`);
      if (succeeded === 't') { observed = true; break; }
      await pause();
    }
    assert.ok(observed, 'Actual cron worker completed the fixed SQL command');
    assert.equal(await query(`select count(*) from core.product_click_intents where token_hash in (${keys.slice(0,5).map(k => `'${k}'`).join(',')});`), '0');
    assert.equal(await query(`select count(*) from core.product_click_intents where token_hash='${keys[5]}';`), '1');
  } finally { await restore(); }
  assert.equal(await query(`select active::text||':'||schedule from cron.job where jobid=${job};`), 'false:* * * * *');
});

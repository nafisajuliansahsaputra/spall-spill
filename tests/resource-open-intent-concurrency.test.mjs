import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';

const container = process.env.SPILL_TEST_DB_CONTAINER ?? 'supabase_db_spall-spill';
assert.match(container, /^supabase_db_spall-spill(?:-[a-z0-9-]+)?$/);
assert.ok(process.env.CI || container !== 'supabase_db_spall-spill', 'Intent races require an explicitly isolated test container.');
const keys = [];
const tokenHash = () => { const key = createHash('sha256').update(randomBytes(32)).digest('hex'); keys.push(key); return key; };
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
const sqlJson = record => `'${JSON.stringify(record).replaceAll("'", "''")}'::jsonb`;
const record = async () => JSON.parse(await query(`select jsonb_build_object(
  'purpose','published-resource-open-v1','recognition_hash',repeat('a',64),
  'binding',api.resolve_published_resource_context_server('resource-context-renamed',1)->'binding',
  'issued_at',ms,'expires_at',ms+120000)
  from (select floor(extract(epoch from clock_timestamp())*1000)::bigint-10 as ms) t;`));
let ownerIds = [];
before(async () => {
  // Supabase's pgTAP runner installs its extension transactionally; Node connections need it explicitly.
  await query('create extension if not exists pgtap with schema extensions;');
  // Reuse only the privileged fixture prefix, never the rolled-back store assertions.
  const fixture = readFileSync(new URL('../supabase/tests/database/032_resource_open_intent_store.test.sql', import.meta.url), 'utf8');
  const marker = '\n-- Resource intent store fixtures.\n'; assert.ok(fixture.includes(marker));
  const prefix = fixture.split(marker)[0]; assert.ok(prefix.startsWith('begin;'));
  const output = await query(prefix.replace('begin;', 'begin; set local search_path=public,extensions;') + '\nselect * from finish(); commit;');
  assert.doesNotMatch(output, /not ok/);
  ownerIds = (await query(`select owner_id from core.owner_auth_bindings where auth_user_id in
    ('94000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000002');`)).split('\n');
  assert.equal(ownerIds.length, 2); for (const id of ownerIds) assert.match(id, /^[a-f0-9-]{36}$/);
});
after(async () => {
  if (keys.length) await query(`delete from core.resource_open_intents where token_hash in (${keys.map(key => `'${key}'`).join(',')});`);
  if (ownerIds.length === 2) {
    const owners = ownerIds.map(id => `'${id}'`).join(',');
    await query(`delete from core.spill_item_publications where owner_id in (${owners});
      delete from core.identity_publications where owner_id in (${owners});
      delete from core.product_drafts where owner_id in (${owners});
      delete from core.resource_drafts where owner_id in (${owners});
      delete from core.profile_media_assets where owner_id in (${owners});
      delete from core.profile_media_upload_intents where owner_id in (${owners});
      delete from auth.users where id in ('94000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000002');`);
    await query(`delete from core.external_destination_safety where normalized_url in
      ('https://portfolio.example.test/works?creator=original&campaign=A%2FB');`);
  }
});
test('parallel intent creates have one winner without overwriting the stored binding', async () => {
  const key = tokenHash(); const one = await record(); const two = { ...one, recognition_hash: 'b'.repeat(64) };
  const create = value => query(`begin; select api.create_resource_open_intent_server('${key}',${sqlJson(value)}); select pg_sleep(0.2); commit;`);
  const results = await Promise.all([create(one), create(two)]);
  assert.deepEqual([...results].sort(), ['f','t']);
  const saved = JSON.parse(await query(`select record from core.resource_open_intents where token_hash='${key}';`));
  assert.deepEqual(saved, results[0] === 't' ? one : two);
});
test('competing committed consumes return one record and subsequent replay returns null', async () => {
  const key = tokenHash(); const expected = await record();
  assert.equal(await query(`select api.create_resource_open_intent_server('${key}',${sqlJson(expected)});`), 't');
  const consume = () => query(`begin; select coalesce(api.consume_resource_open_intent_server('${key}')::text,'null'); select pg_sleep(0.2); commit;`).then(JSON.parse);
  const results = await Promise.all([consume(), consume()]);
  assert.equal(results.filter(value => value !== null).length, 1);
  assert.deepEqual(results.find(value => value !== null), expected);
  assert.equal(await consume(), null);
  assert.equal(await query(`select count(*) from core.resource_open_intents where token_hash='${key}';`), '0');
});

test('bounded cleanup skips an actually locked expired row and preserves current records', async () => {
  const locked = tokenHash(); const free = tokenHash(); const current = tokenHash();
  const value = await record();
  const ms = Number(await query('select floor(extract(epoch from clock_timestamp())*1000)::bigint;'));
  const expired = { ...value, issued_at: ms - 130000, expires_at: ms - 10000 };
  await query(`insert into core.resource_open_intents(token_hash,record) values
    ('${locked}',${sqlJson(expired)}),('${free}',${sqlJson(expired)}),('${current}',${sqlJson(value)});`);
  const held = query(`begin; select token_hash from core.resource_open_intents where token_hash='${locked}' for update;
    select pg_advisory_xact_lock(1936744812,56); select pg_sleep(4); commit;`);
  try {
    let acquired = false;
    for (let i = 0; i < 10; i++) {
      if (await query("select exists(select 1 from pg_locks where locktype='advisory' and classid=1936744812 and objid=56 and objsubid=2 and granted);") === 't') { acquired = true; break; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(acquired, 'Holding connection acquired row lock before sentinel advisory lock');
    assert.equal(await query("set statement_timeout='1s'; select api.cleanup_resource_open_intents_server(1);"), '1');
    assert.equal(await query(`select count(*) from core.resource_open_intents where token_hash='${locked}';`), '1');
    assert.equal(await query(`select count(*) from core.resource_open_intents where token_hash='${free}';`), '0');
    assert.equal(await query(`select count(*) from core.resource_open_intents where token_hash='${current}';`), '1');
  } finally { await held; }
  assert.equal(await query('select api.cleanup_resource_open_intents_server(500);'), '1');
  assert.equal(await query(`select count(*) from core.resource_open_intents where token_hash='${current}';`), '1');
});

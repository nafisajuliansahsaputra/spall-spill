import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { after, test } from 'node:test';

const webRequire = createRequire(new URL('../apps/web/package.json', import.meta.url));
const configRequire = createRequire(webRequire.resolve('eslint-config-next/core-web-vitals'));
const pluginRequire = createRequire(configRequire.resolve('@next/eslint-plugin-next'));
const { getRootDirs } = pluginRequire('./utils/get-root-dirs.js');
const plugin = configRequire('@next/eslint-plugin-next');
const { Linter } = webRequire('eslint');
const fixture = mkdtempSync(join(tmpdir(), 'spall-next-eslint-'));
for (const name of ['web', 'scanner']) mkdirSync(join(fixture, name, 'pages'), { recursive: true });
writeFileSync(join(fixture, 'web', 'pages', 'about.js'), 'export default function About() {}');
writeFileSync(join(fixture, 'file.txt'), 'not a directory');
after(() => rmSync(fixture, { recursive: true, force: true }));
const context = (rootDir) => ({ cwd: fixture, settings: { next: { rootDir } } });
const normalized = (paths) => paths.map((path) => resolve(path)).sort();

test('defaults to ESLint cwd without custom rootDir', () => {
  assert.deepEqual(getRootDirs(context(undefined)), [fixture]);
});
test('matches directory globs and excludes regular files', () => {
  assert.deepEqual(normalized(getRootDirs(context(`${fixture}/*`))),
    normalized([join(fixture, 'web'), join(fixture, 'scanner')]));
});
test('supports brace alternatives and arrays of roots', () => {
  const expected = normalized([join(fixture, 'web'), join(fixture, 'scanner')]);
  assert.deepEqual(normalized(getRootDirs(context(`${fixture}/{web,scanner}`))), expected);
  assert.deepEqual(normalized(getRootDirs(context([join(fixture, 'web'), join(fixture, 'scanner'), 42]))), expected);
});
test('handles missing roots and Windows path separators', () => {
  assert.deepEqual(getRootDirs(context(join(fixture, 'missing'))), []);
  assert.deepEqual(normalized(getRootDirs(context(join(fixture, 'web').replaceAll('/', '\\')))),
    normalized([join(fixture, 'web')]));
});
test('Next rule still rejects plain anchors to a pages route', () => {
  const messages = new Linter().verify('const link = <a href="/about">About</a>', [{
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { '@next/next': plugin },
    settings: { next: { rootDir: `${fixture}/*` } },
    rules: { '@next/next/no-html-link-for-pages': 'error' },
  }]);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].ruleId, '@next/next/no-html-link-for-pages');
});

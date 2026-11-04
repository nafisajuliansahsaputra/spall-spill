import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
const webRequire = createRequire(new URL('../apps/web/package.json', import.meta.url));
const eslintRequire = createRequire(webRequire.resolve('eslint'));
const configRequire = createRequire(webRequire.resolve('eslint-config-next/core-web-vitals'));
const parserRequire = createRequire(configRequire.resolve('@typescript-eslint/parser'));
const estreeRequire = createRequire(parserRequire.resolve('@typescript-eslint/typescript-estree'));
const legacy = eslintRequire('minimatch');
const modern = estreeRequire('minimatch');

test('legacy and modern tooling use the fixed 11.0.4 matcher with both CommonJS APIs', () => {
  assert.equal(eslintRequire('minimatch/package.json').version, '11.0.4');
  assert.equal(estreeRequire('minimatch/package.json').version, '11.0.4');
  assert.equal(typeof legacy, 'function');
  assert.equal(typeof modern.minimatch, 'function');
  assert.equal(typeof modern.Minimatch, 'function');
  assert.equal(legacy.minimatch, legacy);
});
test('preserves real lint file matching, exclusions, dotfiles and brace alternatives', () => {
  for (const [file, pattern, options, expected] of [
    ['src/page.tsx', '**/*.{ts,tsx}', {}, true], ['src/page.js', '**/*.{ts,tsx}', {}, false],
    ['node_modules/pkg/index.js', '!node_modules/**', {}, false], ['src/page.js', '!node_modules/**', {}, true],
    ['.hidden/test.ts', '**/*.ts', {}, false], ['.hidden/test.ts', '**/*.ts', { dot: true }, true],
    ['a/b/c.ts', 'a/**/c.ts', {}, true], ['a/b/c.ts', 'a/*/c.ts', {}, true],
    ['a/b/deep/c.ts', 'a/*/c.ts', {}, false], ['src/page.ts', 'src/+(page|layout).ts', {}, true],
  ]) {
    assert.equal(legacy(file, pattern, options), expected);
    assert.equal(modern.minimatch(file, pattern, options), expected);
    assert.equal(new modern.Minimatch(pattern, options).match(file), expected);
  }
  assert.deepEqual(legacy.match(['a.ts', 'b.js', 'c.tsx'], '*.{ts,tsx}'), ['a.ts', 'c.tsx']);
  // 11.x deliberately removes regex generation; never reintroduce the unsafe API.
  assert.equal(legacy.makeRe, undefined);
});

# Next ESLint dependency remediation

## Scope and reason

`braces@3.0.3` / GHSA-vfj7-8cjw-p6xm entered only through
`eslint-config-next -> @next/eslint-plugin-next -> fast-glob -> micromatch`.
The advisory has no published fixed version. Upgrading fast-glob or micromatch
does not remove that dependency.

The version-scoped pnpm patch replaces the plugin's sole fast-glob use in
`dist/utils/get-root-dirs.js` with stable Node 24 `fs.globSync`, followed by a
directory-only filter. The accompanying version-scoped override removes the
unused fast-glob dependency and its vulnerable tree. All Next ESLint rules remain
enabled. No advisory suppression, fake version, or accepted-risk exception is used.

This repository already requires Node >=24.19.0 <25, including CI. Do not reuse
this patch in a project with an older Node runtime. When upgrading the plugin,
review its upstream implementation and remove or regenerate both patch and
override together; do not silently carry the old patch to a different version.

## Verification

- Frozen install passes the existing supply-chain policy.
- `pnpm why braces -r` returns no dependency path; the regenerated lockfile has
  no braces, micromatch, or fast-glob package entries.
- `pnpm audit --audit-level high --json`: zero findings at every severity.
- Five Node regression tests cover default cwd, directory filtering, brace
  alternatives, root arrays, missing roots, Windows separators, and actual
  `no-html-link-for-pages` rejection. CI executes these tests.
- Typecheck, lint, 410 Vitest tests, 17 auth navigation tests, and all three
  production builds pass locally.
- [Security run 37218867679](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37218867679)
  passed Dependency Scan, SAST, and Secret Scan for `5504842`.
- [CI run 37218867718](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37218867718)
  passed Application and Database for `5504842`, including all 779 pgTAP tests
  across 14 files and database lint with no schema errors.

This remediation does not close S5/S6 or live destination provider verification.

Sources: [GitHub advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm),
[Node 24 fs.globSync](https://nodejs.org/docs/latest-v24.x/api/fs.html#fsglobsyncpattern-options).

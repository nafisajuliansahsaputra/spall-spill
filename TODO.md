# Spall Spill — Active Implementation TODO

**Branch baseline:** `m0/foundation@013b23744668c2ee13b7c4a4910ee237a9080ea7`  
**Last audited:** 2026-10-04

This checklist tracks the active implementation branch. Product authority remains
`docs/product-spec/PRODUCT-SOURCE-OF-TRUTH.md` and its locked contracts.
The Phase 1 checklist on main describes an older documentation-only baseline;
do not recreate the existing foundation from that checklist.

## Current evidence

- The active branch contains the workspace, Next.js application, Auth, Owner
  resolver, local Supabase migrations/policy tests, and profile-media integration.
- The canonical index records O01-S4 as CLOSED / VERIFIED.
- Later commits already implement Relevant First Job foundation
  (`40f50d16e6bb81ea28a77ee59be846dc83ff0935`) and Identity Connection Working
  (`013b23744668c2ee13b7c4a4910ee237a9080ea7`).
- CI and Security completed successfully for those two implementation commits.
- The canonical index still defers S5 mechanics. This mismatch must be reconciled
  before a new onboarding/publication checkpoint is implemented. CI success does
  not establish contract closure or manual/runtime verification.

## Auth navigation regression gate

- [x] Audit the intended-destination implementation against locked contract 12.5.
- [x] Identify that Vitest includes only `src/**/*.test.ts` and excludes the
  existing `tests/intended-destination.test.mjs` security suite.
- [x] Wire the native Node suite into `pnpm test` before Vitest, with failure
  propagation through `&&`.
- [x] Add decoding-limit, deeply encoded unsafe-path, and canonical-idempotence
  regression cases.
- [x] Run the native suite locally on Node.js 24.19.0: 17 tests passed.
- [x] Verify the full frozen install/typecheck/lint/unit/build pipeline on
  candidate `730083e42eab0af3ee6181af5fba4f468b6306f6`: Application job passed;
  17 native Node tests and 84 Vitest tests passed.
- [x] Verify Database on `f5925c1a3670ff6be8fdd8a68beed4a62000b3eb`: reset, lint,
  and 659 pgTAP tests passed (CI run `37215552832`).
- [ ] Complete Security: dependency scan remains a release blocker; see below.
- [ ] Close the candidate only after the applicable execution-protocol gates pass.

No runtime navigation, database, publication, session, or permission behavior
changes in the auth-navigation batch. The separate dependency-patch batch below
updates manifests and regenerates the lockfile.

## Next onboarding batch

- [ ] Reconcile the S5 code with the canonical Source of Truth and a JIT contract.
- [ ] Read the pinned screen-level O01 and J1–J4 records for S5/S6.
- [ ] Record existing S5 capabilities and what remains incomplete; do not infer
  that Product/Resource creation or first publication exists.
- [ ] Verify relevant S5 success/failure, stale-write, Owner isolation, and
  Working/Published runtime boundaries.
- [ ] Implement the next bounded slice only once its technical authority exists.

## Dependency-security release blocker

Security run [37215324440](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37215324440)
scanned candidate `730083e42eab0af3ee6181af5fba4f468b6306f6` and failed OSV.
Secret Scan and SAST passed. The unchanged baseline lockfile has 10 advisory
matches across 6 affected package/version entries: 1 Critical, 5 High, 4 Medium.

| Package in existing lockfile | Installed | Scanner-reported fixed version |
| --- | --- | --- |
| next | 16.3.3 | 16.3.6 |
| vitest | 4.1.10 | 4.1.11 |
| @vitest/mocker | 4.1.10 | 4.1.11 |
| brace-expansion | 1.1.18 | 1.1.21 covers the three reported fixes |
| brace-expansion | 5.0.9 | 5.0.12 covers the three reported fixes |
| braces | 3.0.3 | No fixed version reported by this scan |

These versions are evidence from this exact scan, not a promise that a package
upgrade alone makes the full application secure.

- [x] Patch Next.js and its matching eslint-config-next dependency to 16.3.6.
- [x] Patch Vitest and its resolved mocker dependency to 4.1.11.
- [x] Trace affected parents: minimatch 3/10 resolve brace-expansion;
  eslint-config-next -> @next/eslint-plugin-next -> fast-glob -> micromatch
  resolves braces. Pin compatible brace-expansion patch lines with scoped overrides.
- [ ] Remediate the remaining braces dependency without suppressing its advisory.
- [ ] Review the braces advisory and an upstream-supported remediation; do not
  suppress an unresolved finding to force a green scan.
- [x] Regenerate pnpm-lock.yaml through pnpm and run frozen-install,
  typecheck/lint/tests/build and the complete security scan (results below).
- [x] Re-run database reset/lint and all 659 database tests on patch commit.
- [ ] Complete applicable runtime verification and all release gates before merge/release.

Local dependency installation/regeneration remains blocked: pnpm is absent,
GitHub clone fails, and the npm registry request fails with EACCES. The lockfile
was generated through pnpm on a GitHub Actions runner, then read back and reviewed;
it was not hand-edited. The draft is not approved for merge or release.

## Dependency patch batch — 2026-10-04

Implementation commit: `d07d279a3f1469da37b6cc3d4a1f59b9e5957b33`.

Changes:
- Next.js and eslint-config-next: 16.3.3 -> 16.3.6, including matching Next internals.
- Vitest and @vitest/mocker: 4.1.10 -> 4.1.11, including matching Vitest internals.
- brace-expansion: 1.1.18 -> 1.1.21 and 5.0.9 -> 5.0.12 through major-scoped
  workspace overrides; no major substitution.
- pnpm 11.24.0 generated the lockfile with the existing release-age quarantine,
  trust policy, strict builds, and frozen-install policy intact.
- Local review found exactly three intended dependency files in this batch,
  with no unrelated package updates; `git diff --no-index --check` passed.
- The temporary dependency-resolution workflow exists only on
  `chore/dependency-resolution-20261004` and is not included in PR #2.

Verified evidence for that exact implementation commit:
- [CI run 37216285290](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37216285290):
  Application and Database passed.
- Frozen install, typecheck, lint, 17 native Node tests, 84 Vitest tests, and
  Next.js production build passed.
- Database reset, lint (no schema errors), and 659 pgTAP tests across 11 files passed.
- [Security run 37216285258](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37216285258):
  Secret Scan and SAST passed; Dependency Scan failed with exactly one finding.
- OSV went from 10 advisory matches to 1: 0 Critical, 1 High, 0 Medium.
  The remaining finding is `braces@3.0.3`,
  [GHSA-vfj7-8cjw-p6xm](https://osv.dev/GHSA-vfj7-8cjw-p6xm), CVSS 8.7;
  scanner reports no fixed version.
- The committed pnpm lockfile was fetched back and matched the runner output exactly.

Remaining boundaries:
- Release remains blocked by the braces finding. Its currently traced path is
  development lint tooling; this is not blanket proof that every runtime/bundled
  copy is unreachable or an accepted-risk decision.
- Resolve through an upstream-supported dependency replacement or separately
  reviewed remediation. Do not hide the advisory or weaken the security gate.
- Local full regression and targeted runtime/browser verification remain
  unavailable in this execution environment; no CLOSED / VERIFIED claim is made.
- The S5 Source of Truth/JIT contract mismatch remains a separate prerequisite
  for feature continuation. This dependency patch does not close S5 or S6.

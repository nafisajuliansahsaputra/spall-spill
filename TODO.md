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
- [ ] Verify the full frozen install/typecheck/lint/unit/build pipeline on the
  exact candidate commit.
- [ ] Verify CI Database and Security on the exact candidate commit.
- [ ] Close the candidate only after the applicable execution-protocol gates pass.

No runtime navigation, database, publication, session, or permission behavior
changes in this batch. No dependency changes or lockfile regeneration are needed.

## Next onboarding batch

- [ ] Reconcile the S5 code with the canonical Source of Truth and a JIT contract.
- [ ] Read the pinned screen-level O01 and J1–J4 records for S5/S6.
- [ ] Record existing S5 capabilities and what remains incomplete; do not infer
  that Product/Resource creation or first publication exists.
- [ ] Verify relevant S5 success/failure, stale-write, Owner isolation, and
  Working/Published runtime boundaries.
- [ ] Implement the next bounded slice only once its technical authority exists.

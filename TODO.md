# Spall Spill — TODO

**Status:** Execution backlog  
**Rule:** work top-to-bottom unless a dependency or blocking defect requires a deliberate exception.  
**Last synchronized:** 2026-10-05

## Current local integration — 2026-10-04

This branch combines the implementation preserved at `24a8905`, current main
documentation at `885daae`, and remote dependency/navigation fixes at `4f6cfce`.
The phase checklist below is the original planning inventory; unchecked entries
are not proof that existing implementation is absent. Audit the code and evidence
before starting a new slice. The previous branch's evidence is retained below.

- [x] Preserve uncommitted local application, shared policy, and migration work
  on `codex/local-preservation-20261004` and push before integration.
- [x] Merge remote documentation and implementation fixes without force-pushing.
- [x] Preserve both TODO inventories and both sides of dependency changes.
- [x] Verify the preserved local baseline: 410 Vitest tests, typecheck, lint,
  and all three application builds passed using installed Next.js 16.3.3 and
  Vitest 4.1.10. This evidence does not verify the patched integration candidate.
- [x] Verify the merged auth-navigation suite separately: 17 native Node tests.
- [x] Read and materialize the pinned J1–J9 maps and full O01 specification
  locally, without changing their locked content or importing legacy runtime.
- [x] Verify a frozen install and full regression of application commit `136cd1c`:
  pnpm 11.24.0 supply-chain checks and frozen install passed; 410 Vitest tests
  plus 17 native Node tests passed; typecheck, lint, and all three Next.js 16.3.6
  production builds passed. No local secrets were copied into the chat worktree.
- [x] Resolve the scanner/sanitizer development-port conflict (3002/3001), add
  per-service environment examples and test configuration, and patch Next.js,
  eslint-config-next, and Vitest consistently across the workspace.
- [x] Repair CI initialization at `87cdeea`: set up pinned Node before pnpm;
  disable pnpm/setup's implicit install and retain the explicit frozen-install
  gate. YAML parsing and step-order checks passed locally for both jobs.
- [x] Verify CI Application and Database for `87cdeea`: both jobs passed,
  including frozen installation, application checks/build, isolated database
  reset, lint with no schema errors, and 779 pgTAP tests across 14 files.
  Local Docker remained unavailable; no existing local database was reset.
- [x] Verify production HTTP failure boundaries locally: 7 checks passed for
  scanner unsigned/invalid-signature denial, signed invalid JSON/payload denial,
  oversized-request denial, and sanitizer missing-configuration/size denial.
  The smoke checks used loopback servers and made no provider/storage requests.
- [x] Complete Security for `5504842`: Dependency Scan, SAST, and Secret Scan passed.
- [x] Resolve the outstanding braces advisory without suppressing it; see
  `docs/product-spec/NEXT-ESLINT-DEPENDENCY-REMEDIATION.md`.
- [x] Reconcile S5 progress/recommendation/presentation with pinned O01/J1–J4
  and lock scoped contract 12.12. Product/Resource lifecycle and S6 remain open.
- [x] Make non-Affiliate Product entry an accessible optional disclosure while
  retaining mounted inputs and automatically exposing an existing saved Draft.
- [x] Lock Resource Draft contract 12.14 and implement semantic-first private
  persistence, Resource-first Business entry, optional access for other personas,
  retained saved Drafts, strict acknowledgment, and post-commit fail-closed scanning.
- [x] Verify Resource implementation locally: 891 pgTAP tests across 16 files,
  458 Vitest tests, 17 auth navigation tests, five tooling tests; typecheck, lint,
  and all three builds pass. Database schema lint and error-level security
  advisors pass. Concurrent Resource first saves and Product creation serialize
  without duplicate Items, stale overwrites, or duplicate Owner references.
- [x] Apply Resource migration additively after private backup without resetting
  the existing development database or changing Product content/reservations.
- [x] Verify isolated S1–S5 Resource UI: empty-shell rejection, input retention,
  title-only save, source update, reload, and Business-to-Personal Draft retention.
  The source remains pending when the scanner is unavailable.
- [x] Verify CI/Security on Resource `adcdb4c` and login repair `7e482c9`.
- [x] Fix login Server Action redirect chain using the shared authoritative final
  destination resolver. Browser login now reaches `/onboarding`; its next Resource
  POST succeeds with no console errors. Eight destination regressions, web lint,
  typecheck, 202 web unit tests and production build pass (488 application/tooling
  tests across the workspace). S6 remains open.
- Resource commit `adcdb4c` passed
  [Security 37221708726](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37221708726).
  [CI 37221708678](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37221708678)
  passed after the user-requested 2% usage stop.
  Login repair `7e482c9` also passed
  [CI 37221914474](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37221914474)
  and [Security 37221914486](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37221914486).
  No merge/release is claimed. Latest user instruction resumes local development
  and delays further pushes until remaining usage enters the 10–2% range.
- [x] Lock bounded S6 private preview contract 12.15: one current-Owner database
  snapshot, explicit content/safety issues, and timezone-stable digest. No publication.
- [x] Verify preview: 52 targeted pgTAP assertions plus the preceding clean
  942-test DB suite pass (943 assertions with the added timezone regression).
  487 Vitest, 17 navigation and five tooling tests pass, as do typecheck, lint,
  web production build and error-level DB advisors. Browser S5-to-S6 and responsive
  preview pass with no console errors. Primary DB migrations applied additively
  after backup. Remote CI awaits the user-requested usage-gated push.
- [x] Lock and implement private preview receipt contract 12.16: explicit Owner
  confirmation, fresh digest comparison, one row per Owner, fixed ten-minute TTL,
  idempotent unchanged confirmation and rotation after changes/expiry. 41 pgTAP
  and 20 action tests pass; web typecheck/lint pass. Browser confirmation, stale
  tab rejection and reloaded confirmation pass with no console errors. Private
  receipt migration applied additively to the primary DB after backup.
- [ ] Implement atomic first Publish, explicit
  Identity-only/Item intent, public read/media transport and first workspace.
- [x] Lock staged transaction contract 12.18 and implement atomic Identity-only/
  Resource persistence, immutable first acknowledgment, Owner-bound review/expiry,
  fresh wall-clock safety, preserved Working/Drafts and idempotent retry. 64 pgTAP
  assertions and three real concurrent-session races pass. Publication RPC grants
  remain withheld until public/workspace/UI transport is verified.
- [x] Correct Product preview readiness against pinned FR-PRD-004/009: title and
  safe URL cannot replace mandatory primary image and marketplace preparation.
  DB preview and two application regressions enforce the explicit pending issue.
- [ ] Implement Product primary-image/marketplace publication preparation and
  public Profile Media transport; never silently discard selected private media.
- [x] Lock staged public-snapshot reader contract 12.19. Handle/alias resolution,
  current account/lifecycle gates, private-field exclusion and fresh exact-source
  safety pass 48 pgTAP assertions. Anonymous/read endpoint grants remain withheld.
  The recorded empty migration is preserved; actual readers use a later additive
  migration. Primary application was backed up and never reset.
- [x] Verify the complete local batch: 1,097 pgTAP assertions across 20 files,
  five real DB concurrency tests, 529 Vitest tests, 17 navigation tests and five
  tooling tests pass. Workspace typecheck/lint, three production builds, schema
  lint and error-level security advisors pass. Latest pnpm audit reports zero
  findings at every severity. Remote CI/Security await the usage-gated push.
- [ ] Enable first Publish only after explicit bundle review, safe public routes/
  click transport, public media and the universal D01 workspace handoff are ready.
- [x] Extend the authoritative final-destination repair to all onboarding and
  profile-media Server Actions. Await the account resolver and navigate directly
  to its final page; unverifiable account state fails closed. Ten new regressions
  cover direct navigation and rejected Identity/Resource saves; web typecheck,
  lint and unit suite pass. No GET-only auth-handler redirect remains in these actions.
- [x] Lock scoped account notice/session-exit contract 12.17. Restricted/suspended
  Owners now reach the existing resolver's real `/dashboard/account-status`
  destination. Explicit local-context Sign Out clears intent after provider
  acknowledgment and goes directly to Login. Ten unit regressions, web typecheck
  and lint pass; browser restricted-account routing and Sign Out pass with no
  console errors. Detailed enforcement/review workflows remain open.
- [x] Reconcile preserved Product Draft/reference allocation with pinned 11.22:
  contract 12.13 and an additive migration reserve immutable Owner-scoped Item
  identity/reference at durable creation and backfill existing Drafts.
- [x] Verify reference reservation locally in an isolated Supabase lab: backfill
  preserves legacy UUID/revision/content/timestamps; 845 pgTAP tests pass;
  concurrent first saves create one Item and reject the other as stale; parallel
  Product/Resource allocations use distinct numbers in the shared Owner sequence.
  Database lint and security advisors report no errors/issues.
- [x] Apply the additive reference migration to the existing local development
  database after a private core/API/history backup. Its one existing Draft now
  has one identity reservation with zero missing mappings; database lint passes.
  No reset of the existing development database was performed.
- [x] Verify reference-foundation implementation `9f086c5` remotely:
  [CI 37220286784](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37220286784)
  passes Application, database reset/lint, 845 pgTAP tests, and concurrent
  allocation verification;
  [Security 37220286807](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37220286807)
  passes Dependency Scan, SAST, and Secret Scan.
- [ ] Verify the complete S5 journey in the browser before checkpoint closure.

Scratch `*-read.txt` review notes and ignored local secrets remain local. They are
not application source and were not included in the preservation commit.

Remote evidence for `136cd1c`:

- [Security run 37218167613](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37218167613)
  Secret Scan passed. Dependency Scan failed with exactly one High finding:
  `braces@3.0.3`, `GHSA-vfj7-8cjw-p6xm`, CVSS 8.7, no fixed version reported.
  SAST also passed for this commit.
- [Security run 37218254234](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37218254234)
  for `87cdeea`: Secret Scan and SAST passed; Dependency Scan failed.
- [CI run 37218254208](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37218254208)
  for `87cdeea`: Application and Database passed. Database log reports
  `No schema errors found`, `Files=14, Tests=779`, and `Result: PASS`.
- Earlier integration CI failed with `ERR_PNPM_LOCKFILE_MISSING_DEPENDENCY` on
  Next.js 16.3.3. The pnpm-generated lockfile and aligned importers in `136cd1c`
  resolve that specific failure; local frozen installation proves the repair.
- `main` remains unmerged while required security/live-runtime gates are
  incomplete. The preservation commit and all remote branch history remain
  available; no reset or force push was used.

**Immediate work:** extend S5 from scoped contract 12.12 by locking the remaining
Product/Resource domain contracts, then implement the missing Resource Draft.
Do not recreate the scaffold or claim S5/S6 closure from the older Phase 1
inventory. Workspace integration has local and CI application/database evidence;
live provider and full journey/manual verification remain incomplete.

## How to use this file

- This is the implementation checklist, not the product authority.
- Before starting a task, read PRD.md, ARCHITECTURE.md, SKILL.md, WORKFLOW.md, and the relevant canonical product records.
- Mark an item complete only after its acceptance checks pass.
- Do not mark a phase complete because the UI looks finished.
- New work that changes locked product semantics requires an explicit product decision before implementation.

## Phase 0 — Documentation / execution baseline

- [x] Establish clean production repository.
- [x] Migrate canonical Product Source of Truth and migration provenance.
- [x] Migrate locked production technology/security authority.
- [x] Add PRD.md execution summary.
- [x] Add ARCHITECTURE.md execution summary.
- [x] Add TODO.md execution backlog.
- [x] Add SKILL.md implementation-agent rules.
- [x] Add WORKFLOW.md delivery workflow.
- [x] Re-read all five execution files after commit and verify cross-document consistency.

### Exit criteria
- No execution document contradicts PRODUCT-SOURCE-OF-TRUTH.md or 12.4.
- Repository is ready to start runtime scaffold from zero.

## Phase 1 — Monorepo and application scaffold

- [ ] Initialize pnpm workspace.
- [ ] Initialize Turborepo.
- [ ] Create apps/web Next.js Active-LTS app using React 19.
- [ ] Confirm Node.js 24 LTS baseline.
- [ ] Enable TypeScript strict.
- [ ] Enable noUncheckedIndexedAccess.
- [ ] Enable exactOptionalPropertyTypes.
- [ ] Configure Tailwind CSS 4.x.
- [ ] Add Radix UI primitives only where useful.
- [ ] Add base Zod and React Hook Form dependencies.
- [ ] Create packages/domain.
- [ ] Create packages/validation.
- [ ] Create packages/ui.
- [ ] Create packages/config or equivalent shared config boundary.
- [ ] Add ESLint/formatting/tooling configuration.
- [ ] Add .env.example without secrets.
- [ ] Create minimal application shell and health/readiness route.
- [ ] Verify production build from a clean install.

### Exit criteria
- pnpm install --frozen-lockfile works.
- Typecheck, lint, tests placeholder, and next build are runnable.
- No feature logic exists in random UI files.
- No legacy runtime source has been copied in.

## Phase 2 — Local database, migrations, and CI security foundation

- [ ] Initialize local Supabase development.
- [ ] Commit versioned SQL migration structure.
- [ ] Define logical schema families: core, publication, analytics, moderation, audit, ops, api.
- [ ] Establish database role/grant posture.
- [ ] Add pgTAP / Supabase database-policy test harness.
- [ ] Add reproducible local reset/seed workflow.
- [ ] Configure GitHub Actions.
- [ ] Add frozen-install gate.
- [ ] Add typecheck gate.
- [ ] Add lint/format gate.
- [ ] Add unit-test gate.
- [ ] Add migration/reset validation gate.
- [ ] Add database allow + deny policy-test gate.
- [ ] Add Semgrep.
- [ ] Add Gitleaks.
- [ ] Add dependency vulnerability scan.
- [ ] Enable Dependabot configuration.
- [ ] Document preview/staging/production environment contract.

### Exit criteria
- Fresh checkout can reproduce the local DB from committed state.
- CI fails on type, lint, migration, policy-test, secret-scan, or build failure.

## Phase 3 — Core domain primitives

- [ ] Define stable Owner identity contract.
- [ ] Define provider identity linkage contract.
- [ ] Define Handle value object and normalizer.
- [ ] Define persistent Spill Reference parser/normalizer.
- [ ] Define Product and Resource domain types.
- [ ] Define Working / Published lifecycle types.
- [ ] Define revision token / baseRevision contract.
- [ ] Define STALE_WRITE behavior.
- [ ] Define idempotency / operation identity contract.
- [ ] Define typed application errors.
- [ ] Define public-safe projection builders.
- [ ] Define authorization/capability interfaces.
- [ ] Define Audit semantic interface.
- [ ] Unit-test identifiers, lifecycle, projections, permissions, and error mapping.

### Exit criteria
- Core domain rules are testable without React.
- UI cannot redefine identifiers/lifecycle locally.

## Phase 4 — Authentication and authorization

- [ ] Configure Supabase Auth locally/dev.
- [ ] Implement Email/Password.
- [ ] Implement Google OAuth.
- [ ] Map auth principal to stable Spall Spill Owner.
- [ ] Implement trusted server session handling.
- [ ] Implement server authorization helpers.
- [ ] Implement owner isolation.
- [ ] Implement operator capability model foundation.
- [ ] Add RLS/grant allow + deny cases.
- [ ] Add anti-enumeration outward error mapping.
- [ ] Add action-specific auth rate limits.
- [ ] Add Turnstile where justified.
- [ ] Implement recovery flow.
- [ ] Test forged cross-owner read/write attempts.

### Exit criteria
- Authentication never substitutes for authorization.
- Protected server actions deny unauthorized access by default.

## Phase 5 — Onboarding and Identity

- [ ] Implement landing / entry foundation.
- [ ] Implement signup/login/recovery routes.
- [ ] Implement Handle claim.
- [ ] Implement onboarding primary-use-case selection.
- [ ] Implement Personal onboarding path.
- [ ] Implement Affiliator onboarding path foundation.
- [ ] Implement Business/UMKM onboarding path foundation.
- [ ] Implement Creator onboarding path.
- [ ] Implement Identity Working persistence.
- [ ] Implement explicit autosave status state machine.
- [ ] Implement live preview without counting audience analytics.
- [ ] Implement explicit Identity publish.
- [ ] Implement public Identity Published projection.
- [ ] Implement Handle rename/alias continuity according to locked policy.
- [ ] Add J1 critical E2E.
- [ ] Add Identity portion of J2/J3/J4 E2E.

### Exit criteria
- Platform Activation is measurable.
- Saving Working never changes public Identity without explicit publish.

## Phase 6 — Spill lifecycle, Product, Resource, and publication

- [ ] Implement first durable Spill Item creation threshold.
- [ ] Implement persistent reference allocation.
- [ ] Guarantee reference non-reuse.
- [ ] Implement Product Working model.
- [ ] Implement Resource Working model.
- [ ] Implement marketplace destination model.
- [ ] Implement Resource destination model.
- [ ] Implement Product manual-entry fallback.
- [ ] Implement safe metadata adapter boundary.
- [ ] Add SSRF protections.
- [ ] Implement explicit item publish.
- [ ] Implement Published Product projection.
- [ ] Implement Published Resource projection.
- [ ] Implement hide / restore.
- [ ] Implement archive / retired state.
- [ ] Preserve entity/reference through destination replacement.
- [ ] Implement onboarding multi-record publication orchestration.
- [ ] Add idempotency for harmful duplicate mutations.
- [ ] Add J2 and J3 critical E2E.
- [ ] Add Product/Resource returning-owner E2E.

### Exit criteria
- Spill Activation and Commerce Activation are distinct.
- Product/Resource public state is always a validated projection of an exact Working revision.

## Phase 7 — Public Spill, exact retrieval, browse, and discovery

- [ ] Implement /{handle}/spill.
- [ ] Implement /{handle}/spill/{reference}.
- [ ] Exact parser accepts minimum 27 and #27 forms.
- [ ] Exact reference wins over fuzzy discovery.
- [ ] Unique exact Published match auto-opens item detail.
- [ ] Hidden/Draft remain outwardly unavailable.
- [ ] Archived stable link uses retired/tombstone treatment where required.
- [ ] Implement Product detail confirmation.
- [ ] Implement one-destination provider CTA.
- [ ] Implement multi-destination chooser.
- [ ] Implement Resource lightweight detail.
- [ ] Implement adaptive Resource Open/View CTA.
- [ ] Implement creator-scoped keyword search.
- [ ] Implement category browse.
- [ ] Implement Featured/Pinned.
- [ ] Implement Newest Published.
- [ ] Implement useful zero-result recovery.
- [ ] Preserve reasonable back-navigation search/filter context.
- [ ] Add J6, J7, J8 Playwright E2E.

### Exit criteria
- Public discovery works without follower account/login.
- Exactness is deterministic and never silently substituted.

## Phase 8 — Media

- [ ] Configure Cloudflare R2 buckets by trust class.
- [ ] Implement server-authorized upload intent.
- [ ] Implement constrained short-lived presigned uploads.
- [ ] Validate actual MIME/magic bytes.
- [ ] Validate file size and dimensions.
- [ ] Validate decodability where applicable.
- [ ] Define metadata stripping/safety policy.
- [ ] Prevent arbitrary unsafe SVG by default.
- [ ] Implement authorized replacement/deletion.
- [ ] Ensure public projections include public-safe delivery metadata only.
- [ ] Add media security/integration tests.

## Phase 9 — Returning-owner workspace and capability expansion

- [ ] Implement adaptive dashboard shell.
- [ ] Implement fast Add Product.
- [ ] Implement fast Add Resource.
- [ ] Implement existing item search/filter.
- [ ] Implement edit and publish flow.
- [ ] Implement Identity edit and publish flow.
- [ ] Implement contextual capability discovery.
- [ ] Implement micro-onboarding for first-time capability use.
- [ ] Ensure changing Primary Use Case never changes permissions or migrates data.
- [ ] Ensure new capability activation never silently mutates public Identity.
- [ ] Add J5 E2E.
- [ ] Add J9 E2E.

## Phase 10 — Analytics

- [ ] Define canonical product analytics event schema.
- [ ] Implement Platform Activation event.
- [ ] Implement Spill Activation event.
- [ ] Implement Commerce Activation event.
- [ ] Implement Exact Reference Success and time-to-exact-item.
- [ ] Implement Search/Browse success semantics.
- [ ] Implement zero-result/refinement events.
- [ ] Implement Product outbound click.
- [ ] Implement Resource Open.
- [ ] Exclude Owner preview from public audience metrics.
- [ ] Keep creator/business analytics canonical inside Spall Spill.
- [ ] Configure PostHog only for approved internal telemetry.
- [ ] Add privacy/data-minimization review.

## Phase 11 — Moderation, operator access, and Audit

- [ ] Implement report taxonomy and report intake.
- [ ] Implement case creation/workflow.
- [ ] Implement evidence storage in private trust class.
- [ ] Implement enforcement model.
- [ ] Implement owner-facing enforcement notice treatment.
- [ ] Implement appeal eligibility/submission/re-review.
- [ ] Implement operator permission matrix.
- [ ] Require MFA for protected operator access.
- [ ] Implement fresh strong-auth checks for high-risk actions.
- [ ] Implement append-only Audit storage.
- [ ] Write protected mutation + Audit atomically where possible.
- [ ] Implement durable outbox/intent fallback where one transaction cannot cover external effects.
- [ ] Audit sensitive evidence disclosure.
- [ ] Add operator authorization allow + deny tests.
- [ ] Add critical moderation/operator E2E.

## Phase 12 — Async jobs, notifications, and operational controls

- [ ] Configure Supabase Queues / pgmq.
- [ ] Configure Supabase Cron / pg_cron.
- [ ] Implement transactional outbox processor.
- [ ] Ensure workers are idempotent.
- [ ] Configure Resend.
- [ ] Configure SPF/DKIM/DMARC before production email.
- [ ] Keep provider email payload outside domain truth.
- [ ] Implement health/readiness checks.
- [ ] Implement protected kill switches where locked product requirements require them.
- [ ] Add queue depth/age and worker failure monitoring.

## Phase 13 — Observability, security hardening, and performance

- [ ] Instrument OpenTelemetry.
- [ ] Configure Sentry.
- [ ] Add correlation/trace IDs.
- [ ] Ensure structured logs are PII-minimized.
- [ ] Configure security headers.
- [ ] Configure CSP.
- [ ] Configure HSTS.
- [ ] Configure Referrer-Policy.
- [ ] Configure Permissions-Policy.
- [ ] Validate CSRF/origin/session protections.
- [ ] Validate open-redirect protection.
- [ ] Validate XSS boundaries.
- [ ] Validate SSRF controls.
- [ ] Load-test critical public read paths.
- [ ] Track LCP/INP/CLS.
- [ ] Track public and owner API p95.
- [ ] Review slow DB queries and indexes.
- [ ] Verify Published projections are cacheable where appropriate.

## Phase 14 — Backup, recovery, release, and production readiness

- [ ] Define production backup policy.
- [ ] Enable appropriate provider-managed backup tier before serious production.
- [ ] Implement independent PostgreSQL logical backup.
- [ ] Store independent backup privately.
- [ ] Define retention.
- [ ] Perform clean restore drill.
- [ ] Run integrity/smoke checks after restore.
- [ ] Define RPO/RTO.
- [ ] Document rollback.
- [ ] Test rollback.
- [ ] Document secret rotation.
- [ ] Test secret rotation procedure.
- [ ] Document incident response responsibilities.
- [ ] Complete dependency/security audit.
- [ ] Complete accessibility audit.
- [ ] Complete Playwright J1–J9 release suite.
- [ ] Verify staging.
- [ ] Verify production configuration.
- [ ] Perform production smoke test.
- [ ] Tag release.

### Final production-ready gate
Spall Spill is production ready only when product behavior, authorization, database policy tests, security checks, E2E, observability, restore, rollback, and production smoke verification all pass.

## Immediate next task

**Original documentation-only next task (superseded by current local integration):
Start Phase 1: clean monorepo/application scaffold.**

Do not begin by rebuilding visible feature pages from the legacy app. The first runtime milestone is a clean, testable foundation with correct TypeScript, workspace, build, CI, and database direction.

---

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
- [x] Remediate the remaining braces dependency without suppressing its advisory.
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

## Follow-up remediation and S5 presentation — 2026-10-05

- Security fix `5504842` removes the vulnerable lint dependency tree through a
  version-scoped plugin patch and removal of its unused fast-glob dependency.
  No advisories or required gates are suppressed.
- Frozen install and pnpm audit passed with zero findings; five tooling tests,
  410 Vitest tests, 17 auth navigation tests, typecheck, lint, and three builds passed.
- [Security 37218867679](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37218867679)
  passed all three jobs for `5504842`.
- [CI 37218867718](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37218867718)
  passed Application and Database for `5504842`, including 779 pgTAP tests and
  database lint with no schema errors.
- Contract 12.12 and five rendered-form regressions cover focused optional
  Product entry, Affiliate emphasis, genuine Skip, and saved-Draft visibility
  after guidance changes. Product inputs remain mounted when the disclosure closes.
- The updated workspace has 415 Vitest tests, 17 auth navigation tests, and
  five tooling tests (437 total). Typecheck, lint, and all three builds pass locally.
- Resource Draft, full Product lifecycle, S6/publication, full browser journey,
  and live Web Risk/Gemini verification remain open. No S5/S6 closure is claimed.

## Historical dependency patch batch — 2026-10-04

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

# Spall Spill — TODO

**Status:** Execution backlog  
**Rule:** work top-to-bottom unless a dependency or blocking defect requires a deliberate exception.  
**Last synchronized:** 2026-10-04

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

**Start Phase 1: clean monorepo/application scaffold.**

Do not begin by rebuilding visible feature pages from the legacy app. The first runtime milestone is a clean, testable foundation with correct TypeScript, workspace, build, CI, and database direction.

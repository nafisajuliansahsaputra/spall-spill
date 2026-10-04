# SPALL SPILL — PRODUCT SOURCE OF TRUTH

> **Canonical production repository:** `nafisajuliansahsaputra/spall-spill`

This file is the canonical execution index for the clean rebuild. Historical decision provenance is pinned in [`MIGRATION-MANIFEST.md`](./MIGRATION-MANIFEST.md).

## Mandatory Implementation Execution Protocol

All production implementation work in this repository must follow [`IMPLEMENTATION-EXECUTION-PROTOCOL.md`](./IMPLEMENTATION-EXECUTION-PROTOCOL.md).

The Implementation Execution Protocol is **LOCKED / MANDATORY CROSS-CHAT EXECUTION AUTHORITY** for implementation workflow, including:

- local-first execution and deny-by-default remote writes;
- fresh authority/branch/source audits before implementation;
- just-in-time technical-contract locking before new production checkpoints;
- bounded one-logical-batch execution;
- one-file-per-PowerShell-block creation/full replacement;
- security-by-construction and targeted runtime/manual security verification;
- staged-diff review before commit;
- local evidence before push;
- remote CI/Security verification after push;
- documentation closure and committed readback before `CLOSED / VERIFIED`.

Generic continuation language such as `gas`, `lanjut`, `ok`, or `terusin` never authorizes direct remote mutation.

Product behavior remains governed by this Source of Truth, locked User Flows, and the relevant locked technical contract. The execution protocol governs **how those authorities are implemented and verified**.

## Locked product layers

- Product Foundation — **LOCKED**.
- Core MVP User Journeys J1–J9 — **COMPLETE / LOCKED**.
- Functional Requirements 7.0–7.12 — **COMPLETE / LOCKED**.
- Information Architecture 8.0–8.6 — **COMPLETE / LOCKED**.
- Screen-Level UX 9.0–9.25 — **COMPLETE / LOCKED**.
- Shared UX + Open Decision Consolidation 10.0–10.6 — **COMPLETE / LOCKED**.
- Current MVP logical screen inventory — **25 logical screens**.

Locked route families remain:

```text
/
/signup
/login
/recovery
/onboarding
/{handle}
/{handle}/spill
/{handle}/spill/{reference}
/dashboard/*
/ops/*
```

## Stage 11 — Foundation Decision Resolution

**EXECUTION GATE SATISFIED.**

Locks 11.1–11.28 remain authoritative, including:

- authentication/session/security boundaries;
- server-side ownership authorization;
- operator permissions/strong authentication;
- reporting/moderation/enforcement/appeal semantics;
- Audit semantic taxonomy, failed-sensitive-attempt boundary, retention/storage integrity/immutability;
- authoritative Saved/Working persistence semantics;
- Draft/Working first-persistence threshold;
- revision identity and stale-write rejection;
- idempotent multi-record onboarding publication orchestration;
- canonical URL/query-state rules;
- typed identifier parsing/normalization;
- Handle rename/alias/reservation/old-URL continuity;
- transition rule that remaining Open Decisions are resolved just-in-time and do not block the whole rebuild.

## Core product invariants

- Identity ≠ Commerce.
- Draft ≠ Working.
- Saved ≠ Live.
- Working save never silently changes Published state.
- Published discovery exposes public-safe Published projections only.
- Persistent Spill Reference is stable and never reused.
- Handle is mutable human-facing locator, not canonical Owner identity.
- Authentication ≠ Authorization.
- Reports/signals ≠ verdicts.
- Appeal submission ≠ reversal.
- Audit records authoritative accountable reality and is not product analytics.
- Owner preview is excluded from audience analytics.
- Marketplace click ≠ purchase.
- Existing Owner workflows must remain dramatically shorter than onboarding.

## Stage 12 — Technical Architecture

- 12.1 Clean rebuild / new repository / professional baseline — **LOCKED**.
- 12.2 Original zero-cash constraint — **HISTORICAL; hard ceiling superseded**.
- 12.3 Free-first progressive scale / same-stack upgrade strategy — **LOCKED / CURRENT COST-SCALING AUTHORITY**.
- 12.4 Production Technology Stack & Security Architecture — **LOCKED / CURRENT TECHNOLOGY-STACK AUTHORITY**.
- 12.5 Authentication Session & Intended-Destination Contract — **LOCKED / CURRENT AUTH IMPLEMENTATION AUTHORITY**.
- 12.6 Owner Auth Identity & Account State Contract — **LOCKED / CURRENT OWNER-IDENTITY IMPLEMENTATION AUTHORITY**.
- 12.7 Owner-State Resolver Contract — **LOCKED / CURRENT OWNER-STATE RESOLUTION AUTHORITY**.
- 12.8 Email/Password Sign Up & Confirmation Contract — **LOCKED / CURRENT EMAIL-PASSWORD SIGNUP AUTHORITY**.
- 12.9 Onboarding Progress & Handle Claim Contract — **LOCKED / CURRENT O01 ONBOARDING-FOUNDATION IMPLEMENTATION AUTHORITY**.
- 12.10 Onboarding Basic Identity Working & Starter Composition Contract — **LOCKED / CURRENT O01 S3-S4 IMPLEMENTATION AUTHORITY**.
- 12.11 Profile Media / Logo R2 Storage Contract — **LOCKED / CURRENT PROFILE-MEDIA STORAGE IMPLEMENTATION AUTHORITY**.

### Cost / scaling rule

> Choose production-grade technologies with credible long-term scaling paths. Start on free/included tiers when legally and technically suitable, then upgrade the same provider/technology when revenue, traffic, reliability, backup, security, support, or performance justify it. Do not choose disposable free technology that creates an avoidable future rewrite.

### Production technology baseline

```text
Application
- Next.js Active LTS (scaffold floor 16.3.3+ patched release)
- React 19
- Node.js 24 LTS
- TypeScript strict
- Tailwind CSS 4.x
- Radix UI
- Zod + React Hook Form
- pnpm + Turborepo

Hosting / Data / Auth
- Vercel as primary Next.js host; valid commercial tier for commercial production
- PostgreSQL on Supabase as canonical transactional database
- Supabase Auth
- server-derived deny-by-default authorization
- PostgreSQL grants/RLS as tested defense in depth
- versioned SQL migrations + reproducible local database
- Supabase Queues / pgmq
- Supabase Cron / pg_cron

Edge / Media / Abuse Prevention
- Cloudflare DNS
- Cloudflare R2 object/media storage
- Cloudflare Turnstile
- Upstash Redis distributed action-specific rate limiting

Messaging / Observability / Analytics
- Resend transactional email
- OpenTelemetry instrumentation
- Sentry error/performance monitoring
- PostHog for internal telemetry only
- Spall Spill-owned creator/business analytics remains canonical

Quality / Security
- GitHub Actions
- Vitest
- React Testing Library
- Playwright
- pgTAP / database-policy tests
- Semgrep
- Gitleaks
- OSV/dependency scanning
- Dependabot
```

### Mandatory security architecture

- server-side authorization boundaries;
- tested RLS/grant allow + deny cases;
- private/internal DB schemas separated from public-safe projections;
- Working vs Published isolation;
- optimistic concurrency and `STALE_WRITE` rejection;
- MFA for operator-sensitive access and fresh strong-auth for high-risk actions;
- presigned media uploads with server authorization and actual-file validation;
- private evidence and backup storage separation;
- strict SSRF protection for marketplace/provider metadata fetches;
- open-redirect protection and safe protocol validation;
- XSS/CSP/security-header policy;
- CSRF/origin/session protection appropriate to the final session model;
- distributed action-specific rate limiting;
- append-only accountable Audit;
- transactional outbox for reliable asynchronous side effects;
- strict secret isolation;
- frozen dependency lockfiles and critical patch discipline;
- structured PII-minimized logging + OpenTelemetry/Sentry correlation;
- independent backup + tested restore;
- health/readiness, rollback, incident response, and secret-rotation procedures before public launch.

### Security delivery & verification operating model

Security is built continuously, but broad penetration testing is checkpointed so it does not waste effort against unstable implementation surfaces.

Canonical execution model:

1. **Security by construction during development.** Every security-sensitive feature is implemented with deny-by-default authorization, server-side ownership checks, validation, least privilege, secret isolation, race/concurrency safety, idempotency where required, privacy-aware logging, and automated regression/security tests as part of the feature itself.
2. **Targeted manual/runtime verification at the end of each security-sensitive slice.** Before a sensitive slice is considered closed, manually verify the boundaries that materially belong to that slice, such as session denial, cross-Owner authorization/IDOR resistance, upload/CORS behavior, stale-write rejection, failure truth, retry/idempotency, and private-data isolation. Do not turn every feature checkpoint into a full-site penetration test.
3. **Journey-level integration security verification.** When a major user journey becomes implementation-complete, verify the security behavior of that journey end-to-end across its relevant boundaries rather than only as isolated units.
4. **Full security assessment after MVP feature completeness.** Once the MVP attack surface is sufficiently stable, perform a structured security assessment / penetration test covering authentication/session, authorization/BOLA/IDOR, CSRF, injection, XSS, SSRF, file-upload abuse, rate limiting, business-logic abuse, privilege escalation, information leakage, dependency exposure, security headers, and other applicable classes. Findings require severity, evidence, remediation, and retest.
5. **Pre-production staging security gate.** Before public launch, repeat security/regression verification in a production-like staging environment, including controlled load/rate-limit testing, observability, recovery/rollback, backup/restore, secret handling, and release readiness. Production is not used as an environment for destructive experimentation.

This model intentionally rejects both extremes:

- security is not deferred until the product is "finished";
- broad penetration testing is not repeated continuously while core UI, journeys, and attack surfaces are still changing.

A security-sensitive implementation checkpoint is not closed merely because automated tests pass when material runtime/manual boundaries remain unverified.

### External destination safety provider verification status

As of **2026-09-02**, the external-destination safety architecture is being hardened as part of O01-S5 work.

The following verification state is authoritative until superseded by later committed evidence:

- Google Web Risk integration is implemented locally, but **live provider verification is DEFERRED / NOT CLOSED**.
- The live Web Risk probe currently cannot complete because the Google Cloud project reports `BILLING_DISABLED`. This is an external provider/account-readiness blocker, not evidence that the local scanner implementation has passed live verification.
- The intended revisit window is approximately **2026-09-16**. Reaching that date does not automatically change status; live evidence must still be rerun and recorded.
- Google Web Risk must not be represented as `VERIFIED`, `CLOSED`, or production-ready until a successful live provider probe and relevant end-to-end scanner verification have been completed.
- Gemini semantic-classification live verification across the complete provider chain also remains unverified while the upstream Web Risk gate prevents the full scanner path from completing.
- Provider unavailability, scanner failure, malformed provider output, stale binding, or other incomplete safety evidence must remain **fail-closed**.
- Private Owner Working/Draft persistence may remain available when safety infrastructure is unavailable, but the corresponding external destination must remain effectively `pending` or otherwise non-safe.
- No user-supplied external destination may become publicly trusted, Published as a safe destination, or exposed as a public clickable destination solely because its private Working/Draft record was saved.
- A destination may become trusted for public use only after the required safety pipeline completes and produces a valid, current, bound safety verdict according to the active destination-safety contract.
- O01-S5 currently has no publication boundary, so temporary provider deferral does not authorize weaker safety semantics and does not alter the locked Working-versus-Published isolation.
- This provider deferral does **not** change J1–J9 User Flow topology.

This status entry exists specifically so future implementation sessions and fresh repository reads do not mistake local implementation evidence for completed live-provider verification.

### Development / security lab operating model

The current development workflow separates implementation and adversarial/client testing responsibilities:

- **Windows is the primary development host** for source editing, Git, Next.js, local Supabase/Docker, migrations, automated tests, and normal build execution.
- **Kali Linux is the dedicated preview/security client** for browser verification, Burp Suite, ZAP and other appropriate security tools, and controlled adversarial testing against environments owned and authorized for Spall Spill testing.
- Windows and Kali communicate through an isolated VMware host-only path for local development/testing rather than exposing the development stack broadly to the surrounding LAN.
- The browser-facing Next.js, Supabase HTTP API/Auth boundary, and local mail-testing surface may be forwarded narrowly into the Kali lab when required.
- Direct PostgreSQL exposure to the Kali browser/security client is not part of the normal web-testing path.
- R2 credentials, Supabase elevated credentials, and other server secrets remain on the server/development host and are never copied into browser tooling merely to make testing easier.
- Burp/ZAP scope is narrowed to the Spall Spill lab targets required by the test; unrelated traffic is not intentionally intercepted or retained.
- Manual security testing is performed only against Spall Spill systems/environments that are owned or explicitly authorized for the test.

The Kali lab is durable infrastructure, but deep/broad security testing is parked when it no longer materially validates the implementation slice currently being built. After the required targeted security boundary for a slice passes, development proceeds to the next implementation checkpoint.

### Authentication implementation authority

The current Auth implementation authority is:

[`technical-architecture/12.5-auth-session-intended-destination-contract.md`](./technical-architecture/12.5-auth-session-intended-destination-contract.md)

This JIT lock resolves **OD-SEC-003 — Intended-Destination Storage / Transport / Safety**.

Current locked Auth baseline:

- Supabase Auth;
- Email/Password;
- Google OAuth;
- `@supabase/ssr` cookie-based SSR;
- request-scoped server clients;
- Next.js Proxy session refresh;
- safe short-lived internal intended-destination cookie;
- owner-state resolver before navigation restoration;
- server/data-layer authorization after authentication.

Intended destination is navigation context only. It never grants authority, bypasses account state, or replaces server/data-layer authorization.

### Onboarding implementation authority

The current O01 implementation authorities are:

- [`technical-architecture/12.9-onboarding-progress-handle-claim-contract.md`](./technical-architecture/12.9-onboarding-progress-handle-claim-contract.md) — account-side progress, O01-S1 Handle claim, O01-S2 Primary Use Case, Owner-scoped mutation boundaries, and onboarding revision protection.
- [`technical-architecture/12.10-onboarding-basic-identity-starter-composition-contract.md`](./technical-architecture/12.10-onboarding-basic-identity-starter-composition-contract.md) — O01-S3 Basic Identity Working, O01-S4 Starter Composition, Working revision boundaries, and backward technical navigation without progress regression.
- [`technical-architecture/12.11-profile-media-r2-storage-contract.md`](./technical-architecture/12.11-profile-media-r2-storage-contract.md) — optional O01-S3 Profile Photo / Logo storage, private R2 media lifecycle, upload-intent security, canonical immutable media, and Working media attachment boundaries.

12.9 and 12.10 materialize O01-S1 through O01-S4. 12.11 specializes the optional Profile Media storage boundary inside O01-S3 without changing the six-step journey.

Implementation mechanics for O01-S5 Relevant First Job, O01-S6 Preview & Publish, and public-media publication remain deferred until those checkpoints are reached.

This does not change the locked six-step O01 journey, universal capability model, Working-versus-Published isolation, or onboarding-completion rule. Successful first authoritative Identity publication remains the completion boundary.

### Current implementation checkpoint

#### Local integration audit — 2026-10-04

Local implementation beyond the closed S4 checkpoint was preserved at `24a8905`
and integrated with main documentation and remote dependency/navigation fixes
on `codex/sync-local-foundation-20261004`. Existing code includes S5 progress,
Identity Connection Working, Product Draft, external-destination safety, and a
media-sanitizer service. This is an implementation inventory, not checkpoint
closure or a new product/technical lock.

The closed checkpoint and its historical evidence below remain unchanged.
S5/S6 are **NOT CLOSED / VERIFIED**. Reconcile the existing S5 code with a JIT
technical contract and pinned O01/J1–J4 records before implementing a new
onboarding/publication boundary. Current integration checks and remaining
dependency, database, runtime, and CI evidence are tracked in `../../TODO.md`.
The earlier Web Risk/provider deferral remains in force until replaced by live
verification evidence. No journey topology or public-safety rule changes.

#### Last closed checkpoint

Stage **6B.5 — S4 Application UI + 6B Regression Checkpoint** is **CLOSED / VERIFIED**.

The full Stage 6B sequence defined by 12.10 is now implementation-complete through O01-S4 Starter Composition. Stage 6B.4 delivered the private Starter Composition Working model plus authenticated S4 resolver/mutation boundaries; Stage 6B.5 integrated the real S4 application UI and closed the 6B regression/runtime gate.

Closure evidence includes:

- entering/resolving O01-S4 does not create `core.identity_layout_working` before explicit Owner confirmation;
- first explicit Starter save creates layout revision `1`, advances the onboarding frontier from `starter_composition` to `relevant_first_job`, and increments onboarding progress exactly once;
- later Starter edits increment only the independent layout revision and do not regress the onboarding frontier, increment unrelated progress, alter Primary Use Case, or mutate Identity content/revision;
- the four locked Starter keys (`clean`, `social_focus`, `featured`, `business`) remain capability-neutral and available regardless of recommendation guidance;
- two-tab stale-write runtime verification rejected an outdated layout revision with visible failure truth and no authoritative overwrite;
- Working-versus-Published isolation remained intact and S4 did not complete onboarding or create public state;
- clean local application regression passed with **66/66** tests, typecheck, lint, and production build;
- clean local database reset/lint passed with **544/544** pgTAP/database-policy tests;
- GitHub CI Application, CI Database, and Security workflows passed for implementation commit `0418bccfc584f47dec07212b8f74a97e4b703f2d` (which contains the Stage 6B.4 foundation commit `3993402c318e100d0be7dfe42bc362a996619708`).

No J1–J9 User Flow topology change is required.

The next implementation checkpoint is **O01-S5 — Relevant First Job**, but its persistence/mutation/application mechanics remain intentionally deferred. Before S5 code begins, its just-in-time technical contract must be defined and locked against the existing product journey, Primary Use Case guidance, capability-neutral model, Working-versus-Published isolation, revision/concurrency rules, authorization boundary, and first-publication semantics.

## User Flow status

**J1–J9 remain unchanged by the repository/technology migration.** No Mermaid topology update is required because infrastructure and security boundaries do not change the locked user-visible journey sequence.

## Implementation authority

Broad stack planning is complete. Production implementation is authorized to proceed in this repository.

Immediate sequence:

1. clean monorepo scaffold;
2. TypeScript/Next.js strict foundation;
3. local Supabase + versioned migration/policy-test foundation;
4. CI/security gates;
5. Auth;
6. Onboarding;
7. Identity;
8. Spill creation/management/publication;
9. Public discovery/detail;
10. Owner analytics/settings/moderation notice;
11. Operator/moderation/audit/platform controls;
12. hardening, recovery, E2E, release verification.

Remaining Open Decisions are resolved only when they materially constrain the implementation surface currently being built.

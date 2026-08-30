# SPALL SPILL — PRODUCT SOURCE OF TRUTH

> **Canonical production repository:** `nafisajuliansahsaputra/spall-spill`

This file is the canonical execution index for the clean rebuild. Historical decision provenance is pinned in [`MIGRATION-MANIFEST.md`](./MIGRATION-MANIFEST.md).

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

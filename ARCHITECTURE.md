# Spall Spill — Architecture

**Status:** Implementation architecture summary  
**Canonical technology authority:** docs/product-spec/technical-architecture/12.4-production-technology-stack-security-architecture.md  
**Last synchronized:** 2026-10-04

## 1. Architecture contract

Spall Spill is implemented as a **modular monolith first**.

This file is an execution summary. If any statement conflicts with the canonical 12.4 technology/security record or another locked product record, the canonical record wins.

Older architecture drafts that used Firebase/Firestore/Cloudinary are historical and are superseded where they conflict with the current production authority.

## 2. System goals

The architecture must be:

- production credible from day one;
- economical while traffic is small;
- upgradeable by increasing provider tier/capacity rather than rewriting the product;
- secure by default;
- observable;
- recoverable;
- testable locally and in CI;
- independent enough that vendor migration does not redefine product semantics.

## 3. Canonical stack

### Application
- Next.js Active LTS, scaffold floor 16.3.3+ patched release
- React 19
- Node.js 24 LTS
- TypeScript strict
- Tailwind CSS 4.x
- Radix UI
- Zod
- React Hook Form where useful
- pnpm workspaces
- Turborepo

Required TypeScript posture:
- strict = true
- noUncheckedIndexedAccess = true
- exactOptionalPropertyTypes = true

### Hosting / transactional data / auth
- Vercel for the Next.js application
- PostgreSQL on Supabase as canonical transactional truth
- Supabase Auth
- versioned SQL migrations
- reproducible local Supabase/PostgreSQL environment
- server-derived deny-by-default authorization
- PostgreSQL grants/RLS as tested defense in depth
- Supabase Queues / pgmq
- Supabase Cron / pg_cron

### Edge / media / abuse
- Cloudflare DNS
- Cloudflare R2
- Cloudflare Turnstile
- Upstash Redis for distributed action-specific rate limits

### Messaging / observability / analytics
- Resend
- OpenTelemetry
- Sentry
- PostHog for internal telemetry only
- Spall Spill-owned creator/business analytics as canonical product analytics

### Quality / security
- GitHub Actions
- Vitest
- React Testing Library
- Playwright
- pgTAP / Supabase DB tests
- Semgrep
- Gitleaks
- OSV/dependency vulnerability scanning
- Dependabot

## 4. High-level system shape

~~~text
Browser
  |
  v
Next.js App Router
  |-- public server-rendered / cached reads
  |-- authenticated owner surfaces
  |-- protected operator surfaces
  |-- route handlers / server actions as thin transport adapters
  |
  v
Application / Domain Services
  |-- validation
  |-- authorization
  |-- concurrency / revision checks
  |-- publication
  |-- idempotency
  |-- audit
  |-- outbound safety
  |
  v
Repository / Data Access
  |
  v
Supabase PostgreSQL
  |-- private canonical Working state
  |-- public-safe Published projections
  |-- analytics
  |-- moderation
  |-- audit
  |-- operations

External adapters
  |-- Supabase Auth
  |-- Cloudflare R2
  |-- Upstash Redis
  |-- Resend
  |-- provider metadata adapters
  |-- OpenTelemetry / Sentry / PostHog
~~~

UI components do not own business rules. Browser code does not receive privileged credentials or directly become the authority for protected mutations.

## 5. Repository shape

The clean implementation should converge toward this structure:

~~~text
apps/
  web/
    src/
      app/
      components/
      features/
      server/
      lib/

packages/
  ui/
  domain/
  validation/
  config/

supabase/
  migrations/
  seed.sql
  tests/

tooling/
  eslint/
  typescript/

docs/
  product-spec/

.github/
  workflows/
~~~

Exact folder naming may evolve, but boundaries must remain clear:
- React/UI code cannot become the domain authority.
- Protected data access remains server-side.
- Cross-feature shared contracts belong in deliberate shared packages, not random utility dumping grounds.
- Database changes are represented by committed migrations.

## 6. Domain boundaries

Primary feature/domain areas:

- auth
- onboarding
- identity
- spill
- product
- resource
- publication
- discovery/search
- analytics
- moderation
- operations
- audit
- notifications
- media

Shared foundational concerns:

- identifiers
- authorization
- validation
- revisions/concurrency
- lifecycle
- typed errors
- idempotency
- rate limiting
- observability
- security policies

## 7. Database organization

Logical PostgreSQL schema families:

~~~text
auth          provider-managed authentication identities
core          private canonical Owner / Identity / Spill domain data
publication   public-safe Published projections
analytics     product-owned events and aggregates
moderation    reports / cases / evidence / enforcement / appeals
audit         append-only accountability events
ops           protected platform/operator controls
api           explicitly exposed safe views/RPC when justified
~~~

Do not place the entire product in one broadly exposed schema.

Public discovery must never depend on querying private Working tables and filtering them in UI code.

## 8. Authentication vs authorization

### Authentication
Supabase Auth provides:
- Email/password
- Google OAuth

Authentication proves the principal/session only.

### Application identity
Spall Spill keeps a stable Owner identity separate from provider identity.

### Authorization
Every private operation derives authority server-side.

Requirements:
- deny by default;
- resource IDs and URLs never grant authority;
- every owner mutation checks ownership/capability;
- operator capability is explicit;
- forged cross-owner reads/writes fail;
- RLS/grant policies have both allow and deny tests.

## 9. Working / Published architecture

Working state and Published state are deliberately isolated.

~~~text
Owner edits
  |
  v
Working revision N
  |
  | explicit publish exact revision N
  | authorization
  | validation
  | moderation/account eligibility
  v
Published public-safe projection N
~~~

Rules:
- autosave changes Working only;
- save acknowledgement does not imply public state changed;
- public pages read Published projections;
- Draft/Working/Hidden/private fields are not exposed through public endpoints.

## 10. Concurrency

Overwrite-style authoritative writes use revision preconditions.

~~~text
client sends baseRevision = N

server:
  if authoritative revision != N
      reject STALE_WRITE
  else
      validate
      write
      increment to N + 1
~~~

Last-write-wins is not the default for authoritative owner data.

Out-of-order responses must never regress visible authoritative state.

## 11. Publication and idempotency

Publish operations must include:
- stable entity identity;
- expected Working revision;
- authenticated/authorized actor;
- idempotency/operation identity where duplicate submission could create harmful duplicate reality.

A publish operation should atomically create/update, where technically possible:
- Published projection;
- publication metadata;
- accountable Audit event;
- transactional outbox event when asynchronous side effects are required.

Onboarding multi-record publication must be orchestrated server-side and return per-record outcomes. The UI must not emulate an atomic multi-record business workflow through an unsafe chain of unrelated requests.

## 12. Handle and persistent reference rules

### Handle
- mutable human-facing locator;
- normalized by a typed parser/normalizer;
- uniqueness enforced transactionally;
- historical alias/reservation continuity preserved according to locked policy.

### Spill Reference
- stable owner-scoped identifier;
- allocated durably;
- never reused after retirement;
- exact lookup takes precedence over fuzzy keyword search.

Identifier parsing must be centralized and tested.

## 13. Search architecture

Phase 1 uses PostgreSQL and deterministic routing:

1. exact Handle resolution;
2. exact Spill Reference resolution;
3. canonical / legacy URL resolution where required;
4. creator-scoped PostgreSQL full-text search;
5. trigram/similarity only where useful.

Exact identifier resolution is conservative. Keyword discovery may be more forgiving.

If a dedicated search engine is needed later, it is a rebuildable projection. PostgreSQL remains canonical truth.

## 14. Media architecture

Cloudflare R2 stores binary objects outside PostgreSQL.

Trust classes must be separated, for example:
- public media;
- temporary uploads;
- private moderation evidence;
- backups.

Browser upload model:
1. authenticated request asks server for an upload intent;
2. server authorizes owner/action/content class;
3. server issues a short-lived constrained presigned URL;
4. upload is validated for size, real MIME/magic bytes, decodability, dimensions, ownership, and metadata policy;
5. only approved public-safe metadata reaches Published projections.

Privileged R2 credentials never enter browser code.

## 15. External URL and metadata safety

Outbound and metadata systems must:
- accept safe supported protocols, normally HTTPS;
- reject javascript:, data:, file:, and unsupported schemes;
- avoid generic arbitrary redirect endpoints;
- validate stored marketplace/resource destinations;
- defend metadata fetchers against SSRF;
- block loopback/private/link-local/metadata targets;
- revalidate redirects;
- use response size and timeout ceilings;
- prefer provider adapters/allowlists where practical.

## 16. Background work

Durable asynchronous work uses:
- Supabase Queues / pgmq;
- Supabase Cron / pg_cron;
- idempotent workers;
- transactional outbox when authoritative DB changes require external side effects.

Never rely on fire-and-forget HTTP after an authoritative mutation.

## 17. Audit

Audit is append-only accountable reality.

Rules:
- normal application roles cannot update/delete historical audit events;
- sensitive authoritative mutations write Audit atomically with the protected DB mutation where possible;
- corrections/reversals create new events;
- sensitive evidence disclosure requires authorization, strong-auth freshness where required, and durable accountability;
- Audit is not analytics and must not become a raw secret/log dump.

## 18. Rate limiting and abuse prevention

Use distributed, action-specific rate limiting rather than one generic limit.

Keys may combine:
- IP;
- authenticated user;
- Owner;
- action;
- abuse context.

Turnstile may protect abuse-prone unauthenticated/auth flows, but server verification is mandatory and Turnstile success never substitutes for authorization.

## 19. Error contract

Application/server layers expose typed semantic errors instead of raw provider/database exceptions.

Baseline classes:
- UNAUTHENTICATED
- FORBIDDEN
- REAUTH_REQUIRED
- VALIDATION_ERROR
- NOT_FOUND_OR_UNAVAILABLE
- STALE_WRITE
- SAVE_FAILED
- PUBLISH_FAILED
- RATE_LIMITED
- DEPENDENCY_UNAVAILABLE
- INTERNAL_ERROR

Internal logs may preserve precise technical cause while outward messaging follows anti-enumeration and disclosure policy.

## 20. Observability

OpenTelemetry is the instrumentation standard.

Sentry is the initial error/performance backend.

Use:
- trace/correlation IDs;
- structured semantic logging;
- typed error codes;
- environment/release identity;
- queue/worker health;
- DB timing where appropriate.

Never log by default:
- passwords;
- access/refresh tokens;
- authorization headers;
- privileged cookies;
- service keys;
- raw sensitive evidence;
- unnecessary private form content.

## 21. Analytics boundary

Spall Spill-owned analytics is canonical for creator/business metrics.

PostHog is internal telemetry only and must not become the source of truth for creator-facing metrics.

Owner preview is excluded from normal audience metrics.

Marketplace outbound click remains click intent, not purchase.

## 22. Environment model

~~~text
LOCAL
  ->
PREVIEW / DEV
  ->
STAGING / RELEASE VERIFICATION
  ->
PRODUCTION
~~~

Rules:
- production secrets/data are not casually reused in development;
- preview environments must not accidentally use production privileged credentials;
- environment contracts are documented in .env.example;
- all required deployment state should be reproducible from repository + controlled secret configuration.

## 23. CI/CD gates

As applicable, merge/release verification includes:

- frozen dependency install;
- format verification;
- lint;
- TypeScript typecheck;
- unit tests;
- migration/reset validation;
- RLS/grant allow + deny tests;
- integration tests;
- Semgrep;
- Gitleaks;
- dependency vulnerability scan;
- Next.js production build;
- preview/staging deployment;
- critical Playwright E2E.

Critical framework/runtime vulnerabilities block normal release until resolved or explicitly risk-managed.

## 24. Performance and scaling

Public pages should use cacheable Published projections.

Track at minimum:
- LCP;
- INP;
- CLS;
- public response p95;
- owner action/API p95;
- DB query latency;
- error rate;
- queue depth/age;
- worker failure rate.

Do not introduce specialized infrastructure before measured need.

Normal growth path:
- larger provider plans/capacity;
- larger database compute/disk;
- managed backups/PITR;
- larger rate-limit/email/observability allowances;
- dedicated search/analytics only after measured need.

## 25. Backup and recovery

Before serious public production:
- enable appropriate provider-managed backups;
- create independent logical PostgreSQL backups;
- store independent backups privately, such as encrypted/compressed objects in a private R2 bucket;
- define retention;
- perform restore drills into fresh non-production storage;
- run integrity and smoke verification;
- define RPO/RTO;
- document rollback and secret rotation.

A backup that has never been restored is not considered verified.

## 26. Architecture definition of done

A feature is architecturally complete only when:
- authority is server-side where required;
- validation exists at trust boundaries;
- public/private data boundaries are preserved;
- concurrency/idempotency semantics are correct;
- typed errors exist;
- security failure cases are tested;
- observability is sufficient to diagnose failure;
- migrations/configuration are reproducible;
- relevant unit/integration/E2E tests pass;
- documentation is updated if architecture or product truth changed.

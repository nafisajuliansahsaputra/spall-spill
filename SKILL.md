# Spall Spill — SKILL

**Purpose:** operating instructions for ChatGPT, coding agents, and human contributors implementing Spall Spill.  
**Scope:** implementation and review behavior, not replacement product authority.

## 1. Role

Act as a senior product engineer / technical lead for a clean production rebuild.

The job is not to recreate the legacy runtime blindly. The job is to implement the locked Spall Spill product semantics on the current production architecture with strong correctness, security, maintainability, performance, and release discipline.

## 2. Mandatory context load

Before making a material implementation change, read in this order:

1. docs/product-spec/PRODUCT-SOURCE-OF-TRUTH.md
2. docs/product-spec/MIGRATION-MANIFEST.md when provenance matters
3. docs/product-spec/technical-architecture/12.4-production-technology-stack-security-architecture.md
4. PRD.md
5. ARCHITECTURE.md
6. TODO.md
7. WORKFLOW.md
8. the exact historical locked modular specification for the surface being implemented, when PRODUCT-SOURCE-OF-TRUTH.md says that detail remains in the pinned historical source

For a user-flow change or implementation, read the relevant J1–J9 flow before coding.

Do not guess a locked behavior from memory when the canonical file is available.

## 3. Source-of-truth discipline

Never silently override a locked product decision.

If implementation reveals a genuine missing decision:
1. identify the exact unresolved decision;
2. determine whether it materially blocks the current surface;
3. propose the smallest resolution;
4. do not broaden it into product redesign;
5. record the agreed resolution in the appropriate canonical location;
6. update User Flow only if the user-visible journey topology changes;
7. read the updated source back before treating the decision as complete.

Implementation details that fit existing locked semantics may be chosen without reopening product definition.

## 4. Legacy repository rule

The legacy spall-spill-next runtime is **not** an implementation dependency.

Allowed use:
- historical product decision readback;
- behavior/spec provenance;
- comparison to understand what must not regress at the product level.

Disallowed default behavior:
- copying old runtime architecture;
- copying Firebase/Firestore assumptions into the new stack;
- carrying forward old technical debt because it already exists;
- treating old UI/source code as canonical implementation authority.

## 5. Engineering principles

### 5.1 Correctness before cleverness
Prefer explicit contracts, typed state, predictable transactions, and testable services over compact but ambiguous code.

### 5.2 Modular monolith first
Do not introduce microservices or specialized infrastructure without measured need.

### 5.3 Server authority
Protected mutations, ownership decisions, publication, moderation, and operator actions are authoritative server-side.

### 5.4 Defense in depth
Server authorization is primary; grants/RLS are tested defense in depth.

### 5.5 Working is not Published
Never let autosave or ordinary Working mutation silently update public projections.

### 5.6 Stable identity
Handle is a locator, not Owner identity. Persistent Spill Reference is stable and never recycled.

### 5.7 Explicit failure semantics
Use typed errors and explicit stale-write/idempotency behavior. Never leak raw provider errors directly to users.

### 5.8 Reproducibility
Database schema, migrations, configuration shape, tests, and build behavior must be reproducible from the repository.

## 6. TypeScript rules

- Keep strict mode enabled.
- Keep noUncheckedIndexedAccess enabled.
- Keep exactOptionalPropertyTypes enabled.
- Avoid any. If any is truly required at an external boundary, isolate it and narrow immediately.
- Prefer unknown at untrusted boundaries.
- Use discriminated unions for lifecycle/result/state machines.
- Centralize domain identifiers and parsers.
- Use branded/value-object-style types where they materially reduce ID mixups.
- Do not duplicate domain enums as unrelated UI string literals.

## 7. Validation rules

Use Zod or an equivalent deliberate runtime validator at trust boundaries:
- request payloads;
- route/query params;
- environment variables;
- external provider responses;
- metadata extraction;
- webhook/queue payloads;
- public identifier parsing.

TypeScript types alone are not runtime validation.

## 8. UI / React rules

- UI components render product state; they do not define domain truth.
- Keep server/data logic out of presentational components.
- Client components should be used only where interactivity requires them.
- Prefer Server Components for server-backed reads where appropriate.
- Never expose privileged secrets to client bundles.
- Do not directly query private canonical tables from browser code.
- Preserve keyboard, focus, screen-reader, and responsive behavior.
- Loading, empty, saving, saved, error, forbidden, unavailable, and stale/conflict states must be intentional.
- Do not sacrifice performance for ornamental effects.

## 9. Data-access rules

- All DB changes use committed versioned migrations.
- Do not rely on undocumented dashboard-only schema changes.
- Keep private canonical data separate from public-safe projections.
- Scope owner operations by trusted owner identity.
- Test cross-owner denial.
- Test public denial of Draft/Working/Hidden data.
- Keep Audit and analytics separate.

## 10. Working / publication rules

For authoritative editable records:
- persist a revision token;
- overwrite-style mutation sends baseRevision;
- reject mismatch with STALE_WRITE;
- do not use silent last-write-wins by default.

Publish:
- authorizes actor;
- loads exact Working revision;
- validates publication requirements;
- checks moderation/account eligibility;
- builds public-safe projection;
- commits publication state atomically where possible;
- writes accountable Audit where required;
- uses idempotency when duplicate submission could create duplicate reality.

## 11. Security review checklist

For every new protected feature, ask:

- Who is authenticated?
- Who is authorized?
- Can an attacker forge another Owner ID?
- Can a public user access Working/Draft/Hidden data?
- Is input validated at runtime?
- Can a URL become an SSRF/open-redirect/XSS vector?
- Does a file upload verify actual content?
- Is a secret exposed to client code/logs/analytics?
- Does the action need rate limiting?
- Does it need fresh authentication/MFA?
- Does the action require Audit?
- Can retry/duplicate submission create duplicate authority?
- Can concurrency overwrite newer data?
- What happens if an external dependency fails after DB commit?

Do not consider a security-sensitive task complete without negative tests.

## 12. Testing skill

Use the smallest test level that proves the rule, then cover critical user paths end-to-end.

### Unit
Use for:
- parser/normalizer;
- lifecycle;
- permission function;
- projection stripping;
- error mapping;
- pure business rules.

### Database / integration
Use for:
- RLS/grant allow + deny;
- owner isolation;
- transaction behavior;
- reference allocation;
- revision conflicts;
- publication;
- Audit/outbox;
- adapter boundaries.

### E2E
Use Playwright for:
- auth/session;
- onboarding;
- publish;
- returning-owner operations;
- exact reference;
- browse/search;
- destination actions;
- protected operator boundaries.

A passing happy-path UI test does not replace authorization/database denial tests.

## 13. Performance skill

Default priorities:
1. correctness;
2. security;
3. user-perceived responsiveness;
4. maintainability;
5. infrastructure efficiency.

Use cacheable Published projections for public traffic.

Avoid:
- unnecessary client JavaScript;
- duplicate fetches;
- N+1 queries;
- oversized image/media delivery;
- expensive unindexed discovery queries;
- loading private owner data into public pages;
- premature infrastructure complexity.

Measure before adding specialized infrastructure.

## 14. Git and change discipline

Each change should be:
- narrow enough to review;
- complete enough to test;
- associated with a TODO item or clearly documented maintenance reason;
- committed with an informative message;
- free of secrets and generated junk;
- verified before merge.

Recommended branch prefixes:
- feat/
- fix/
- refactor/
- security/
- perf/
- test/
- docs/
- chore/

Recommended commit style:
- feat: ...
- fix: ...
- refactor: ...
- security: ...
- perf: ...
- test: ...
- docs: ...
- chore: ...

## 15. Definition of done for an implementation task

Before calling work done:

- relevant canonical spec was read;
- implementation matches the locked product semantics;
- TypeScript passes;
- lint/format passes;
- unit/integration tests for the changed rule pass;
- database policy denial cases pass where relevant;
- production build passes;
- critical E2E passes where relevant;
- security implications were checked;
- no secret/private data is exposed;
- observability is sufficient;
- TODO is updated;
- architecture/product docs are updated if and only if the change altered documented truth;
- final diff is reviewed for accidental unrelated changes.

## 16. When uncertain

Do not improvise a large product decision.

Use this priority:
1. retrieve the exact canonical rule;
2. infer only implementation detail that does not alter semantics;
3. if still blocked, surface the smallest unresolved decision;
4. continue all non-blocked work.

The goal is fast execution without product drift.

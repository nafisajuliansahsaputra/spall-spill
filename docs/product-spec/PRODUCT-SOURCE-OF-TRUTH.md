# SPALL SPILL — PRODUCT SOURCE OF TRUTH

> **Canonical production repository:** `nafisajuliansahsaputra/spall-spill`

This file is the canonical execution index for the clean rebuild. Historical decision provenance is pinned in [`MIGRATION-MANIFEST.md`](./MIGRATION-MANIFEST.md).

## Mandatory Implementation Execution Protocol

All production implementation work in this repository must follow [`IMPLEMENTATION-EXECUTION-PROTOCOL.md`](./IMPLEMENTATION-EXECUTION-PROTOCOL.md).

The Implementation Execution Protocol is **LOCKED / MANDATORY CROSS-CHAT EXECUTION AUTHORITY** for implementation workflow, including:

- local-first execution and deny-by-default remote writes by default, with the explicitly bounded `codex/autopilot` Codex Cloud lane authorized by Protocol §2;
- fresh authority/branch/source audits before implementation;
- just-in-time technical-contract locking before new production checkpoints;
- bounded one-logical-batch execution;
- one-file-per-PowerShell-block creation/full replacement in default Owner-local delivery, with direct cloud-workspace editing allowed only inside the bounded Codex Cloud lane;
- security-by-construction and targeted runtime/manual security verification;
- staged-diff review before commit;
- local evidence before push;
- remote CI/Security verification after push;
- documentation closure and committed readback before `CLOSED / VERIFIED`.

Generic continuation language such as `gas`, `lanjut`, `ok`, or `terusin` never creates ad-hoc remote mutation authority. The only persistent remote-write exception is the repository-scoped Autonomous Codex Cloud Lane explicitly defined in the locked Implementation Execution Protocol; that exception does not authorize direct `main` writes, production deployment, destructive production operations, paid-service activation, or locked product-semantic changes.

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

[`technical-architecture/12.12-onboarding-relevant-first-job-foundation-contract.md`](./technical-architecture/12.12-onboarding-relevant-first-job-foundation-contract.md)
locks S5 progress, recommendation, and focused optional-entry presentation after
reconciling the preserved implementation with pinned O01/J1–J4. Complete
Product/Resource lifecycle mechanics, O01-S6 Preview & Publish, and public-media
publication remain separate JIT checkpoints.

[`technical-architecture/12.13-spill-item-reference-foundation-contract.md`](./technical-architecture/12.13-spill-item-reference-foundation-contract.md)
locks private canonical Item/reference reservation at first durable Product Draft
save, with immutable Owner-scoped numbering and an additive legacy-Draft backfill.
This resolves the 11.22 creation-threshold/reference mismatch; it creates no public
content or publication capability. Resource Draft was subsequently locked by 12.14;
complete Product/publication lifecycle work remains governed by later JIT contracts.

This does not change the locked six-step O01 journey, universal capability model, Working-versus-Published isolation, or onboarding-completion rule. Successful first authoritative Identity publication remains the completion boundary.

[`technical-architecture/12.14-resource-draft-contract.md`](./technical-architecture/12.14-resource-draft-contract.md)
locks semantic-first Resource Draft persistence and universal S5 access. Draft
creation reserves permanent Resource identity atomically and remains private.
Resource implementation `adcdb4c` and login navigation repair `7e482c9` passed
their full CI and Security workflows. This verifies those bounded slices, not
complete Product lifecycle, S6 publication, or live provider integration.

[`technical-architecture/12.15-onboarding-private-preview-contract.md`](./technical-architecture/12.15-onboarding-private-preview-contract.md)
locks the bounded S6 private snapshot and responsive review. Local database,
application and browser verification passes. Combined remote evidence for the
current integration branch is tracked in TODO rather than inferred from older
usage-gated status. This snapshot grants no publication authority. First Publish,
public media transport and complete S6 closure remain open.

[`technical-architecture/12.16-onboarding-preview-receipt-contract.md`](./technical-architecture/12.16-onboarding-preview-receipt-contract.md)
locks explicit, Owner-bound preview confirmation with fixed expiry and stale
snapshot rejection. Local RPC/application/browser checks pass. Receipts grant
no publication authority; combined remote evidence is tracked in TODO and full
S6 publication remains open.

Contract 12.17 implements the scoped account-state notice already used by the
resolver and explicit current-session exit. Local account-routing/Sign Out
browser and application checks pass; full D10 enforcement/review remains open.

Contract 12.18 stages atomic first-publication transactions and immutable,
idempotent acknowledgments. Database and concurrency checks pass locally; RPC
access is withheld until public/workspace/UI transport is verified. Product
preview explicitly stays pending because mandatory primary-image/marketplace
preparation is absent. No first-publication UI or full S6 closure is claimed.

Contract 12.19 stages published-only Identity/Resource readers with uniform
unavailable state, protected Handle aliases, fresh source safety and private-field
exclusion. Anonymous execution remains withheld. The combined local batch passes
1,097 database assertions, five concurrency tests and 551 application/tooling
tests, plus typecheck, lint, three builds, schema lint, error-level security
advisors and a zero-finding dependency audit. The integrated autonomous baseline
through `d5156360f2c748da0184eedb622b51686ea9b95b` subsequently passed GitHub
CI Application + Database (run 37272077522), Security Secret Scan + SAST +
Dependency Scan (run 37272077487), and Autopilot Guard (run 37272077479).
This remote evidence verifies the integrated baseline; it does not substitute
for still-open browser/manual/live-provider gates.
Contract [12.20](./technical-architecture/12.20-private-product-preparation-contract.md)
locks private primary-image and ordered marketplace-destination preparation on an
existing saved onboarding Product Draft. Current-Owner RPCs enforce same-Owner
finalized media, independent preparation revision and expected Product revision.
Manual image/destination entry preserves attribution and incomplete Drafts.
This private slice leaves Product publication pending; public media transport,
Product-safe projections and exact preparation/safety binding into preview,
receipt and first Publish remain separate gates. Live media/browser/provider
evidence remains open. Implementation `11e515da32fb2cead2e24fd380d068ceb36a6f80`
passed exact-commit CI Application/Database (run 37280505809), all three Security
jobs (37280505869) and Autopilot Guard (37280505805). Database evidence includes
1,164 pgTAP assertions and six concurrency tests. Bounded-cycle limitations and
evidence are tracked in TODO; this does not close S5/S6.

Contract [12.21](./technical-architecture/12.21-published-identity-media-transport-contract.md)
stages public Identity image delivery from an exact Published snapshot. A narrow
server-only resolver checks active/completed/Published visibility and finalized
same-Owner canonical media; bounded R2 streaming rechecks the exact publication
before delivery. HTTP returns bytes or uniform unavailable, with no storage keys,
signed URLs or viewer account requirement and conservative no-store caching.
Working selections remain private. Live R2/browser revocation, production cache/
abuse gates, Product image projection, existing public reader grants and media
publication enabling remain open; no S5/S6 closure is claimed.

Exact commit `167df3a2d4f01a6e2d6c1f09ce500cf7e8c4711a` passed Application/Database
CI (37318466602), all three Security jobs (37318466588) and Autopilot Guard
(37318466772), including 1,201 pgTAP assertions, reset/lint/error-level security
advisors and six concurrency tests. Provider/browser/production gates remain open.

Contract [12.22](./technical-architecture/12.22-product-private-preview-binding-contract.md)
binds the saved Product image, preparation revision, ordered exact marketplace
destinations and current per-source safety revision/expiry into private S6 review
and its receipt digest. Trusted private image preview and escaped destination
text do not activate outbound transport. Changed preparation invalidates old
review; Product publication remains pending. Published Product projection/media
and fresh locked publication checks remain separate unfinished dependencies.

Exact commit `c65cbba758e64c36b98cb572c6c5edf85a38c9fe` passed Application/Database
CI (37320066050), all three Security jobs (37320066244) and Autopilot Guard
(37320066126), including 1,253 pgTAP assertions across 23 files and seven
concurrency tests. Local application/tooling checks passed with 652 tests and
three builds. This evidence does not close the missing browser/provider/public
transport and production-readiness gates.

Contract [12.23](./technical-architecture/12.23-published-product-media-transport-contract.md)
stages Product image transport from exact Published Product/Identity snapshots,
with public Handle/reference/type scoping, finalized same-Owner canonical media
and a post-download publication-token check. Missing Published preparation fields
never use private fallback. Image delivery does not grant marketplace outbound
authority or change lifecycle on destination degradation. Product detail projection,
fresh locked publication binding, live media/provider and production cache/abuse
gates remain open; existing publication/public reader grants remain withheld.

Exact media commit `363de7469ba6ea16a094be12b5bd06ef71c7fd99` passed Application/
Database CI (37325548751), all three Security jobs (37325548508) and Autopilot
Guard (37325548510), including 1,314 pgTAP assertions and seven concurrency tests.
Application/tooling checks passed with 700 tests and three builds. Observed local
HTTP evidence covers generic denial only, not live storage success or revocation.

Contract [12.24](./technical-architecture/12.24-published-product-projection-contract.md)
stages a minimal exact Published Product detail projection. It retains image/title/
Owner/reference context and ordered validated provider context while masking URLs
without fresh safe URL/hash verdicts. Partial/all destination degradation changes
availability only, not lifecycle or Published content. The Product reader has no
Data API execution grants; complete detail/action/click assembly and publication integration
remain unfinished. No Product publish-ready or S5/S6 closure claim is introduced.

Exact projection commit `4babc5ecab499be57e397b5480d3fbbe6e748f43` passed push-event
Application/Database CI (37362911336), all three Security jobs (37362911320), and
Autopilot Guard (37362911347). Database reset, lint, error-level security advisors,
1,367 pgTAP assertions across 25 files and seven concurrency tests passed.
Application/tooling checks passed with 723 tests and three builds. Browser, live
provider/storage, cache/abuse evidence and S5/S6 closure remain open.

Contract [12.25](./technical-architecture/12.25-published-product-confirmation-renderer-contract.md)
implements the staged, unmounted Product visual/context confirmation region.
It validates only strict public DTOs, renders Published Owner/reference/title and
the exact unoptimized same-origin image, escapes text and retains confirmation
through destination degradation. All-unavailable commerce is communicated with
safe Owner/Browse navigation retained. It fetches no data and emits no outbound
URLs/actions. Public routing, marketplace action/click transport, provider/cache/
browser evidence and first Publish remain unfinished; no grants are enabled.

Contract [12.26](./technical-architecture/12.26-published-product-destination-resolution-contract.md)
stages exact Published marketplace destination resolution with current safety,
Identity/Product publication-token and provider/original-URL-hash binding. The
read-only resolver preserves creator attribution and has no execution grants to
public/anon/authenticated/service_role. A strict server-only validator adds no
browser authority, redirect, intent or public action. Context-intent transport,
P03 action assembly and publication integration remain unfinished; database and
exact latest-push CI/Security/Guard evidence remain PENDING until observed.
Exact resolver implementation `43363369ca86b3773e132449863e3a144f0c27f9` passed
isolated Database reset/lint/error-level advisors, 1,424 pgTAP assertions across
26 files and seven concurrency tests. Its Dependency Scan detected transitive
`source-map-js` advisory GHSA-68fv-2mgg-jv7q; the patched dependency and exact final
push still require all remote gates. This evidence does not enable public transport
or close S5/S6.
Patched final commit `7141fdce7af33c6aab26b685dd9bd4f6eadc882f` passed exact
push-event Application/Database CI (37398772253), all three Security scans
(37398772255) and Autopilot Guard (37398772256). Database again passed 1,424
pgTAP assertions and seven concurrency tests; no High dependency finding remains.

Contract [12.27](./technical-architecture/12.27-product-click-intent-core-contract.md)
stages a server-only opaque one-use click-intent core with mandatory injectable
atomic storage. It binds validated server confirmation/Published selection,
selected provider and original URL hash, fixed expiry and current safety on
redemption, without follower login or private context in the token. No concrete
persistence, schema/grant, route, CTA, redirect or publication is enabled. Unit
memory-store evidence does not prove durable database atomicity or browser
confirmation provenance. Those adapter/transport gates and S5/S6 remain open.
Exact core commit `4547321ac2842c130adcbc6383a48abd04e8d419` passed push-event
Application/Database CI (37399658222), all Security scans (37399658213) and
Autopilot Guard (37399658244). Existing Database regression passed 1,424 pgTAP
assertions and seven concurrency tests, not durable intent atomicity evidence.

Contract [12.28](./technical-architecture/12.28-product-click-intent-store-contract.md)
adds withheld durable hashed-token persistence, atomic create/consume and indexed
bounded expiry cleanup. RLS and all table/helper/RPC revokes retain the private
boundary. Database/concurrency verification remains PENDING until observed; no
raw token/URL storage or public action is enabled. Exact confirmation issuance,
application RPC adapter, cleanup wiring/clock alignment and public transport
remain unfinished; S5/S6 are not CLOSED / VERIFIED.
Store implementation `ee8173dbd51cee6b6bba40454de7f90328d73e84` passed isolated
reset/lint/error-level advisors, 1,503 pgTAP assertions and seven existing races.
The new race fixture needed explicit pgTAP extension setup outside the CLI's
transactional test runner; final durable concurrency/exact-push evidence is still
required. No test assertion or private access boundary was weakened.

Final store fixture commit `17127f940327191588ac8ae87532c720a00b88c7` passed
push-event Application/Database CI (37401010749), all Security scans (37401010787)
and Guard (37401010652). Database passed 1,503 assertions across 27 files and
nine real concurrency tests, including duplicate intent create and competing
committed consume. This completes that automated store evidence; public transport
and journey closure remain withheld.

Contract [12.29](./technical-architecture/12.29-product-click-intent-rpc-adapter-contract.md)
stages the injected server-only application adapter for existing private intent
RPCs. Strict create/consume responses and bounded single-call cleanup deny malformed
inputs, errors and exceptions without retry/fallback. All grants remain withheld;
no credentials, public route, issuance provenance or cleanup schedule is enabled.
Exact latest-push evidence remains PENDING until observed. Same-snapshot Published
confirmation/binding issuance and real authorized transport integration remain open.

### Current implementation checkpoint

#### Integrated implementation frontier — 2026-10-06

The preserved implementation was integrated through commit
`8d6f8c12c7161aace642342211e7f7d66867032f` before the Codex Cloud execution
setup documentation began.

The current integrated codebase now contains, in addition to the closed S4
foundation:

- S5 Relevant First Job presentation/progress foundation under 12.12;
- permanent private Item/reference reservation under 12.13;
- semantic-first Resource Draft persistence under 12.14;
- bounded S6 private Preview under 12.15;
- explicit Owner-bound preview receipt under 12.16;
- scoped restricted-account/session-exit behavior under 12.17;
- staged atomic first-publication transaction/acknowledgment behavior under 12.18;
- staged published-only Identity/Resource reader foundation under 12.19;
- private Product image/marketplace preparation under 12.20;
- staged Published Identity media transport under 12.21;
- private Product preparation preview/receipt binding under 12.22;
- staged exact Published Product media transport under 12.23;
- staged Product detail projection/per-destination availability under 12.24;
- staged Product visual/context confirmation renderer under 12.25;
- staged exact Published marketplace destination resolution under 12.26;
- staged opaque one-use Product click-intent core under 12.27;
- withheld durable Product click-intent store under 12.28;
- staged private Product click-intent RPC adapter under 12.29.

This implementation frontier does **not** mean S5 or S6 is CLOSED / VERIFIED.
The last fully closed checkpoint remains S4 because later journey-level,
provider, public-transport, publication-UI, and other required evidence/gates
remain incomplete.

The active implementation frontier is now **O01-S6 — Preview & Publish /
first-publication and public transport**, not Resource Draft creation.

Current open work includes, as applicable and in dependency order:

- remaining Product publication preparation: public media/Product projection and
  exact preparation-revision/image/destination/safety binding into publication
  (private persistence/review/receipt binding is present under 12.20/12.22);
- safe public route and external click transport;
- public Profile Media transport;
- explicit first-Publish UI/bundle wiring;
- universal D01 workspace handoff;
- enabling currently withheld public/RPC execution only after the relevant
  safety/transport gates are satisfied;
- complete S5/S6 browser/journey verification;
- deferred live Web Risk/Gemini provider verification when the external
  account/billing blocker is genuinely resolved.

Existing S5/S6 work must not be rebuilt merely because older planning inventory
below still contains unchecked historical items.

Current verification/evidence and operational readiness are tracked in
`../../TODO.md`. The earlier Web Risk/provider deferral remains in force until
replaced by real live verification evidence. No J1–J9 journey topology or
public-safety rule changes are introduced by this status reconciliation.

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

The last fully CLOSED / VERIFIED checkpoint remains **S4**, while the active
implementation frontier is **O01-S6 — Preview & Publish / first-publication and
public transport**. Contracts 12.12–12.29 govern the staged work already present.
S5/S6 remain **NOT CLOSED / VERIFIED** until their remaining journey, public
transport/publication, provider, runtime/manual, and remote evidence gates are
actually satisfied.

## User Flow status

**J1–J9 remain unchanged by the repository/technology migration.** No Mermaid topology update is required because infrastructure and security boundaries do not change the locked user-visible journey sequence.

## Implementation authority

Broad stack planning is complete. Production implementation is authorized to proceed in this repository.

Broad production sequence (historical roadmap, **not** the current task list):

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

For current task selection, use the Current implementation checkpoint above plus
the top current-frontier section of `TODO.md`. Do not restart completed roadmap
steps merely because this broad sequence is retained for historical planning.

Remaining Open Decisions are resolved only when they materially constrain the implementation surface currently being built.

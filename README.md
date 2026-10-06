# Spall Spill

Full-stack creator/business identity and structured discovery platform for publishing a public Identity, Products, Resources, and shareable Spill content without forcing users into a fixed account type.

**Status:** In Development · **Role:** Full-Stack Developer / Product Engineer

[Portfolio](https://natsx.my.id)

## Recruiter snapshot

Spall Spill is being built as a production-oriented modular monolith with a strong separation between private Working state and public Published state.

The project demonstrates product architecture, authentication, authorization, PostgreSQL data modeling, publication workflows, concurrency control, media handling, URL safety, automated security checks, and multi-surface frontend engineering.

| Area | Implementation |
| --- | --- |
| Application | Next.js 16.3.6, React 19.2.8, TypeScript, Tailwind CSS 4 |
| Data & auth | PostgreSQL on Supabase, Supabase Auth, RLS/grant defense in depth |
| Architecture | Modular monolith, pnpm workspaces, Turborepo |
| Media | Cloudflare R2-compatible object storage, dedicated sanitizer service |
| URL safety | Dedicated scanner with redirect, network-address, content, and policy checks |
| Reliability | Revision-aware writes, stale-write rejection, idempotent publication design |
| Testing | Vitest, Node test runner, Playwright direction, pgTAP / Supabase DB tests |
| Security | Gitleaks, Semgrep, OSV dependency scanning, CSP, deny-by-default server authorization |

## What the product does

Spall Spill has two first-class product surfaces:

- **Identity** for a creator, personal brand, affiliator, or business profile.
- **Spill** for structured public discovery of Products and Resources.

A user can start with a simple public identity and add more capabilities later without migrating to another account type or rebuilding their public presence.

Core product concepts include:

- account creation and authentication;
- unique Handle claiming;
- public Identity;
- social / connection links;
- Product and Resource drafts;
- stable Spill references;
- private preview;
- explicit publication;
- public-safe published projections;
- outbound destination safety;
- profile media handling;
- creator/business analytics direction;
- operator/moderation architecture.

## Engineering highlights

- Designed **Working and Published state as separate realities**, so autosave never silently changes public content.
- Built **server-derived authorization boundaries** instead of trusting browser-owned role or ownership state.
- Implemented **revision-aware persistence and stale-write rejection** to prevent silent last-write-wins corruption.
- Added durable **Spill reference allocation** so public references remain stable and are not reused after retirement.
- Built onboarding state for Handle claim, Identity creation, starter composition, connection setup, Product/Resource drafts, private preview, and staged first publication.
- Added a dedicated **URL safety scanner** covering redirects, network-address restrictions, content policy, semantic classification, and destination validation.
- Added a dedicated **media sanitizer** with authenticated service boundaries and adversarial processing tests.
- Integrated **Cloudflare R2-compatible media storage** through server-controlled object-store boundaries.
- Added reproducible **Supabase migrations and database security tests**, including concurrency verification for reference allocation and onboarding publication.
- Added automated repository security gates using **Gitleaks, Semgrep, and OSV**.

## Architecture

```text
Browser
  |
  v
Next.js App Router
  |-- public published reads
  |-- authenticated owner surfaces
  |-- protected operator surfaces
  |
  v
Application / Domain Services
  |-- validation
  |-- authorization
  |-- revision / concurrency checks
  |-- publication
  |-- idempotency
  |-- audit
  |-- destination safety
  |
  v
Repository / Data Access
  |
  v
Supabase PostgreSQL
  |-- private Working state
  |-- public-safe Published projections
  |-- analytics / moderation / audit

External services
  |-- Supabase Auth
  |-- R2-compatible media storage
  |-- Media Sanitizer
  |-- URL Safety Scanner
```

UI code does not own business authority. Protected mutations are validated and authorized server-side.

## Working vs Published

The central lifecycle rule is simple:

```text
Owner edits
   |
   v
Working revision N
   |
   | explicit publish
   v
Published projection N
```

Important guarantees:

- Draft is not Working.
- Saved is not Live.
- autosave changes Working only;
- publication is explicit;
- public pages read public-safe Published projections;
- private lifecycle state does not leak into public discovery;
- authoritative writes use revision preconditions where needed.

## Current implementation status

Already implemented or integrated in the active codebase:

- local Supabase foundation and versioned migrations;
- authentication/session foundation;
- Owner identity and account-state resolution;
- onboarding progress and Handle claim;
- Basic Identity Working persistence;
- profile media foundation;
- starter composition;
- relevant-first-job resolution;
- Identity connections;
- Product draft foundation;
- Resource draft foundation;
- stable Spill reference registry;
- destination safety foundation;
- private onboarding preview;
- staged publication foundations;
- public-reader foundations for published Identity / Resource data;
- media sanitizer service;
- URL safety scanner;
- CI and repository security gates.

Still in development:

- final first-publication wiring;
- remaining public/click/media transport;
- Product publication preparation;
- full public handoff and discovery flow;
- remaining browser/journey verification;
- live-provider production verification;
- release hardening.

The detailed execution frontier is maintained in [`PRODUCT-SOURCE-OF-TRUTH.md`](docs/product-spec/PRODUCT-SOURCE-OF-TRUTH.md) and [`TODO.md`](TODO.md).

## Core stack

### Application

- Next.js 16.3.6
- React 19.2.8
- TypeScript
- Tailwind CSS 4
- Zod
- pnpm
- Turborepo

### Data & authentication

- PostgreSQL
- Supabase
- Supabase Auth
- versioned SQL migrations
- RLS / grant policy tests

### Storage & safety

- Cloudflare R2-compatible object storage
- dedicated media sanitizer
- dedicated URL safety scanner
- external-destination policy package
- profile-media policy package

### Quality & security

- GitHub Actions
- Vitest
- Node test runner
- Supabase database tests / pgTAP
- Gitleaks
- Semgrep
- OSV dependency scanning
- Content Security Policy

The broader production architecture also plans for Vercel, Cloudflare DNS/Turnstile, Upstash Redis, Resend, OpenTelemetry, and Sentry as the product reaches later release stages.

## Repository structure

```text
apps/
  web/                  main Next.js application
  media-sanitizer/      media processing boundary
  url-safety-scanner/   outbound URL safety service

packages/
  external-destination-policy/
  profile-media-policy/

supabase/
  migrations/
  tests/

docs/
  product-spec/

.github/
  workflows/
```

## Security posture

Security is treated as part of normal application architecture rather than a final release add-on.

Current repository safeguards include:

- server-side ownership authorization;
- private/public data separation;
- tested PostgreSQL RLS and grants;
- revision-aware writes;
- constrained media boundaries;
- outbound URL validation;
- redirect and private-network protections;
- Content Security Policy;
- repository secret scanning;
- static analysis;
- dependency vulnerability scanning.

Sensitive provider credentials remain server-only and are not committed to the repository.

## Local development

Requirements:

- Node.js 24 LTS
- pnpm 11
- Docker for local Supabase

Install and verify:

```bash
pnpm install --frozen-lockfile
pnpm test:tooling
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Start the full local workspace:

```bash
pnpm dev
```

The default development workspace runs:

- web application on port 3000;
- media sanitizer on port 3001;
- URL safety scanner on port 3002.

Local environment templates live beside each application. Provider credentials and shared service secrets must remain outside version control.

## CI

Application CI verifies:

- frozen dependency installation;
- TypeScript;
- lint;
- unit tests;
- production build.

Database CI additionally verifies:

- reproducible local Supabase startup;
- migrations from a clean reset;
- database linting;
- database security tests;
- concurrent Spill reference allocation;
- concurrent onboarding publication behavior.

Security CI runs:

- Gitleaks secret scanning;
- Semgrep SAST;
- OSV dependency scanning.

## Documentation

For deeper engineering review:

1. [Product Requirements](PRD.md)
2. [Architecture](ARCHITECTURE.md)
3. [Product Source of Truth](docs/product-spec/PRODUCT-SOURCE-OF-TRUTH.md)
4. [User Flows](docs/product-spec/user-flows/README.md)
5. [Technology & Security Architecture](docs/product-spec/technical-architecture/12.4-production-technology-stack-security-architecture.md)
6. [Onboarding Identity Contract](docs/product-spec/technical-architecture/12.10-onboarding-basic-identity-starter-composition-contract.md)
7. [Profile Media Contract](docs/product-spec/technical-architecture/12.11-profile-media-r2-storage-contract.md)
8. [Relevant First Job Contract](docs/product-spec/technical-architecture/12.12-onboarding-relevant-first-job-foundation-contract.md)
9. [Spill Reference Contract](docs/product-spec/technical-architecture/12.13-spill-item-reference-foundation-contract.md)
10. [Roadmap / TODO](TODO.md)

## Legacy implementation

The previous Firebase/Firestore-based implementation is retained privately as historical reference in `spall-spill-legacy`.

The active product architecture and implementation live in this repository.

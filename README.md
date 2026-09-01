# Spall Spill

Clean production-rebuild repository for Spall Spill.

This repository intentionally does **not** inherit the legacy runtime codebase. Production implementation is actively in progress on the clean architecture defined in `docs/product-spec/`.

## Current implementation checkpoint

- Foundation, local Supabase, CI/security gates, authentication/session, Owner-state resolution, and O01 onboarding through Starter Composition are implemented.
- Stage **6B.5 — S4 Application UI + 6B Regression Checkpoint** is **CLOSED / VERIFIED**: Starter Composition Working persistence, authenticated resolver/mutation boundaries, capability-neutral four-starter UI, backward editing without progress regression, stale-write failure truth, clean application/database regression, and remote CI/Security verification have passed.
- The next implementation checkpoint is **O01-S5 — Relevant First Job**. Its persistence/mutation/application mechanics must be defined and locked just-in-time before S5 code begins; no new Stage label is invented ahead of that contract.
- The canonical execution status lives in `docs/product-spec/PRODUCT-SOURCE-OF-TRUTH.md`; this README is only a repository entry point and must not override that authority.

## Canonical authority

Product and implementation decisions are governed by `docs/product-spec/`.

Key files:

- `docs/product-spec/PRODUCT-SOURCE-OF-TRUTH.md` — current canonical product/implementation index and execution checkpoint.
- `docs/product-spec/MIGRATION-MANIFEST.md` — immutable provenance of the historical Product Source of Truth.
- `docs/product-spec/technical-architecture/12.4-production-technology-stack-security-architecture.md` — locked production technology/security architecture.
- `docs/product-spec/technical-architecture/12.10-onboarding-basic-identity-starter-composition-contract.md` — locked O01-S3/S4 Basic Identity Working + Starter Composition implementation authority.
- `docs/product-spec/technical-architecture/12.11-profile-media-r2-storage-contract.md` — locked Profile Media / R2 implementation authority.

## Locked architecture direction

- Next.js Active LTS
- React 19
- Node.js 24 LTS
- TypeScript strict
- PostgreSQL on Supabase
- Supabase Auth + tested PostgreSQL RLS/grants
- Vercel application hosting
- Cloudflare DNS / R2 / Turnstile
- Upstash Redis rate limiting
- Supabase Queues/Cron
- Resend
- OpenTelemetry + Sentry
- GitHub Actions + Vitest + Playwright + pgTAP + security scanning

## Execution workflow

The owner executes setup, coding, configuration, and deployment locally while ChatGPT acts as technical lead/pair programmer/reviewer. Direct changes to GitHub, Supabase, Vercel, or other services happen only when explicitly requested.

Security is built continuously. Security-sensitive slices receive targeted runtime/manual verification before closure, while broad penetration testing is reserved for stable journey/MVP and pre-production gates as defined by the canonical Source of Truth.

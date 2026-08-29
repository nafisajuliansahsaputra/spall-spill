# Spall Spill

Clean production-rebuild repository for Spall Spill.

This repository intentionally does **not** inherit the legacy runtime codebase. Implementation has not started yet; the project is currently at the guided setup/execution starting point.

## Canonical authority

Product and implementation decisions are governed by `docs/product-spec/`.

Key files:

- `docs/product-spec/PRODUCT-SOURCE-OF-TRUTH.md` — current canonical product/implementation index.
- `docs/product-spec/MIGRATION-MANIFEST.md` — immutable provenance of the historical Product Source of Truth.
- `docs/product-spec/technical-architecture/12.4-production-technology-stack-security-architecture.md` — locked production technology/security architecture.

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

The next implementation step starts from environment/setup verification before any runtime scaffold is created.

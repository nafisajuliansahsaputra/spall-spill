# Spall Spill

Production rebuild of Spall Spill.

This repository is intentionally clean and does not inherit the legacy runtime codebase.

## Authority

Product and implementation decisions are governed by `docs/product-spec/` and the execution checkpoint in `docs/EXECUTION-STATE.md`.

## Architecture baseline

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

See `docs/product-spec/technical-architecture/12.4-production-technology-stack-security-architecture.md` for the canonical technology/security lock.

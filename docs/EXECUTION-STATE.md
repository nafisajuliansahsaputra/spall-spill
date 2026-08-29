# Spall Spill — Execution State

## Current status

**Production rebuild execution started.**

Canonical implementation repository:

`nafisajuliansahsaputra/spall-spill`

Legacy runtime repository:

`nafisajuliansahsaputra/spall-spill-next`

Legacy runtime is **non-canonical** and must not receive new production implementation work.

## Product authority

- Product Foundation — locked.
- J1–J9 — locked.
- FR 7.0–7.12 — locked.
- IA 8.0–8.6 — locked.
- Screen UX 9.0–9.25 — locked.
- Shared UX 10.0–10.6 — locked.
- Stage 11 locks 11.1–11.28 — execution gate satisfied.
- Stage 12.3 free-first progressive scale — locked.
- Stage 12.4 production technology + security architecture — locked.

Historical provenance is pinned in `docs/product-spec/MIGRATION-MANIFEST.md`.

## Current implementation milestone

**M0 — Clean production foundation**

In progress:

- clean private repository;
- product authority migration/provenance;
- monorepo/workspace scaffold;
- strict TypeScript/Next.js application baseline;
- security-header baseline;
- health/readiness endpoint;
- Supabase local/migration foundation;
- CI/security gate foundation.

## Next vertical slice

**M1 — Authentication foundation**

Before implementing auth UI/business behavior, read the exact locked A01/A02/A03/O01 screen specs and relevant Stage 11 security decisions from the pinned historical Product Source of Truth.

Target order:

1. Supabase browser/server clients and validated env contract.
2. Email/password + Google OAuth.
3. secure session handling.
4. server principal helper.
5. owner/auth identity linkage.
6. intended-destination return semantics (resolve remaining JIT security decision if implementation requires it).
7. Sign Up/Login/Recovery shells according to locked specs.
8. auth security tests and E2E.
9. Onboarding orchestration.

## Verification truth

Do not claim a command/test passed unless it was actually executed.

Current environment limitation: dependency installation/build verification has not yet been run from this connector environment. The repository must gain a generated `pnpm-lock.yaml` before CI switches to frozen dependency installation.

## Continuity rule

If the chat changes, continue by reading in this order:

1. `docs/EXECUTION-STATE.md`
2. `docs/product-spec/PRODUCT-SOURCE-OF-TRUTH.md`
3. the currently relevant screen/decision spec
4. latest commits / active branch

Then continue the next unfinished implementation milestone instead of restarting planning.

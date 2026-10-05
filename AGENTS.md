# Spall Spill — Codex Repository Instructions

## Authority and scope

This file controls how Codex works in this repository. It does not replace product or architecture authority.

Use the repository documents contextually:

- `docs/product-spec/PRODUCT-SOURCE-OF-TRUTH.md` is the canonical product and implementation checkpoint.
- `PRD.md` summarizes product requirements.
- `ARCHITECTURE.md` governs architecture and service boundaries.
- `WORKFLOW.md` governs delivery, testing, release, and incident workflow.
- `SKILL.md` contains repository-specific implementation guidance.
- `TODO.md` tracks active implementation work and evidence.
- Read the relevant locked contract under `docs/product-spec/technical-architecture/` before changing behavior covered by that contract.
- Read the relevant J1–J9 user-flow document before changing the corresponding journey.
- Do not invent a competing source of truth.

Do not reread every document mechanically for trivial edits. Read the documents relevant to the task and trust boundary being changed.

## Autonomous branch policy

Autonomous Codex work must stay on `codex/autopilot`.

- Never force-push.
- Never rewrite Git history.
- Never push autonomous implementation directly to `main`.
- Never delete or reset unrelated work.
- Synchronize safely before starting a new slice.
- Keep commits coherent, descriptive, and recoverable.
- Push completed coherent work so progress survives a cloud-task boundary.

If `codex/autopilot` diverges unexpectedly from its remote or a conflict cannot be resolved without choosing between meaningful user changes, stop and report the conflict instead of guessing.

## Task selection

Use `TODO.md` and the canonical Product Source of Truth to choose the highest-priority unfinished work that is not blocked.

Do not reopen work explicitly marked CLOSED / VERIFIED unless new evidence shows a regression.

Do not implement a behavior that conflicts with a locked product or technical decision. If a requested task requires changing a locked decision, stop that path and surface the conflict.

Prefer completing one coherent vertical slice with evidence over starting several incomplete slices.

## Implementation rules

- Preserve existing functionality unless the canonical requirements explicitly require a change.
- Fix root causes rather than weakening tests, authorization, validation, or security controls.
- Do not remove features merely to make CI pass.
- Reuse existing repository patterns when they remain appropriate.
- Keep secrets server-side and out of Git.
- Never commit `.env` files, credentials, service-role keys, access tokens, or private user data.
- Do not perform destructive production database or storage operations autonomously.
- Do not silently modify live production configuration.
- Migrations and security policy changes must remain reproducible from Git.

## Verification

Use the smallest relevant verification during iteration, then run the repository quality gates appropriate to the completed slice.

Workspace commands:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test:tooling`
- `pnpm test`
- `pnpm build`

For database or authorization work, also use the committed Supabase workflow and relevant pgTAP/concurrency tests defined by `.github/workflows/ci.yml`.

Never claim a task complete solely because code was written. Completion needs evidence appropriate to the change.

Do not bypass or disable CI/security checks to obtain a green result.

## Checkpoints and progress

Before ending a work cycle:

1. inspect the final diff;
2. leave the branch in a stable state;
3. commit coherent completed work;
4. push the commit to `codex/autopilot`;
5. update `TODO.md` only when the implementation status or verification evidence actually changed;
6. report the exact verification performed, remaining blocker if any, and the next useful action.

Do not create a parallel progress document when `TODO.md` already covers the status.

## Blockers

Do not spend an entire run repeating the same failed approach.

After several materially different attempts at the same blocker:

- preserve useful completed work;
- record concrete evidence;
- stop that blocked path;
- continue another independent safe task when one exists.

Require user input before:

- destructive or irreversible production actions;
- changing locked product semantics;
- resolving contradictory source-of-truth requirements;
- using missing credentials or granting new external access;
- accepting material security risk;
- incurring payment or enabling a paid service.

## Pull request and release policy

Autonomous work may prepare and update a pull request, but production release remains governed by `WORKFLOW.md`.

Do not merge to `main` merely because local checks pass. Respect CI, Security, live-runtime, manual, and pre-production gates required by the repository.

## Goal behavior

When a Codex Goal is active, continue choosing the next safe, highest-priority unfinished task until one of these is true:

- the Goal's evidence-based completion criteria are met;
- the available run/usage budget is reached;
- a real blocker requires the user;
- continuing would violate a locked decision or a safety rule above.

A budget stop is a checkpoint, not completion.

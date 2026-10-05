# Spall Spill — Codex Repository Instructions

## 0. Mandatory bootstrap before any material work

Codex must not begin implementation from conversation context, memory, TODO headings, or a single document.

At the start of a fresh Codex Cloud thread/environment, after a long pause, after an unexpected branch/HEAD change, or whenever repository authority may have changed, perform this orientation sequence **before editing source code**.

### A. Verify repository state first

Run and inspect:

- current repository identity;
- `git status`;
- current branch;
- current HEAD;
- recent relevant commits;
- remote tracking state.

Authorized remote autonomous branch: `origin/codex/autopilot`.

Codex Cloud may expose a synthetic local task branch such as `work`. In Cloud, the local branch name is not itself the authority boundary. Before reading project state or editing source, a clean isolated Cloud workspace must be synchronized so that local `HEAD` exactly equals `origin/codex/autopilot`. Outside that verified Cloud case, an unexpected repository, branch, or HEAD must stop and reconcile before writing.

### B. Mandatory first-read set

Read these files completely enough to understand their authority, current status, and active checkpoint:

1. `docs/product-spec/PRODUCT-SOURCE-OF-TRUTH.md`
2. `docs/product-spec/IMPLEMENTATION-EXECUTION-PROTOCOL.md`
3. `PRD.md`
4. `ARCHITECTURE.md`
5. `TODO.md`
6. `WORKFLOW.md`
7. `SKILL.md`
8. `README.md`
9. `docs/product-spec/user-flows/README.md`
10. when running in Codex Cloud, `docs/operations/CODEX-CLOUD-RUNBOOK.md`

Then inspect:

- the current implementation checkpoint in the Product Source of Truth;
- the immediate/unfinished work in `TODO.md`;
- the relevant locked technical contract(s) under `docs/product-spec/technical-architecture/`;
- the relevant J1–J9 user-flow document(s) under `docs/product-spec/user-flows/`;
- the relevant wireframe/spec document when the task touches that surface;
- affected source, migration, test, and workflow files before changing them.

For work whose provenance or migration history matters, also read:

- `docs/product-spec/MIGRATION-MANIFEST.md`;
- `docs/product-spec/HISTORICAL-SPEC-READBACK.md` when the canonical index points back to historical locked detail.

Do not infer a locked behavior from memory when the canonical repository file exists.

### C. Build a private orientation model before coding

Before implementation, Codex must be able to answer internally:

- What product is Spall Spill?
- What stage/checkpoint is currently active?
- What work is already CLOSED / VERIFIED?
- What remains incomplete?
- Which J1–J9 journey is affected?
- Which locked technical contract governs the change?
- Which data is Working/Draft versus Published?
- What are the authentication/authorization and trust boundaries?
- What tests/evidence are required before the slice can close?
- What actions are blocked by missing provider/live/manual evidence?

If these cannot be answered from repository authority, do not guess. Resolve the missing authority first.

### D. Resume behavior

A resumed automation run must not assume the previous chat accurately reflects the current repository.

On resume:

1. refresh branch/HEAD/remote state;
2. inspect commits created since the previous run;
3. reread the current checkpoint and immediate TODO section;
4. reread any canonical file changed since the previous orientation;
5. reread the relevant user flow and technical contract for the next slice;
6. inspect affected implementation before editing.

Full rereading of every large file is not required for every tiny edit after a valid orientation, but source-of-truth changes must always invalidate stale assumptions.

## 1. Authority hierarchy

This file controls how Codex operates in this repository. It does not replace product, architecture, or execution authority.

Use this precedence when documents appear to conflict:

1. `docs/product-spec/PRODUCT-SOURCE-OF-TRUTH.md` — canonical product and implementation execution index.
2. Locked J1–J9 User Flows — canonical user-journey behavior.
3. Relevant locked technical contract under `docs/product-spec/technical-architecture/`.
4. `docs/product-spec/IMPLEMENTATION-EXECUTION-PROTOCOL.md` — mandatory implementation workflow.
5. `PRD.md` — implementation-facing product summary.
6. `ARCHITECTURE.md` — architecture and service-boundary summary.
7. `WORKFLOW.md` — delivery, testing, release, and incident workflow.
8. `SKILL.md` — repository-specific contributor/agent guidance.
9. `TODO.md` — active implementation checklist and evidence; not independent product authority.
10. `README.md` — repository entry point; never overrides canonical records.

Do not invent a competing source of truth or a parallel product specification.

If two authoritative documents materially conflict, stop the conflicting implementation path and surface the exact conflict.

## 2. Autonomous branch policy

The authorized autonomous remote development branch is `codex/autopilot`.

Codex Cloud may run on a synthetic local branch such as `work`. That is permitted only when the workspace was clean before synchronization and local `HEAD` has been explicitly synchronized to `origin/codex/autopilot`. The locked Implementation Execution Protocol §2 authorizes ordinary non-destructive implementation, commit, and push work only within that verified lane. Completed Cloud commits must be pushed explicitly as `HEAD:codex/autopilot`; the synthetic local branch itself must never be published as a new remote branch.

Repository authority still wins. This file does not expand the permissions granted by the protocol.

Regardless of execution mode:

- Never force-push.
- Never rewrite Git history.
- Never delete or reset unrelated work.
- Never silently push autonomous implementation directly to `main`.
- Keep commits coherent, descriptive, and recoverable.
- Preserve completed work safely across task boundaries.

If local `HEAD` or the synthetic Cloud branch diverges unexpectedly from `origin/codex/autopilot`, or a conflict cannot be resolved without choosing between meaningful user changes, stop and report the conflict instead of guessing.

## 3. Task selection

Use the canonical Product Source of Truth plus `TODO.md` to choose the highest-priority unfinished work that is not blocked.

Do not reopen work explicitly marked CLOSED / VERIFIED unless new evidence shows a regression.

Do not implement behavior that conflicts with a locked product or technical decision.

If a requested task requires changing a locked decision, stop that path and surface the decision explicitly.

Prefer completing one coherent vertical slice with evidence over starting several incomplete slices.

## 4. Implementation rules

- Preserve existing functionality unless canonical requirements explicitly require a change.
- Fix root causes rather than weakening tests, authorization, validation, or security controls.
- Do not remove features merely to make CI pass.
- Reuse existing repository patterns when appropriate.
- Keep secrets server-side and out of Git.
- Never commit `.env` files, credentials, service-role keys, access tokens, or private user data.
- Do not perform destructive production database or storage operations autonomously.
- Do not silently modify live production configuration.
- Migrations and security policy changes must remain reproducible from Git.
- Working/Draft persistence must never silently become Published state.
- Authentication never substitutes for authorization.
- Public reads must use public-safe Published projections only where the canonical contracts require that boundary.

## 5. Verification

Use the smallest relevant verification during iteration, then run the repository quality gates appropriate to the completed slice.

Workspace commands include:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test:tooling`
- `pnpm test`
- `pnpm build`

For database or authorization work, also use the committed Supabase workflow and relevant pgTAP/concurrency tests defined by `.github/workflows/ci.yml` and the governing contract.

For user-journey or security-sensitive closure, respect required browser/runtime/manual/live-provider evidence. Automated green checks do not automatically close a checkpoint whose canonical acceptance criteria require more.

Never claim a task complete solely because code was written.

Do not bypass or disable CI/security checks to obtain a green result.

## 6. Checkpoints and progress

Before ending a work cycle:

1. inspect the final diff;
2. leave the branch in a stable state;
3. preserve coherent completed work according to the currently authorized Git workflow;
4. update `TODO.md` only when implementation status or verification evidence actually changed;
5. report exact verification performed;
6. report remaining blocker/evidence honestly;
7. identify the next useful action.

Do not create a parallel progress document when `TODO.md` and the Product Source of Truth already cover the status.

Do not mark a checkpoint CLOSED / VERIFIED unless every required evidence gate in canonical authority is actually satisfied.

## 7. Blockers

Do not spend an entire run repeating the same failed approach.

Temporary infrastructure delays are PENDING evidence, not human-only gates.
Examples include queued hosted runners, `runner_id = 0`, empty steps before
runner allocation, cancellation caused by a newer push/concurrency, and transient
network/provider outages. Do not infer missing credentials, billing trouble, or
an Owner action from those states alone. Recheck automatically on the next
scheduled return; keep the Goal/automation active while independent safe work exists.

Do not advance a path that directly requires the pending gate or mark its
checkpoint CLOSED / VERIFIED. Continue coherent independent dependency-safe
work authorized by the repository and push only to `codex/autopilot`. A run
superseded by a newer push is obsolete; use the exact latest pushed commit as
the next evidence target. All required CI/Security/Guard checks must genuinely
pass on the exact final commit before a final verified checkpoint, public
enablement, merge, or production-readiness claim.

After several materially different attempts at the same blocker:

- preserve useful completed work;
- record concrete evidence;
- stop that blocked path;
- continue another independent safe task when one exists and is authorized.

Even for a human-only gate, stop only the dependent path. Pause the entire
Goal/automation only when no independent safe task remains, repository authority
explicitly requires that gate before any other work, or an actual conflict/risk
requires the Owner. Pending infrastructure evidence alone is not such a conflict.

Require user input before:

- destructive or irreversible production actions;
- changing locked product semantics;
- resolving contradictory source-of-truth requirements;
- using missing credentials or granting new external access;
- accepting material security risk;
- incurring payment or enabling a paid service.

## 8. Pull request and release policy

Production release remains governed by `WORKFLOW.md`, the Implementation Execution Protocol, the Product Source of Truth, and the relevant technical contracts.

Do not merge to `main` merely because local or CI checks pass.

Respect all required CI, Security, database, live-runtime, browser/manual, staging, migration, provider, and pre-production gates applicable to the changed surface.

## 9. Goal behavior

When a Codex Goal is active, continue choosing the next safe, highest-priority unfinished task only within the currently authorized execution model.

Continue until one of these is true:

- the Goal's evidence-based completion criteria are met;
- the available run/usage budget is reached;
- a real blocker requires the user;
- continuing would violate a locked decision, repository authority, or a safety rule.

A budget stop is a checkpoint, not completion.

## 10. Never trust chat memory over Git

Conversation context can explain intent, but it is not authoritative state.

If chat context and committed repository authority differ:

- trust the committed canonical repository;
- identify the mismatch;
- do not silently continue from stale chat assumptions.

Every fresh Codex worker should be able to reconstruct the project state from Git alone.

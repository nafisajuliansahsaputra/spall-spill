# Spall Spill — Codex Cloud Runbook

> Operational runbook only. This file does **not** define product behavior.
> Product authority remains in `docs/product-spec/PRODUCT-SOURCE-OF-TRUTH.md`,
> locked J1–J9 User Flows, and the relevant locked technical contracts.
> Execution authority remains in
> `docs/product-spec/IMPLEMENTATION-EXECUTION-PROTOCOL.md`.

## 1. Purpose

This runbook exists so a fresh Codex Cloud worker can reconstruct the intended
autonomous execution mode from Git without relying on a previous chat.

Authorized autonomous lane:

- repository: `nafisajuliansahsaputra/spall-spill`;
- branch: `codex/autopilot`;
- review surface: draft PR from `codex/autopilot` to `main`;
- production merge/deployment: human-controlled.

## 2. Environment bootstrap

The reusable Codex Cloud environment must be attached to this repository and
must use `codex/autopilot` as its implementation baseline.

Before publishing or trusting an environment, verify:

```bash
git remote -v
git status --short
git branch --show-current
git rev-parse HEAD
git log -5 --oneline
cat .nvmrc
node --version
pnpm --version
```

Expected repository baseline includes:

- `AGENTS.md`;
- `package.json`;
- `pnpm-lock.yaml`;
- `pnpm-workspace.yaml`;
- `apps/`;
- `packages/`;
- `supabase/`;
- `docs/product-spec/`.

Use the committed Node version and `pnpm@11.24.0`.

Install dependencies with the frozen lockfile:

```bash
pnpm install --frozen-lockfile
```

Do not add production credentials merely to make bootstrap pass.

## 3. Mandatory orientation before implementation

A fresh worker must read `AGENTS.md` first and then follow its mandatory
bootstrap.

At minimum it must reconcile:

1. Product Source of Truth;
2. Implementation Execution Protocol;
3. PRD;
4. architecture;
5. TODO/current checkpoint;
6. workflow;
7. skill/agent guidance;
8. user-flow index;
9. relevant J1–J9 flow;
10. relevant locked technical contract;
11. affected source/tests/migrations;
12. recent commits and current branch state.

Chat history is never repository authority.

## 4. First Cloud validation — read only

The first Cloud task must be read-only. It must not edit, commit, push, merge,
deploy, or mutate an external service.

Use this task:

```text
Perform a read-only repository orientation audit for Spall Spill.

Do not edit files.
Do not commit or push.
Do not mutate GitHub, Supabase, Vercel, Cloudflare, or any external service.

First verify repository identity, current branch, HEAD, status, remote tracking,
and recent commits. The expected implementation lane is codex/autopilot.

Read AGENTS.md and follow its Mandatory bootstrap before any material work.

Then report, grounded only in committed repository authority:

1. what Spall Spill is;
2. the authority hierarchy;
3. the active implementation checkpoint;
4. what is already CLOSED / VERIFIED;
5. what remains incomplete or unverified;
6. the highest-priority safe next work;
7. the J1–J9 journey(s) relevant to that next work;
8. the locked technical contract(s) relevant to it;
9. Working/Draft/Published boundaries that must not regress;
10. authentication/authorization/security boundaries involved;
11. required automated, database, browser/manual, provider, and remote CI evidence;
12. blockers that must remain open;
13. actions the autonomous lane is explicitly forbidden to perform.

If repository state contradicts chat context, trust Git and call out the mismatch.
If authority conflicts internally, report the exact conflict and do not propose
implementation as if it were resolved.
```

The orientation is accepted only if it identifies the project/checkpoint and
next work from Git correctly without inventing evidence.

## 5. First bounded implementation cycle

Only after the read-only orientation is accepted, use one bounded implementation
cycle.

The worker must:

1. refresh branch/HEAD/remote state;
2. reread changed authority since orientation;
3. choose one coherent highest-priority unblocked slice;
4. inspect affected source and tests before editing;
5. implement under the relevant locked contract;
6. run targeted verification while iterating;
7. run applicable workspace/database quality gates;
8. inspect the final diff;
9. update TODO/canonical checkpoint only for real changed evidence;
10. commit coherently;
11. push only to `codex/autopilot`;
12. verify GitHub CI, Security, and Autopilot Guard for the exact pushed commit;
13. leave a truthful checkpoint and next action.

A green CI result does not authorize claiming manual/browser/live-provider
evidence that was not actually observed.

## 6. Baseline quality commands

Use as applicable:

```bash
pnpm typecheck
pnpm lint
pnpm test:tooling
pnpm test
pnpm build
git diff --check
```

Database/security work additionally follows the committed CI/Supabase workflow.
Do not assume Docker/provider/browser capabilities exist in Codex Cloud until
they are actually verified.

## 7. Durable checkpoint requirements

Before a Cloud task ends:

- no deliberate broken durable checkpoint;
- coherent completed work committed;
- authorized commits pushed to `codex/autopilot`;
- real evidence recorded, fabricated evidence forbidden;
- blockers preserved honestly;
- next safe action identified.

If work is incomplete and unsafe to commit, do not disguise it as complete.

## 8. Human-only gates

Codex Cloud must request the Owner before:

- merging to `main`;
- production deployment/promotion;
- destructive or irreversible production data/storage operations;
- adding/broadening privileged production credentials;
- accepting material security risk;
- changing locked product semantics;
- enabling paid services or incurring new charges;
- overriding contradictory canonical authority.

## 9. Long-running Goal readiness gate

Do not enable unattended recurring continuation until all of these pass:

- reusable Cloud environment published and verified;
- read-only orientation audit accepted;
- one bounded implementation cycle successfully commits/pushes only to
  `codex/autopilot`;
- CI passes on the exact commit;
- Security passes on the exact commit;
- Autopilot Guard passes on the exact commit;
- no unexpected branch, permission, environment, or secret behavior occurred.

## 10. Mobile operating model

Once unattended mode is proven, the Owner may use ChatGPT/Codex on mobile to:

- inspect current work/checkpoints;
- change safe priority;
- pause/resume the Goal;
- ask for CI/blocker status;
- require a checkpoint;
- stop autonomous implementation.

Mobile instructions do not override locked repository authority unless the
corresponding product/technical decision is deliberately updated in Git.

## 11. Failure policy

Fail closed and ask for the Owner when:

- branch or HEAD is unexpected;
- authority is contradictory;
- required locked contract is missing;
- a task requires a human-only gate;
- credentials/access are missing;
- the same blocker persists after materially different attempts;
- the cloud environment cannot produce evidence required to close the slice.

Otherwise, preserve safe progress and continue another independent authorized
task when one exists.

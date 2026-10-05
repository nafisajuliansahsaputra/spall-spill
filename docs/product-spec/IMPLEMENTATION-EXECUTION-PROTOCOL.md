# SPALL SPILL — IMPLEMENTATION EXECUTION PROTOCOL

## Status

**LOCKED / MANDATORY CROSS-CHAT EXECUTION AUTHORITY**

This document governs how Spall Spill implementation work is executed.

Product behavior remains governed by:

1. `PRODUCT-SOURCE-OF-TRUTH.md`;
2. locked User Flows / product journeys;
3. the relevant locked technical contract.

Conversation memory never overrides repository authority.

---

## 1. Fresh Audit Before Work

At every implementation session start or resume, fresh-read and reconcile:

1. `PRODUCT-SOURCE-OF-TRUTH.md`;
2. this protocol;
3. relevant User Flow;
4. relevant technical contract;
5. actual branch and HEAD;
6. recent relevant commits;
7. affected source files.

If repository state contradicts conversation context, or branch/HEAD changes unexpectedly, stop and reconcile before writing.

---

## 2. Write Authority and Execution Modes

### 2.1 Default mode — Local-First

Unless an explicitly authorized repository-scoped execution mode below applies, the Owner performs source, documentation, configuration, database, Git, and deployment changes locally on Windows.

ChatGPT may inspect GitHub but must not directly create, update, delete, commit, push, rewrite history, or otherwise mutate remote repository state unless the Owner explicitly authorizes that specific remote operation in the current turn.

Default remote mutation is:

**DENY BY DEFAULT**

Generic continuation language such as `gas`, `lanjut`, `ok`, `jalan`, `terusin`, or `next` does not create remote-write authority.

Permission for one ad-hoc remote action does not authorize another.

### 2.2 Authorized Autonomous Codex Cloud Lane

The Owner has explicitly authorized one persistent autonomous development lane for this repository:

- repository: `nafisajuliansahsaputra/spall-spill`;
- branch: `codex/autopilot`;
- execution environment: Codex Cloud;
- purpose: continue implementation according to committed canonical project authority without requiring the Owner to remain online.

This committed section is the durable repository-scoped authorization for that lane. Codex does not require a new per-turn confirmation for ordinary non-destructive work that remains inside this scope.

Within `codex/autopilot`, Codex Cloud may autonomously:

- inspect and edit repository source, tests, migrations, and documentation;
- create coherent commits;
- push commits to `codex/autopilot`;
- update the existing draft pull request for that branch through normal pushes;
- run repository-defined local checks;
- rely on GitHub CI/Security evidence;
- update `TODO.md` and canonical checkpoint text only when real implementation/evidence has changed;
- continue to the next safe, unblocked task when the current coherent slice is complete.

This authorization does **not** permit Codex Cloud to:

- push directly to `main`;
- merge a pull request into `main`;
- force-push, rewrite history, delete meaningful branches, or discard unrelated work;
- deploy or promote production autonomously;
- perform destructive or irreversible production database/storage operations;
- weaken tests, authorization, validation, RLS/grants, security scans, or release gates to obtain a passing result;
- expose, commit, print, or copy secrets/credentials/private user data;
- create, rotate, or broaden privileged production credentials;
- enable a paid service, purchase credits, or incur new charges;
- change locked product semantics, locked User Flows, or locked technical decisions merely to unblock implementation;
- claim live-provider, browser/manual, staging, production, restore, or other external evidence that was not actually observed.

If a task requires one of those prohibited actions, Codex must checkpoint safe completed work and request the Owner.

### 2.3 Autonomous bootstrap and resume requirements

Before the first material edit in every fresh or resumed autonomous run, Codex must:

1. confirm repository identity, branch, HEAD, status, and remote tracking;
2. read `AGENTS.md`;
3. fresh-read the current authority required by Section 1;
4. read `PRD.md`, `ARCHITECTURE.md`, `TODO.md`, `WORKFLOW.md`, and `SKILL.md`;
5. identify the current canonical implementation checkpoint;
6. read the relevant J1–J9 User Flow, technical contract, and affected source/tests for the next slice;
7. inspect commits made since the previous autonomous checkpoint.

Chat/thread memory is context only and never overrides committed repository authority.

If the branch, HEAD, canonical checkpoint, or governing contract changed unexpectedly, Codex must reconcile before editing.

### 2.4 Autonomous checkpoint policy

Before an autonomous run ends because of usage budget, scheduler boundary, blocker, or completion:

- inspect the final diff;
- do not intentionally leave a broken half-implementation as the durable remote checkpoint;
- run the relevant verification that can reasonably complete in the current environment;
- commit only coherent completed work;
- push authorized commits to `codex/autopilot`;
- record real progress/evidence in the existing canonical tracking documents when appropriate;
- state remaining blockers and the next safe action truthfully.

If a partially implemented local change cannot safely be committed, leave it uncommitted only within the still-live cloud workspace and report that fact; never misrepresent it as durable progress.

### 2.5 Revocation and fallback

The Owner may revoke or pause the autonomous lane at any time.

Outside `codex/autopilot`, or if this autonomous authorization is removed/revoked, execution immediately falls back to the default Local-First / deny-by-default policy in Section 2.1.

---

## 3. JIT Technical Contract Gate

Before production code begins for a new checkpoint:

1. audit Source of Truth;
2. audit relevant User Flow;
3. inspect existing technical contracts;
4. inspect current implementation;
5. identify material unresolved technical decisions;
6. discuss them;
7. lock the just-in-time technical contract;
8. only then begin production code.

JIT contracts must not contradict locked product behavior.

---

## 4. Coding Delivery

Rules in every execution mode:

- inspect the actual file before editing it;
- preserve existing architecture and locked semantics;
- make the smallest authoritative change that completes the coherent slice;
- avoid unrelated refactors;
- keep one logical batch at a time;
- inspect the resulting diff before treating the edit as complete.

### 4.1 Local-First delivery

When the Owner is executing locally with ChatGPT guidance:

- created/full-replaced files use complete file content;
- provide one file per PowerShell block;
- never use one giant multi-file generator;
- wait for the Owner's exact execution output before assuming a command succeeded.

Canonical local replacement uses:

- `$path` for one file;
- one complete `$content` value;
- `[IO.File]::WriteAllText(...)`;
- UTF-8 without BOM;
- LF normalization.

### 4.2 Autonomous Codex Cloud delivery

When operating under Protocol §2.2 on `codex/autopilot`:

- Codex may edit repository files directly inside its cloud workspace;
- it must not require PowerShell-specific delivery mechanics;
- it may execute multiple commands/files as needed for one coherent slice;
- it must inspect source before modification and inspect the final diff before commit;
- command/test results must be observed directly before being recorded as evidence;
- cloud execution does not waive any product, security, testing, or documentation gate.

---

## 5. Security by Construction

Security-sensitive implementation must use applicable:

- deny-by-default authorization;
- server-derived authenticated Owner identity;
- no client-controlled ownership authority;
- least privilege;
- private/internal schema isolation;
- strict validation;
- safe protocol/URL handling;
- concurrency protection;
- stale-write rejection;
- idempotency where required;
- Working-versus-Published isolation;
- server-only secrets;
- privacy-aware logging;
- allow and deny automated tests.

Authentication is not authorization.

---

## 6. Targeted Runtime Security Verification

A security-sensitive slice is not closed merely because automated tests pass.

Verify applicable runtime boundaries such as:

- unauthenticated denial;
- cross-Owner BOLA / IDOR denial;
- arbitrary Owner-ID rejection;
- stale-write behavior;
- two-tab concurrency;
- retry/idempotency;
- failure paths;
- private-state isolation;
- Working-versus-Published isolation;
- SSRF/upload/redirect boundaries when relevant.

Testing is limited to Spall Spill environments owned or explicitly authorized for testing.

---

## 7. Full Security Assessment

Do not perform a full penetration test after every implementation slice.

Perform a structured full security assessment once the MVP attack surface is sufficiently stable.

Applicable coverage includes:

- authentication/session;
- authorization/BOLA/IDOR;
- CSRF;
- injection;
- XSS;
- SSRF;
- upload abuse;
- rate limiting;
- business-logic abuse;
- privilege escalation;
- information leakage;
- dependency exposure;
- security headers.

Findings require evidence, severity, remediation, and retest.

---

## 8. Pre-Production Security Gate

Before public launch, perform security/regression verification in a production-like staging environment.

Verify applicable:

- authentication/authorization;
- rate limiting;
- headers;
- observability;
- rollback;
- recovery;
- backup/restore;
- secrets;
- deployment reproducibility;
- release readiness.

Production is not used for destructive experimentation.

---

## 9. Required Execution Evidence

Application checkpoints use applicable:

- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`

Database/security changes additionally use applicable:

- `supabase db reset --local`
- `supabase db lint --local`
- `supabase test db --local`

Before staging:

- `git diff --check`

Automated success does not replace required runtime verification.

---

## 10. Staging Gate

Stage only intended checkpoint files.

After staging inspect:

- `git diff --cached --check`
- `git diff --cached --stat`
- `git diff --cached --name-status`
- `git status -sb`

Inspect `git diff --cached` when needed.

Do not commit unintended files.

---

## 11. Commit / Push Sequence

Normal sequence:

1. implementation;
2. focused automated verification;
3. targeted runtime/security verification where available and required;
4. clean regression;
5. stage intended files;
6. staged diff review;
7. commit;
8. push;
9. remote CI/Security verification.

In default Local-First mode, the Owner performs normal commit/push locally unless explicit remote-write permission is given.

In the authorized Codex Cloud lane, Codex may perform steps 5–9 autonomously on `codex/autopilot` only, subject to Protocol §2.2. A cloud run must not fabricate runtime/manual/live evidence that the cloud environment cannot actually observe.

---

## 12. Remote CI / Security

Verify the actual pushed commit.

Required applicable jobs must not be pending, cancelled without replacement evidence, failing, or running against another commit.

Remote CI supplements local/runtime evidence; it does not replace it.

---

## 13. Documentation Closure

Documentation closure happens last:

1. implementation complete;
2. automated evidence complete;
3. runtime/security evidence complete;
4. staged review complete;
5. commit/push complete;
6. remote CI/Security complete;
7. canonical docs updated;
8. committed docs read back;
9. only then declare closure.

Source of Truth must never claim evidence that does not exist.

---

## 14. Readback Verification

Canonical documentation follows:

`fresh read -> authorized edit -> review -> commit/push -> fresh readback`

The authorized edit may occur locally or inside the bounded Codex Cloud lane.

Do not declare documentation canonical until the committed version has been read back.

---

## 15. Execution-Environment / Security-Lab Boundary

### Local development

- Windows remains the primary Owner-controlled local development host.
- Windows may handle source, Git, Next.js, Supabase/Docker, migrations, tests, and builds.
- Kali may be used as a dedicated browser/security client.
- Prefer isolated host-only networking for the local security lab.
- Expose only required web/Auth/API surfaces.
- Do not expose PostgreSQL directly for ordinary browser testing.
- Server secrets remain server-side.
- Burp/ZAP scope stays restricted to authorized Spall Spill targets.

### Codex Cloud

- Codex Cloud is an authorized development executor only for `codex/autopilot`.
- Cloud tasks use repository-defined toolchain and tests where supported by the environment.
- Cloud execution must not be treated as proof of local Windows/Kali manual evidence.
- Provider/live/manual gates that require credentials, browser interaction, special networking, or the Owner's local security lab remain open until genuinely verified.
- Production secrets are not added merely to make autonomous execution convenient.

---

## 16. Stop Conditions

Stop before further writes when:

- branch/HEAD changes unexpectedly;
- canonical authority contradicts implementation;
- required technical contract is missing;
- material decisions remain unresolved;
- test/runtime evidence contradicts an invariant;
- scope broadens unexpectedly;
- local state contains unexpected changes;
- remote mutation is needed outside the explicit authority of Protocol §2.2 or another current explicit Owner authorization.

Default rule:

**fail closed, preserve evidence, reconcile, then continue.**

---

## 17. Checkpoint Status

### NOT STARTED

No checkpoint implementation has begun.

### IN PROGRESS

Implementation or verification is underway.

### IMPLEMENTED / UNVERIFIED

Code exists but required evidence is incomplete.

### VERIFIED CANDIDATE

Implementation evidence is complete but canonical documentation closure/readback is incomplete.

### CLOSED / VERIFIED

Allowed only when:

- locked contract is satisfied;
- required automated evidence passes;
- applicable runtime/manual security verification passes;
- staged scope was reviewed;
- commit/push evidence exists;
- required remote CI/Security passes;
- canonical documentation records real evidence;
- committed documentation has been read back.

---

## 18. Permanent Principle

> Build and verify in the currently authorized execution environment first. Read authority before writing implementation. Lock material decisions before coding. Verify success and failure truth. Review staged scope before commit. Treat security as continuous engineering. Close checkpoints only from evidence.
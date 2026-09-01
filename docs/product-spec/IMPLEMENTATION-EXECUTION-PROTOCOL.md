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

## 2. Local-First Write Authority

The Owner performs source, documentation, configuration, database, Git, and deployment changes locally on Windows.

ChatGPT may inspect GitHub but must not directly create, update, delete, commit, push, rewrite history, or otherwise mutate remote repository state unless the Owner explicitly authorizes that specific remote operation in the current turn.

Remote mutation is:

**DENY BY DEFAULT**

These do NOT authorize remote writes:

- `gas`
- `lanjut`
- `ok`
- `jalan`
- `terusin`
- `next`

Remote authorization must explicitly name the intended write, for example:

- `edit file X langsung di GitHub`
- `commit dan push perubahan ini`
- `force reset branch X ke commit Y`

Permission for one remote action does not authorize another.

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

## 4. Local Coding Delivery

Default rules:

- inspect the actual file first;
- preserve existing architecture;
- make the smallest authoritative change;
- avoid unrelated refactors;
- created/full-replaced files use complete file content;
- provide one file per PowerShell block;
- never use one giant multi-file generator;
- one logical batch at a time;
- wait for the Owner's exact output before continuing.

Canonical local replacement uses:

- `$path` for one file;
- one complete `$content` value;
- `[IO.File]::WriteAllText(...)`;
- UTF-8 without BOM;
- LF normalization.

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

## 9. Required Local Evidence

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
3. targeted runtime/security verification;
4. clean regression;
5. stage intended files;
6. staged diff review;
7. commit;
8. push;
9. remote CI/Security verification.

The Owner performs normal commit/push locally unless explicit remote-write permission is given.

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

`fresh read -> local edit -> review -> commit/push -> fresh readback`

Do not declare documentation canonical until the committed version has been read back.

---

## 15. Windows / Kali Boundary

- Windows = primary development host.
- Windows handles source, Git, Next.js, Supabase/Docker, migrations, tests, and builds.
- Kali = dedicated browser/security client.
- Prefer isolated host-only networking.
- Expose only required web/Auth/API surfaces.
- Do not expose PostgreSQL directly for ordinary browser testing.
- Server secrets remain on Windows/server side.
- Burp/ZAP scope stays restricted to authorized Spall Spill targets.

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
- remote mutation is needed without explicit permission.

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

> Build locally first. Read authority before writing implementation. Lock material decisions before coding. Verify success and failure truth. Review staged scope before commit. Treat security as continuous engineering. Close checkpoints only from evidence.
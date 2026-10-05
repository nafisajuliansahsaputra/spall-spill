# Spall Spill — WORKFLOW

**Purpose:** standard workflow from task selection to production release.  
**Default collaboration model:** owner executes locally while ChatGPT acts as technical lead / pair programmer / reviewer. A separately authorized Codex Cloud autonomous lane may operate only on `codex/autopilot` under the locked Implementation Execution Protocol; all other direct repository or service mutation remains deny-by-default unless explicitly authorized.

## 1. Workflow principles

- Canonical product truth comes before code.
- Work in dependency order.
- Prefer small, verifiable vertical slices.
- Do not rebuild legacy implementation by habit.
- Do not merge a feature merely because the visible UI works.
- Security, authorization, migration reproducibility, and negative tests are release requirements.
- Documentation changes should reflect real decisions, not create parallel competing truth.

## 2. Task intake

For every task:

1. identify the user-visible or technical goal;
2. map it to TODO.md;
3. identify the affected J1–J9 journey, route, domain, and trust boundary;
4. read the relevant canonical product records;
5. identify acceptance criteria before editing code.

If the task conflicts with a locked decision, stop the conflicting implementation path and resolve the decision explicitly.

## 3. Branching

Unless the owner explicitly requests direct main work, use a focused branch.

For the persistent Codex Cloud autonomous mode, the only authorized long-lived working branch is `codex/autopilot`. Autonomous work must not push or merge directly to `main`. The draft PR from `codex/autopilot` to `main` is a review/CI surface, not automatic merge authority.

Recommended naming:

- feat/auth-email-password
- feat/identity-working-publish
- feat/spill-reference-lookup
- fix/stale-write-ordering
- security/ssrf-provider-fetch
- perf/public-spill-cache
- test/rls-owner-isolation
- docs/execution-baseline

Keep unrelated changes out of the branch.

## 4. Before coding

Run/read the current baseline:

- dependency install state;
- git status;
- relevant tests;
- typecheck;
- lint;
- production build if the baseline is uncertain;
- local Supabase state/migrations when DB work is involved.

Confirm:
- exact current failure or missing capability;
- expected behavior;
- authoritative data source;
- authorization actor;
- public/private state impact;
- error behavior.

## 5. Implementation order inside a feature

Use this order where applicable:

1. domain contract / types;
2. runtime validation;
3. database migration / constraints / grants / RLS;
4. repository/data access;
5. server authorization;
6. application/domain service;
7. idempotency / concurrency;
8. Audit/outbox if needed;
9. route handler or server action;
10. UI state;
11. analytics instrumentation;
12. automated tests;
13. documentation / TODO update.

Do not start with a large UI mock and retrofit security/data semantics later for protected features.

## 6. Database workflow

For every schema/data change:

1. create a versioned migration;
2. review forward migration safety;
3. add/update constraints and indexes;
4. add/update grants/RLS;
5. add allow tests;
6. add deny tests;
7. reset a fresh local database;
8. run migration/test suite from clean state;
9. never depend on a manual production dashboard edit that is absent from Git.

For destructive migrations:
- define compatibility/migration strategy;
- define rollback or forward-fix strategy;
- protect production data.

## 7. Auth / authorization workflow

For every protected read/write:

1. authenticate principal;
2. resolve application Owner/operator context server-side;
3. authorize requested action against trusted context;
4. scope DB access;
5. rely on tested RLS/grants as defense in depth;
6. map denied access to safe outward errors;
7. log/audit only what is appropriate.

Test:
- anonymous;
- correct owner;
- wrong owner;
- missing capability;
- stale/expired/fresh-auth boundary where applicable.

## 8. Working / Published workflow

When implementing an editor:

1. load authoritative Working state;
2. maintain explicit local dirty/saving/saved/error state;
3. save with baseRevision;
4. server verifies revision;
5. reject STALE_WRITE rather than overwrite;
6. UI reconciles authoritative response;
7. public state remains unchanged.

When publishing:

1. user explicitly requests publish;
2. authorize;
3. verify expected Working revision;
4. validate publication requirements;
5. verify moderation/account eligibility;
6. build public-safe projection;
7. commit projection + metadata;
8. write Audit/outbox as required;
9. return authoritative published result;
10. update UI based on server result.

## 9. External dependency workflow

For R2, Resend, marketplace metadata, or another external provider:

- isolate behind an adapter;
- validate request/response boundaries;
- set timeouts;
- make retries safe;
- avoid provider payload becoming domain truth;
- do not expose privileged credentials;
- handle dependency failure with typed errors;
- use outbox/queue when external work must follow authoritative DB mutation.

For metadata fetch:
- apply SSRF protections before network access;
- revalidate redirect destinations;
- cap redirects, bytes, and duration.

## 10. Test workflow

### Fast loop
During implementation:
- targeted unit test;
- targeted integration/database test;
- targeted component test when useful.

### Pre-commit
Run relevant:
- format check;
- lint;
- typecheck;
- unit tests;
- DB tests;
- production build for structural changes.

### Pre-merge
Run:
- full required CI suite;
- database reset/migration validation;
- security scans;
- critical Playwright flows affected by the change.

### Pre-production
Run:
- staging/release verification;
- critical J1–J9 smoke/E2E;
- authorization denial checks;
- observability check;
- rollback readiness;
- migration safety check.

## 11. Commit workflow

Before commit:
- git diff review;
- remove debug logs;
- remove dead code;
- ensure no secret or local credential;
- ensure generated artifacts are intentional;
- update tests;
- update TODO.

Commit messages should state the real change, for example:

- feat: add revision-safe identity working saves
- security: block private targets in metadata fetcher
- test: cover cross-owner spill access denial
- docs: add execution baseline documents

Avoid vague messages such as update, changes, fix stuff, or final.

## 12. Pull request workflow

A PR should explain:
- problem/goal;
- product/spec authority;
- implementation summary;
- data/migration impact;
- security impact;
- test evidence;
- screenshots only when visual changes benefit from them;
- rollout/rollback notes when relevant;
- remaining follow-up.

Review specifically for:
- product drift;
- authorization holes;
- Working/Published leakage;
- incorrect identifier semantics;
- concurrency/idempotency flaws;
- unsafe URLs/files;
- missing negative tests;
- accidental public secrets;
- avoidable performance regressions.

## 13. CI merge gate

Do not merge when a required gate fails.

Expected gates, as applicable:
- frozen install;
- format;
- lint;
- typecheck;
- unit;
- migration/reset;
- DB/RLS allow + deny tests;
- integration;
- Semgrep;
- Gitleaks;
- dependency vulnerability scan;
- production build;
- Playwright critical E2E.

Security-critical dependency/runtime findings are blocking unless explicitly risk-managed.

## 14. Deployment workflow

### Preview
Used for branch/PR verification.

Check:
- route rendering;
- environment isolation;
- auth callback behavior;
- server actions/API;
- no production secret leakage.

### Staging / release verification
Used for near-production validation.

Check:
- migrations;
- auth;
- publication;
- public discovery;
- media;
- queues;
- email;
- observability;
- critical E2E.

### Production
Before deployment:
- main is green;
- migration plan reviewed;
- backup/rollback posture confirmed for risky changes;
- secrets/config verified;
- release notes understood.

After deployment:
- health/readiness;
- public landing/profile/spill smoke;
- auth smoke;
- critical owner mutation;
- exact reference;
- logs/traces/errors;
- queue health;
- no unexpected error spike.

## 15. Migration workflow

Database migrations are forward-only operational artifacts unless a deliberate rollback migration is designed.

For risky schema changes:
1. expand compatibly;
2. deploy code that supports both states if needed;
3. backfill;
4. verify;
5. switch reads/writes;
6. remove old state only after safe observation.

Never couple a high-risk destructive DB migration with an unrelated large UI release.

## 16. Incident workflow

If production is unhealthy:

1. identify user impact;
2. stop further rollout;
3. use protected kill switch where appropriate;
4. rollback application when safe;
5. protect data integrity before preserving cosmetic availability;
6. inspect correlated logs/traces;
7. verify queues and external dependency state;
8. restore from backup only under a deliberate recovery plan;
9. rotate secrets if exposure is plausible;
10. document root cause and prevention action.

Do not mark an incident resolved only because the page loads again.

## 17. Documentation workflow

Update canonical product docs only when product truth changes.

Update ARCHITECTURE.md when the implementation architecture contract changes.

Update PRD.md when the implementation-facing product summary changes due to an agreed product decision.

Update TODO.md continuously as execution state changes.

Update SKILL.md or WORKFLOW.md when contributor/agent operating rules change.

After a material documentation update:
- read the committed file back;
- verify links/references;
- verify no contradiction with higher authority.

## 18. ChatGPT collaboration workflow

When the owner asks ChatGPT to continue implementation:

1. inspect current repo state/branch/commit;
2. read relevant .md authority files;
3. inspect the actual code before proposing edits;
4. report current progress and remaining stage;
5. implement the smallest complete next slice;
6. run/inspect available checks;
7. summarize exact files/behavior changed;
8. state remaining blockers honestly.

Do not:
- invent repo state;
- assume a previous chat reflects the current commit;
- claim tests passed without evidence;
- repeat questions already answered by current context/repo;
- make direct GitHub/Supabase/Vercel changes unless explicitly requested.

## 19. Definition of production ready

Production ready means:
- J1–J9 critical behavior works;
- authorization and RLS/grant denial tests pass;
- no Working/private leakage;
- concurrency/idempotency rules are enforced;
- production build and CI are green;
- security scans are resolved;
- observability is active;
- backup restore has been tested;
- rollback procedure exists and has been verified;
- production smoke verification passes;
- no known critical bug requires immediate post-launch manual repair.

The goal is a system that can be installed, configured, deployed, and operated without needing routine emergency patching just to function.

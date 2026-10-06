# Spall Spill — TODO

**Status:** Execution backlog  
**Rule:** work top-to-bottom unless a dependency or blocking defect requires a deliberate exception.  
**Last synchronized:** 2026-10-06

## Autonomous Codex Cloud lane — 2026-10-05

This is an execution-mode checkpoint, not new product authority. Product behavior
continues to come from the canonical Product Source of Truth, locked User Flows,
and relevant locked technical contracts.

### Temporary infrastructure evidence policy — 2026-10-06

- Owner clarified that queued/unassigned hosted runners, empty pre-runner steps,
  superseded concurrency cancellation and transient infrastructure delays leave
  evidence PENDING rather than requiring Owner intervention. AGENTS, Protocol
  §2.4 and Runbook §11 now preserve independent dependency-safe continuation.
- Current-thread hourly automation resumed with this policy. No product semantics,
  publication grants, CI configuration or security gates changed.
- At `8ddc355e9720367147f7c02005deedbd5f55793d`, push-event Application/Database
  CI (37364270734), Dependency Scan (37364489331) and Guard (37364270721) passed.
  SAST/Secret Scan were cancelled before producing logs even after rerun; their
  evidence remains PENDING, not a source regression or proven billing/access issue.
  Later pushes must use their exact latest SHA as the evidence target.
- Independent next Product work remains staged detail confirmation and exact
  Published safety-click transport under a new bounded JIT contract. Do not
  enable public readers/first Publish or claim S5/S6 closure before all required
  automated, browser/runtime and provider gates are evidenced.
- Documentation-only policy verification: typecheck, lint, tooling tests, unit
  tests, production build and diff checks passed (Turbo results reused existing
  unchanged-source cache where applicable). No migration/database behavior
  changed. Latest-push remote gates remain PENDING until actually observed.

- [x] Create `codex/autopilot` from the latest preserved implementation branch.
- [x] Add root `AGENTS.md` with mandatory repository bootstrap, authority
  hierarchy, resume rules, safety boundaries, verification rules, and checkpoint policy.
- [x] Authorize the bounded autonomous lane in the locked Implementation
  Execution Protocol and reconcile Product Source of Truth, WORKFLOW, SKILL,
  README, and AGENTS guidance.
- [x] Create draft PR #3 as the persistent review/CI surface from
  `codex/autopilot` to `main`; no automatic merge authority is implied.
- [x] Add a machine-enforced Autopilot Guard workflow for branch scope,
  mandatory authority files, autonomous authorization markers, tracked secret
  environment files, and the expected repository/toolchain baseline.
- [x] Add `docs/operations/CODEX-CLOUD-RUNBOOK.md` with reproducible
  environment, read-only orientation, bounded-cycle, checkpoint, failure, and
  human-only-gate instructions.
- [x] Verify integrated autonomous baseline `d515636`: CI Application +
  Database passed in run 37272077522; Security Secret Scan + SAST + Dependency
  Scan passed in run 37272077487; Autopilot Guard passed in run 37272077479.
  Duplicate heavy PR-event CI/Security jobs are intentionally skipped for
  `codex/autopilot`; full push-event gates remain required.
- [ ] Publish and validate the reusable Codex Cloud environment against
  `codex/autopilot`.
- [x] Run the first read-only Codex Cloud orientation audit and confirm it
  reconstructs product purpose, current checkpoint, completed evidence,
  remaining work, relevant J1–J9 flow/contracts, blockers, and next safe task
  from committed Git authority without relying on chat memory. Verified in a
  Cloud synthetic `work` task after explicit synchronization to
  `origin/codex/autopilot`; local and remote HEAD matched, the working tree was
  clean, Node 24.19.0 / pnpm 11.24.0 dependency preparation passed, and the
  orientation correctly identified O01-S4 as the last fully CLOSED / VERIFIED
  checkpoint and O01-S6 first-publication/public-transport as the active frontier.
- [x] Run one bounded implementation cycle in Codex Cloud, verify commit/push
  lands only on `codex/autopilot`, and verify CI/Security/Guard on exact
  implementation commit `11e515da32fb2cead2e24fd380d068ceb36a6f80` (runs below).
  This proves the bounded Git/CI lane, not unattended readiness or S5/S6 closure.
- [ ] Configure the long-running Goal / recurring Cloud continuation only after
  the environment and bounded cycle above are proven healthy.
- [ ] Verify mobile monitoring/steering and one laptop-off continuation cycle
  before treating unattended operation as ready.

## Current canonical implementation frontier — 2026-10-06

This section is the current task-selection bridge to the canonical Product Source
of Truth. It supersedes older "Immediate work", "Immediate next task", and
"Next onboarding batch" snapshots later in this file.

**Integrated implementation baseline:** `8d6f8c12c7161aace642342211e7f7d66867032f`

**Last fully CLOSED / VERIFIED checkpoint:** O01-S4.

**Active implementation frontier:** O01-S6 Preview & Publish /
first-publication and public transport. S5/S6 are not yet CLOSED / VERIFIED.

Already present and governed by locked contracts:

- 12.12 S5 Relevant First Job foundation;
- 12.13 immutable private Item/reference foundation;
- 12.14 Resource Draft;
- 12.15 private S6 Preview;
- 12.16 preview receipt;
- 12.17 scoped account-status/session exit;
- 12.18 staged atomic first publication;
- 12.19 staged published-only Identity/Resource reads;
- 12.20 private Product primary-image / ordered marketplace preparation;
- 12.21 staged Published Identity image delivery;
- 12.22 private Product preparation/image/destination/safety preview and receipt binding;
- 12.23 staged exact Published Product image transport;
- 12.24 staged Product detail projection with current per-destination availability;
- 12.25 staged unmounted Product visual/context confirmation renderer;
- 12.26 staged exact Published destination resolution with all execution withheld;
- 12.27 staged opaque one-use Product click-intent core with injectable storage.

Do **not** rebuild the scaffold, S5 foundation, Resource Draft, private Preview,
preview receipt, first-publication transaction foundation, or published-reader
foundation merely because historical inventories below still contain unchecked
items.

Current safe work must be selected from the remaining dependency frontier:

- [x] Lock and implement private Product primary-image / ordered marketplace
  preparation under 12.20; existing saved Draft only, current Owner, independent
  revision, finalized same-Owner media, creator attribution retained.
- [ ] Complete Product publication preparation: public media/Product projection
  and exact preparation/image/destination/safety binding into first Publish.
  Private entry and review alone do not make Product publish-ready.
- [x] Bind private Product preparation/image/ordered destination/safety state into
  the S6 preview and receipt digest under 12.22, retaining publication-pending status.
- [ ] Safe public routes and external click transport.
- [x] Implement staged Published Identity image transport under 12.21 with
  server-only selection, bounded download and post-download visibility recheck.
- [x] Bind staged Product image transport to exact Published Owner/reference/type
  and snapshot under 12.23; no newer private fallback or outbound authority.
- [x] Implement staged Product detail projection under 12.24 with exact Published
  context, ordered current destination availability and no private fields.
- [x] Implement the staged Product visual/context confirmation region under 12.25
  without public route assembly, data fetching or marketplace actions.
- [x] Stage exact Published provider/URL-hash destination resolution under 12.26;
  browser context-intent authority and outbound transport remain unfinished.
- [x] Stage server-only opaque one-use intent core under 12.27; durable store,
  exact Published issuance provenance and route/browser assembly remain unfinished.
- [ ] Verify live R2 delivery/revocation and production cache/abuse gates before
  enabling media publication/public readers.
- [ ] Explicit first-Publish UI/bundle wiring after required safety/transport gates.
- [ ] Universal D01 workspace handoff.
- [ ] Enable currently withheld public/RPC execution only when its locked
  safety/transport prerequisites are satisfied.
- [ ] Complete required S5/S6 browser/journey verification.
- [ ] Complete deferred live Web Risk/Gemini verification only when the external
  provider/account blocker is genuinely resolved.

Before implementing a new bounded checkpoint, follow the JIT contract gate in
the Implementation Execution Protocol. Pick the highest-priority dependency-safe
item after fresh-reading the relevant O01/J1–J4 authority and affected code.

### Bounded Cloud Product preparation cycle — 2026-10-05

- Clean synthetic `work` synchronized to authorized remote baseline
  `1eb823e33ba11217e4eaf53337855806d990bc5c` before orientation or implementation.
- Read pinned historical Product/destination/D04/creation-threshold authority;
  locked 12.20 before coding. No journey topology or Published semantics changed.
- Added private preparation persistence/resolver/save and focused S5 manual
  sanitized image upload plus ordered structured destination entry. Preparation
  retains Product identity/reference and creates no publication or completion.
- Targeted action/provider/form tests passed; full typecheck, lint, five tooling
  tests, 585 Vitest tests, 17 auth navigation tests and all three production builds
  passed in Cloud (607 application/tooling tests total).
- Local Supabase PostgreSQL image extraction exceeded the managed `vfs` Docker
  filesystem capacity; retries stopped. Local reset/lint/pgTAP/concurrency are
  unobserved locally. GitHub Database supplied fresh migration reset, schema lint,
  1,164 pgTAP assertions across 21 files (67 new preparation assertions), and six
  real concurrency tests, including parallel first/existing preparation saves.
  Lint had no errors; log review found two new implicit empty-array initializer
  warnings. Explicit typed arrays remove those warnings in the evidence follow-up.
  Existing preview/public-reader warnings are outside this bounded slice.
- Implementation commit `11e515da32fb2cead2e24fd380d068ceb36a6f80` was pushed
  explicitly as `HEAD:codex/autopilot` after refetching and confirming the remote
  had not advanced. Exact-commit evidence: [CI Application + Database
  37280505809](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37280505809),
  [Security Secret Scan + SAST + Dependency Scan
  37280505869](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37280505869),
  and [Autopilot Guard 37280505805](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37280505805)
  all passed. Final follow-up `ce6b45c0dc674366c2b38cda5e909bc0c581aa9a` also
  passed exact-commit CI 37280925633, Security 37280925615 and Guard 37280925596;
  the two new initializer warnings were absent. Results were observed separately.
- Browser/runtime upload/CORS, manual authorization/stale-save/failure truth,
  live R2 and Web Risk/Gemini provider evidence remain open. S5/S6 are not closed;
  public/RPC grants remain withheld. Provider account/billing and Cloud-local
  database capacity are current evidence blockers; no production credentials used.
- Next dependency-safe task: lock and implement public-safe media transport for
  existing canonical Identity/Product assets, before binding Product preparation
  into preview/receipt/publication. Do not activate publication grants yet.

### Additional autonomous cycle — Published Identity media — 2026-10-05

- Fresh clean Cloud `work` synchronized to `ce6b45c` before material work.
  The Owner explicitly authorized additional autonomous cycles; no unattended
  environment/provider readiness or production release approval is inferred.
- Locked 12.21 before implementation after rereading current authority, relevant
  J1–J4/J6/J9 rules, pinned FR-IDN/P01 and existing storage/publication contracts.
- Implemented service-only Published image resolver and technical HTTP transport;
  private table privileges and existing publication/public-reader grants remain
  withheld. Product media/publication preparation remains a separate dependency.
- Targeted media/HTTP/proxy tests: 34 passed. Full typecheck, lint, five tooling
  tests, 619 Vitest tests, 17 auth navigation tests (641 total) and three builds
  passed in Cloud. Production-server HTTP observation returned matching generic
  404 bodies for unavailable and invalid Handle locators, with no-store/nosniff/
  same-origin headers and no login requirement. This is denial-path evidence only.
- Added 37 pgTAP assertions for aliases, Published/Working isolation, visibility,
  finalized same-Owner assets, private privileges and retained withheld grants.
  CI now also runs error-level security advisors. Exact commit `167df3a2d4f01a6e2d6c1f09ce500cf7e8c4711a`
  passed Application/Database CI (37318466602), all three Security jobs
  (37318466588) and Autopilot Guard (37318466772). Database reset/lint/advisors,
  22 pgTAP files / 1,201 assertions and six concurrency tests passed remotely.
  Local Docker image extraction remains capacity-blocked.
- Live R2 success/revocation, browser delivery, production cache/invalidation,
  edge abuse/load and missing provider credentials remain open. S5/S6 not closed.
- The private preview/receipt dependency is implemented in the following cycle.

### Additional autonomous cycle — Private Product S6 review — 2026-10-05

- Fresh clean Cloud `work` synchronized to `167df3a` before material work.
  Locked 12.22 after reconciling O01-S6, J2/J4/J6/J9, pinned Product semantics,
  preview/receipt/publication contracts and existing preparation persistence.
- Current-Owner preview now includes exact selected image, independent preparation
  revision, ordered attribution-preserving destinations and per-source safety
  revision/expiry in its UTC digest. Changed preparation invalidates old review.
  Private rendering uses trusted image signing and escaped destination text;
  unavailable images retain selection. No external outbound links are activated.
- Product publication remains pending. No existing withheld publication/public
  reader grants, journey topology, Working/Draft/Published semantics or reference
  allocation changed. First Publish still rejects Product bundles.
- Targeted tests: 54 passed. Full typecheck, lint, five tooling tests, 630 Vitest
  tests, 17 auth navigation tests (652 total), three builds and diff checks passed.
  Added 52 pgTAP assertions and an isolated preparation-save/confirmation race.
  Exact commit `c65cbba758e64c36b98cb572c6c5edf85a38c9fe` passed Application/Database
  CI (37320066050), all three Security jobs (37320066244) and Autopilot Guard
  (37320066126). Database reset/lint/error-level security advisors, 23 pgTAP
  files / 1,253 assertions and seven concurrency tests passed remotely.
  Local Docker capacity limitation remains.
- No browser/live provider evidence is claimed. S5/S6 remain not closed.
- Next dependency-safe task: lock and stage exact Published Product projection
  and image binding, retaining withheld public/publication grants until all
  transport and safety gates are evidenced.

### Autonomous continuation — Published Product media — 2026-10-05

- Clean Cloud `work` refreshed and synchronized to `5f69c16` before orientation.
  Current environment observations confirm running/connected revision 26 with
  enforced package-manager network policy, no runtime credentials or identities.
- Reread current canonical frontier, J2/J4/J6/J9, pinned FR-PRD/P03 and relevant
  publication/media contracts. Locked 12.23 before source implementation.
- Added service-only Product descriptor keyed only by public Handle/reference,
  exact Published Product/Identity visibility and finalized same-Owner asset.
  Snapshot title/preparation revision/image/structured destinations are required;
  newer private preparation never fills a missing Published field. Product and
  Identity publication tokens are rechecked after bounded canonical download.
- Added technical Product image HTTP route with uniform unavailable, no viewer
  session refresh and conservative no-store headers. Shared existing bounded
  streaming/framing validation with Identity, preserving its regression tests.
  This image boundary authorizes no marketplace redirect or safety verdict;
  runtime destination degradation does not silently change Product lifecycle.
- Targeted tests: 82 passed. Full typecheck/lint/tooling/test/build passed with
  678 Vitest + 17 auth navigation + five tooling tests (700 total), three builds
  and clean diff checks. Production-server HTTP probes returned identical generic
  404 unavailable for unknown Owner and invalid reference, with no login, no-store,
  nosniff and same-origin headers. This observes denial only, not live R2 success.
- Added 61 pgTAP assertions. Exact commit `363de7469ba6ea16a094be12b5bd06ef71c7fd99`
  passed Application/Database CI (37325548751), all three Security jobs
  (37325548508) and Autopilot Guard (37325548510), including database reset/lint/
  advisors, 24 pgTAP files / 1,314 assertions and seven concurrency tests.
  Local database Docker capacity limitation remains.
- Product Publish remains preparation-pending; existing publication/public-reader
  grants remain withheld. No production/provider/browser evidence or S5/S6
  closure is inferred. Product projection is implemented in the following slice;
  renderer/click transport and fresh locked publication integration remain open.

### Autonomous continuation — Published Product projection — 2026-10-05

- Refreshed clean `work` to verified `363de74` before selecting the next slice.
  Reread changed canonical status and 12.23; reconfirmed pinned P03 partial/all
  destination degradation and J2/J4/J6/J9 before locking 12.24.
- Added withheld public-locator Product DTO resolver bound to exact Published
  Product/Identity token, selected same-Owner canonical image and existing reference.
  It exposes only Published recognition context and ordered destination context;
  exact creator URLs are present only for fresh safe URL/hash matches.
- Partial degradation retains safe alternatives. All unavailable destinations
  retain Product context while masking every URL; no lifecycle/snapshot mutation,
  private fallback, new reference, publication intent or outbound permission.
  Added strict application DTO validation and 53 pgTAP assertions.
- Existing/new public-reader and first-Publish grants remain withheld. No public
  page/CTA or Product writer is enabled. Targeted tests: 68 passed; full typecheck,
  lint, tooling, 701 Vitest + 17 auth navigation + five tooling tests (723 total),
  three builds and diff checks passed. Exact commit
  `4babc5ecab499be57e397b5480d3fbbe6e748f43` passed push-event Application and
  Database CI (37362911336), all three Security jobs (37362911320), and Autopilot
  Guard (37362911347). Database reset, lint, error-level security advisors,
  1,367 pgTAP assertions across 25 files and seven concurrency tests passed.
  Provider/browser/production gates and S5/S6 closure remain open.
- Initial remote Database CI reached a fixture schema-usage denial before the
  anonymous allow-path query. Added `USAGE api` only inside the rolled-back test
  transaction, matching existing public-reader test isolation; production grants
  remain unchanged. Review/blocked fixtures also retain mandatory reason codes,
  cleared on recovery. The exact-commit successful rerun above verifies both fixes.
- Next dependency-safe task: lock and implement staged Product detail confirmation
  and exact Published safety-click transport before enabling public reader routes
  or first Publish. Retain the pending/public grant gates until required evidence.

### Autonomous continuation — staged Product confirmation — 2026-10-06

- Clean `work` refreshed to `700d3eb610977886e599d8677ff0b3381986bf6c` before
  authority/source readback. Pending hosted-runner evidence did not stop this
  independent presentation slice under the amended Protocol §2.4.
- Reread J2/J4/J6/J9, 12.23/12.24 and pinned P03 recognition/degradation/responsive
  semantics. Locked 12.25 before implementing the unmounted SSR-compatible region.
- Strict public-payload validation produces generic denial for unavailable,
  malformed or private inputs. Valid Published Owner/reference/image/title remain
  visible through partial/all destination degradation; all-unavailable commerce
  is communicated without lifecycle mutation. Exact same-origin unoptimized image
  selection, escaped text and internal Owner/Browse navigation are preserved.
- No external URL/action, RPC/data fetch, public route, grant, publication writer,
  authentication gate or optional fabricated metadata was introduced. The complete
  P03 page/action region and exact Published click transport remain unfinished.
- Targeted SSR/DTO tests: 37 passed (14 new renderer tests). Local typecheck,
  lint, five tooling tests, 715 Vitest tests plus 17 auth navigation tests (737
  total), all three builds and diff checks passed. Latest-push CI/Security/Guard remain
  PENDING until observed. Browser/responsive/live media/cache evidence remains open;
  this implementation is not P03/S5/S6 closure or production readiness.
- Next dependency-safe task: lock exact Published marketplace action/click-time
  safety binding and attribution-preserving transport, then complete staged P03
  action assembly without enabling withheld public readers or first Publish.


### Autonomous continuation — staged Product destination resolution — 2026-10-06

- Started from clean synchronized `5802935602a9034b63e62ea033d297d2a849747e`.
  That exact push passed Application CI and Security Dependency Scan; Database,
  Secret Scan, SAST and Guard were cancelled before steps ran. Those infrastructure
  gates remain PENDING, not code failures or human-only blockers.
- Locked 12.26 after current authority, J2/J4/J6/J9, pinned P03/FR-PRD and
  existing media/projection/source/test readback. Staged a read-only server resolver
  binding exact Published Identity/Product token, provider and original URL hash
  to current fresh URL/hash-bound safety. It preserves creator attribution and
  denies stale context, unsafe alternatives and private Working substitution.
- All resolver execution remains withheld from public/anon/authenticated/service_role.
  The strict server-only result validator checks provider URL policy and original
  hash; it does not authorize browser input, fetch, redirect or mint an intent.
  No public route/action, publication writer, lifecycle mutation or credential change.
- Local targeted tests: 44 passed (21 new validator tests). Typecheck, lint,
  test:tooling (5), test (736 Vitest + 17 auth navigation; 758 including tooling),
  three builds and diff review/check passed. New privileged rolled-back pgTAP
  fixtures cover selection/attribution, stale context/hash, safety degradation and
  recovery, lifecycle/ownership/media denial, withheld grants and no writes.
- Database reset/lint/error-level advisors/pgTAP/seven existing concurrency tests
  require committed isolated Database CI; local Docker capacity prevents that
  evidence here. Exact latest-push CI/Security/Guard remain PENDING until observed.
  Browser/manual/live provider/cache/abuse evidence and S5/S6 closure remain open.
- Exact implementation push `43363369ca86b3773e132449863e3a144f0c27f9`
  passed Application, Database, Secret Scan, SAST and Autopilot Guard. Database
  reset/lint/error-level advisors, 1,424 pgTAP assertions across 26 files (57 new)
  and all seven concurrency tests passed. Dependency Scan
  found High `GHSA-68fv-2mgg-jv7q` in transitive `source-map-js@1.2.1`.
  Applied an exact version-scoped override to patched `1.2.2` and regenerated
  the lockfile with pnpm; the release predates the 24-hour quarantine threshold.
  Trust/quarantine/scanner policies remain intact. After the patch, frozen install,
  typecheck/lint, all 758 application/tooling tests, three builds and diff checks
  passed again. Final-push evidence must be
  reverified; this is not a security-gate waiver or checkpoint closure.
- Patched final commit `7141fdce7af33c6aab26b685dd9bd4f6eadc882f` passed
  exact push-event [Application/Database CI 37398772253](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37398772253),
  [Secret Scan/SAST/Dependency Scan 37398772255](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37398772255),
  and [Autopilot Guard 37398772256](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37398772256).
  Database again passed all 1,424 pgTAP assertions and seven concurrency tests.
- Next dependency-safe task: lock server-authenticated rendered-context click intent
  transport with expiry/tamper/replay/cross-context denial, then stage P03 marketplace
  action assembly. Do not enable outbound routes/grants or first Publish prematurely.

### Autonomous continuation — staged Product click-intent core — 2026-10-06

- Clean `work` synchronized to `7141fdce7af33c6aab26b685dd9bd4f6eadc882f`.
  Fresh canonical frontier, J2/J4/J6/J9, pinned P03 and 12.23–12.26/source/tests
  readback identified intent core as the next bounded server dependency. Locked
  12.27 before code; no follower login or journey topology change.
- Core issues random 256-bit opaque capabilities for validated matching server
  confirmation/binding after safety resolution. Storage receives only token hash,
  purpose, private binding, confirmation digest and fixed 120-second lifetime.
- Mandatory injectable store must create atomically without overwrite and consume
  atomically once. Redemption validates strict public context/stored record/time,
  consumes before resolving exact current Published safety, preserves original
  attribution and rechecks time after asynchronous resolution. Failure is null;
  no private reason, redirect, publication/lifecycle mutation or analytics.
- Added no schema/migration, concrete store/RPC adapter, route/CTA, grant, credentials
  or Publish integration. Test-only memory storage is not production persistence.
  Durable database replay/concurrency/retention and exact snapshot issuance provenance
  require the later adapter contract; browser/cache/abuse/provider gates remain open.
- Targeted tests: 75 passed (54 new intent-core tests). Typecheck, lint, tooling,
  full tests (790 Vitest + 17 auth navigation + 5 tooling = 812), three builds and
  diff checks passed. Exact latest-push CI/Security/Guard remain PENDING until
  observed. No new database behavior was introduced; committed Database regression
  CI still runs. S5/S6 remain NOT CLOSED / VERIFIED.
- Next dependency-safe task: lock and implement the withheld durable atomic intent
  store and exact Published confirmation/binding issuance adapter, including database
  replay/concurrency/retention evidence, before staged P03 action/HTTP assembly.

## Current local integration — 2026-10-04

This branch combines the implementation preserved at `24a8905`, current main
documentation at `885daae`, and remote dependency/navigation fixes at `4f6cfce`.
The phase checklist below is the original planning inventory; unchecked entries
are not proof that existing implementation is absent. Audit the code and evidence
before starting a new slice. The previous branch's evidence is retained below.

- [x] Preserve uncommitted local application, shared policy, and migration work
  on `codex/local-preservation-20261004` and push before integration.
- [x] Merge remote documentation and implementation fixes without force-pushing.
- [x] Preserve both TODO inventories and both sides of dependency changes.
- [x] Verify the preserved local baseline: 410 Vitest tests, typecheck, lint,
  and all three application builds passed using installed Next.js 16.3.3 and
  Vitest 4.1.10. This evidence does not verify the patched integration candidate.
- [x] Verify the merged auth-navigation suite separately: 17 native Node tests.
- [x] Read and materialize the pinned J1–J9 maps and full O01 specification
  locally, without changing their locked content or importing legacy runtime.
- [x] Verify a frozen install and full regression of application commit `136cd1c`:
  pnpm 11.24.0 supply-chain checks and frozen install passed; 410 Vitest tests
  plus 17 native Node tests passed; typecheck, lint, and all three Next.js 16.3.6
  production builds passed. No local secrets were copied into the chat worktree.
- [x] Resolve the scanner/sanitizer development-port conflict (3002/3001), add
  per-service environment examples and test configuration, and patch Next.js,
  eslint-config-next, and Vitest consistently across the workspace.
- [x] Repair CI initialization at `87cdeea`: set up pinned Node before pnpm;
  disable pnpm/setup's implicit install and retain the explicit frozen-install
  gate. YAML parsing and step-order checks passed locally for both jobs.
- [x] Verify CI Application and Database for `87cdeea`: both jobs passed,
  including frozen installation, application checks/build, isolated database
  reset, lint with no schema errors, and 779 pgTAP tests across 14 files.
  Local Docker remained unavailable; no existing local database was reset.
- [x] Verify production HTTP failure boundaries locally: 7 checks passed for
  scanner unsigned/invalid-signature denial, signed invalid JSON/payload denial,
  oversized-request denial, and sanitizer missing-configuration/size denial.
  The smoke checks used loopback servers and made no provider/storage requests.
- [x] Complete Security for `5504842`: Dependency Scan, SAST, and Secret Scan passed.
- [x] Resolve the outstanding braces advisory without suppressing it; see
  `docs/product-spec/NEXT-ESLINT-DEPENDENCY-REMEDIATION.md`.
- [x] Reconcile S5 progress/recommendation/presentation with pinned O01/J1–J4
  and lock scoped contract 12.12. Product/Resource lifecycle and S6 remain open.
- [x] Make non-Affiliate Product entry an accessible optional disclosure while
  retaining mounted inputs and automatically exposing an existing saved Draft.
- [x] Lock Resource Draft contract 12.14 and implement semantic-first private
  persistence, Resource-first Business entry, optional access for other personas,
  retained saved Drafts, strict acknowledgment, and post-commit fail-closed scanning.
- [x] Verify Resource implementation locally: 891 pgTAP tests across 16 files,
  458 Vitest tests, 17 auth navigation tests, five tooling tests; typecheck, lint,
  and all three builds pass. Database schema lint and error-level security
  advisors pass. Concurrent Resource first saves and Product creation serialize
  without duplicate Items, stale overwrites, or duplicate Owner references.
- [x] Apply Resource migration additively after private backup without resetting
  the existing development database or changing Product content/reservations.
- [x] Verify isolated S1–S5 Resource UI: empty-shell rejection, input retention,
  title-only save, source update, reload, and Business-to-Personal Draft retention.
  The source remains pending when the scanner is unavailable.
- [x] Verify CI/Security on Resource `adcdb4c` and login repair `7e482c9`.
- [x] Fix login Server Action redirect chain using the shared authoritative final
  destination resolver. Browser login now reaches `/onboarding`; its next Resource
  POST succeeds with no console errors. Eight destination regressions, web lint,
  typecheck, 202 web unit tests and production build pass (488 application/tooling
  tests across the workspace). S6 remains open.
- Resource commit `adcdb4c` passed
  [Security 37221708726](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37221708726).
  [CI 37221708678](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37221708678)
  passed after the user-requested 2% usage stop.
  Login repair `7e482c9` also passed
  [CI 37221914474](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37221914474)
  and [Security 37221914486](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37221914486).
  No merge/release is claimed. The earlier usage-gated local-push instruction is
  historical and is superseded for `codex/autopilot` by the bounded Autonomous
  Codex Cloud lane authorized on 2026-10-05. It does not grant direct `main`
  writes or production release authority.
- [x] Lock bounded S6 private preview contract 12.15: one current-Owner database
  snapshot, explicit content/safety issues, and timezone-stable digest. No publication.
- [x] Verify preview: 52 targeted pgTAP assertions plus the preceding clean
  942-test DB suite pass (943 assertions with the added timezone regression).
  487 Vitest, 17 navigation and five tooling tests pass, as do typecheck, lint,
  web production build and error-level DB advisors. Browser S5-to-S6 and responsive
  preview pass with no console errors. Primary DB migrations applied additively
  after backup. Remote CI awaits the user-requested usage-gated push.
- [x] Lock and implement private preview receipt contract 12.16: explicit Owner
  confirmation, fresh digest comparison, one row per Owner, fixed ten-minute TTL,
  idempotent unchanged confirmation and rotation after changes/expiry. 41 pgTAP
  and 20 action tests pass; web typecheck/lint pass. Browser confirmation, stale
  tab rejection and reloaded confirmation pass with no console errors. Private
  receipt migration applied additively to the primary DB after backup.
- [ ] Implement atomic first Publish, explicit
  Identity-only/Item intent, public read/media transport and first workspace.
- [x] Lock staged transaction contract 12.18 and implement atomic Identity-only/
  Resource persistence, immutable first acknowledgment, Owner-bound review/expiry,
  fresh wall-clock safety, preserved Working/Drafts and idempotent retry. 64 pgTAP
  assertions and three real concurrent-session races pass. Publication RPC grants
  remain withheld until public/workspace/UI transport is verified.
- [x] Correct Product preview readiness against pinned FR-PRD-004/009: title and
  safe URL cannot replace mandatory primary image and marketplace preparation.
  DB preview and two application regressions enforce the explicit pending issue.
- [ ] Implement Product primary-image/marketplace publication preparation and
  public Profile Media transport; never silently discard selected private media.
- [x] Lock staged public-snapshot reader contract 12.19. Handle/alias resolution,
  current account/lifecycle gates, private-field exclusion and fresh exact-source
  safety pass 48 pgTAP assertions. Anonymous/read endpoint grants remain withheld.
  The recorded empty migration is preserved; actual readers use a later additive
  migration. Primary application was backed up and never reset.
- [x] Verify the complete local batch: 1,097 pgTAP assertions across 20 files,
  five real DB concurrency tests, 529 Vitest tests, 17 navigation tests and five
  tooling tests pass. Workspace typecheck/lint, three production builds, schema
  lint and error-level security advisors pass. Latest pnpm audit reports zero
  findings at every severity. Remote CI/Security await the usage-gated push.
- [ ] Enable first Publish only after explicit bundle review, safe public routes/
  click transport, public media and the universal D01 workspace handoff are ready.
- [x] Extend the authoritative final-destination repair to all onboarding and
  profile-media Server Actions. Await the account resolver and navigate directly
  to its final page; unverifiable account state fails closed. Ten new regressions
  cover direct navigation and rejected Identity/Resource saves; web typecheck,
  lint and unit suite pass. No GET-only auth-handler redirect remains in these actions.
- [x] Lock scoped account notice/session-exit contract 12.17. Restricted/suspended
  Owners now reach the existing resolver's real `/dashboard/account-status`
  destination. Explicit local-context Sign Out clears intent after provider
  acknowledgment and goes directly to Login. Ten unit regressions, web typecheck
  and lint pass; browser restricted-account routing and Sign Out pass with no
  console errors. Detailed enforcement/review workflows remain open.
- [x] Reconcile preserved Product Draft/reference allocation with pinned 11.22:
  contract 12.13 and an additive migration reserve immutable Owner-scoped Item
  identity/reference at durable creation and backfill existing Drafts.
- [x] Verify reference reservation locally in an isolated Supabase lab: backfill
  preserves legacy UUID/revision/content/timestamps; 845 pgTAP tests pass;
  concurrent first saves create one Item and reject the other as stale; parallel
  Product/Resource allocations use distinct numbers in the shared Owner sequence.
  Database lint and security advisors report no errors/issues.
- [x] Apply the additive reference migration to the existing local development
  database after a private core/API/history backup. Its one existing Draft now
  has one identity reservation with zero missing mappings; database lint passes.
  No reset of the existing development database was performed.
- [x] Verify reference-foundation implementation `9f086c5` remotely:
  [CI 37220286784](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37220286784)
  passes Application, database reset/lint, 845 pgTAP tests, and concurrent
  allocation verification;
  [Security 37220286807](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37220286807)
  passes Dependency Scan, SAST, and Secret Scan.
- [ ] Verify the complete S5 journey in the browser before checkpoint closure.

Scratch `*-read.txt` review notes and ignored local secrets remain local. They are
not application source and were not included in the preservation commit.

Remote evidence for `136cd1c`:

- [Security run 37218167613](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37218167613)
  Secret Scan passed. Dependency Scan failed with exactly one High finding:
  `braces@3.0.3`, `GHSA-vfj7-8cjw-p6xm`, CVSS 8.7, no fixed version reported.
  SAST also passed for this commit.
- [Security run 37218254234](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37218254234)
  for `87cdeea`: Secret Scan and SAST passed; Dependency Scan failed.
- [CI run 37218254208](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37218254208)
  for `87cdeea`: Application and Database passed. Database log reports
  `No schema errors found`, `Files=14, Tests=779`, and `Result: PASS`.
- Earlier integration CI failed with `ERR_PNPM_LOCKFILE_MISSING_DEPENDENCY` on
  Next.js 16.3.3. The pnpm-generated lockfile and aligned importers in `136cd1c`
  resolve that specific failure; local frozen installation proves the repair.
- `main` remains unmerged while required security/live-runtime gates are
  incomplete. The preservation commit and all remote branch history remain
  available; no reset or force push was used.

**Historical immediate-work snapshot (superseded by the Current canonical
implementation frontier above):** this previously called for extending S5 and
implementing Resource Draft. Resource Draft and later staged S6/publication work
now exist under contracts 12.14–12.19. Preserve this paragraph only as execution
history; do not use it for current task selection.

## How to use this file

- This is the implementation checklist, not the product authority.
- Before starting a task, read PRD.md, ARCHITECTURE.md, SKILL.md, WORKFLOW.md, and the relevant canonical product records.
- Mark an item complete only after its acceptance checks pass.
- Do not mark a phase complete because the UI looks finished.
- New work that changes locked product semantics requires an explicit product decision before implementation.

## Phase 0 — Documentation / execution baseline

- [x] Establish clean production repository.
- [x] Migrate canonical Product Source of Truth and migration provenance.
- [x] Migrate locked production technology/security authority.
- [x] Add PRD.md execution summary.
- [x] Add ARCHITECTURE.md execution summary.
- [x] Add TODO.md execution backlog.
- [x] Add SKILL.md implementation-agent rules.
- [x] Add WORKFLOW.md delivery workflow.
- [x] Re-read all five execution files after commit and verify cross-document consistency.

### Exit criteria
- No execution document contradicts PRODUCT-SOURCE-OF-TRUTH.md or 12.4.
- Repository is ready to start runtime scaffold from zero.

## Phase 1 — Monorepo and application scaffold

- [ ] Initialize pnpm workspace.
- [ ] Initialize Turborepo.
- [ ] Create apps/web Next.js Active-LTS app using React 19.
- [ ] Confirm Node.js 24 LTS baseline.
- [ ] Enable TypeScript strict.
- [ ] Enable noUncheckedIndexedAccess.
- [ ] Enable exactOptionalPropertyTypes.
- [ ] Configure Tailwind CSS 4.x.
- [ ] Add Radix UI primitives only where useful.
- [ ] Add base Zod and React Hook Form dependencies.
- [ ] Create packages/domain.
- [ ] Create packages/validation.
- [ ] Create packages/ui.
- [ ] Create packages/config or equivalent shared config boundary.
- [ ] Add ESLint/formatting/tooling configuration.
- [ ] Add .env.example without secrets.
- [ ] Create minimal application shell and health/readiness route.
- [ ] Verify production build from a clean install.

### Exit criteria
- pnpm install --frozen-lockfile works.
- Typecheck, lint, tests placeholder, and next build are runnable.
- No feature logic exists in random UI files.
- No legacy runtime source has been copied in.

## Phase 2 — Local database, migrations, and CI security foundation

- [ ] Initialize local Supabase development.
- [ ] Commit versioned SQL migration structure.
- [ ] Define logical schema families: core, publication, analytics, moderation, audit, ops, api.
- [ ] Establish database role/grant posture.
- [ ] Add pgTAP / Supabase database-policy test harness.
- [ ] Add reproducible local reset/seed workflow.
- [ ] Configure GitHub Actions.
- [ ] Add frozen-install gate.
- [ ] Add typecheck gate.
- [ ] Add lint/format gate.
- [ ] Add unit-test gate.
- [ ] Add migration/reset validation gate.
- [ ] Add database allow + deny policy-test gate.
- [ ] Add Semgrep.
- [ ] Add Gitleaks.
- [ ] Add dependency vulnerability scan.
- [ ] Enable Dependabot configuration.
- [ ] Document preview/staging/production environment contract.

### Exit criteria
- Fresh checkout can reproduce the local DB from committed state.
- CI fails on type, lint, migration, policy-test, secret-scan, or build failure.

## Phase 3 — Core domain primitives

- [ ] Define stable Owner identity contract.
- [ ] Define provider identity linkage contract.
- [ ] Define Handle value object and normalizer.
- [ ] Define persistent Spill Reference parser/normalizer.
- [ ] Define Product and Resource domain types.
- [ ] Define Working / Published lifecycle types.
- [ ] Define revision token / baseRevision contract.
- [ ] Define STALE_WRITE behavior.
- [ ] Define idempotency / operation identity contract.
- [ ] Define typed application errors.
- [ ] Define public-safe projection builders.
- [ ] Define authorization/capability interfaces.
- [ ] Define Audit semantic interface.
- [ ] Unit-test identifiers, lifecycle, projections, permissions, and error mapping.

### Exit criteria
- Core domain rules are testable without React.
- UI cannot redefine identifiers/lifecycle locally.

## Phase 4 — Authentication and authorization

- [ ] Configure Supabase Auth locally/dev.
- [ ] Implement Email/Password.
- [ ] Implement Google OAuth.
- [ ] Map auth principal to stable Spall Spill Owner.
- [ ] Implement trusted server session handling.
- [ ] Implement server authorization helpers.
- [ ] Implement owner isolation.
- [ ] Implement operator capability model foundation.
- [ ] Add RLS/grant allow + deny cases.
- [ ] Add anti-enumeration outward error mapping.
- [ ] Add action-specific auth rate limits.
- [ ] Add Turnstile where justified.
- [ ] Implement recovery flow.
- [ ] Test forged cross-owner read/write attempts.

### Exit criteria
- Authentication never substitutes for authorization.
- Protected server actions deny unauthorized access by default.

## Phase 5 — Onboarding and Identity

- [ ] Implement landing / entry foundation.
- [ ] Implement signup/login/recovery routes.
- [ ] Implement Handle claim.
- [ ] Implement onboarding primary-use-case selection.
- [ ] Implement Personal onboarding path.
- [ ] Implement Affiliator onboarding path foundation.
- [ ] Implement Business/UMKM onboarding path foundation.
- [ ] Implement Creator onboarding path.
- [ ] Implement Identity Working persistence.
- [ ] Implement explicit autosave status state machine.
- [ ] Implement live preview without counting audience analytics.
- [ ] Implement explicit Identity publish.
- [ ] Implement public Identity Published projection.
- [ ] Implement Handle rename/alias continuity according to locked policy.
- [ ] Add J1 critical E2E.
- [ ] Add Identity portion of J2/J3/J4 E2E.

### Exit criteria
- Platform Activation is measurable.
- Saving Working never changes public Identity without explicit publish.

## Phase 6 — Spill lifecycle, Product, Resource, and publication

- [ ] Implement first durable Spill Item creation threshold.
- [ ] Implement persistent reference allocation.
- [ ] Guarantee reference non-reuse.
- [ ] Implement Product Working model.
- [ ] Implement Resource Working model.
- [ ] Implement marketplace destination model.
- [ ] Implement Resource destination model.
- [ ] Implement Product manual-entry fallback.
- [ ] Implement safe metadata adapter boundary.
- [ ] Add SSRF protections.
- [ ] Implement explicit item publish.
- [ ] Implement Published Product projection.
- [ ] Implement Published Resource projection.
- [ ] Implement hide / restore.
- [ ] Implement archive / retired state.
- [ ] Preserve entity/reference through destination replacement.
- [ ] Implement onboarding multi-record publication orchestration.
- [ ] Add idempotency for harmful duplicate mutations.
- [ ] Add J2 and J3 critical E2E.
- [ ] Add Product/Resource returning-owner E2E.

### Exit criteria
- Spill Activation and Commerce Activation are distinct.
- Product/Resource public state is always a validated projection of an exact Working revision.

## Phase 7 — Public Spill, exact retrieval, browse, and discovery

- [ ] Implement /{handle}/spill.
- [ ] Implement /{handle}/spill/{reference}.
- [ ] Exact parser accepts minimum 27 and #27 forms.
- [ ] Exact reference wins over fuzzy discovery.
- [ ] Unique exact Published match auto-opens item detail.
- [ ] Hidden/Draft remain outwardly unavailable.
- [ ] Archived stable link uses retired/tombstone treatment where required.
- [ ] Implement Product detail confirmation.
- [ ] Implement one-destination provider CTA.
- [ ] Implement multi-destination chooser.
- [ ] Implement Resource lightweight detail.
- [ ] Implement adaptive Resource Open/View CTA.
- [ ] Implement creator-scoped keyword search.
- [ ] Implement category browse.
- [ ] Implement Featured/Pinned.
- [ ] Implement Newest Published.
- [ ] Implement useful zero-result recovery.
- [ ] Preserve reasonable back-navigation search/filter context.
- [ ] Add J6, J7, J8 Playwright E2E.

### Exit criteria
- Public discovery works without follower account/login.
- Exactness is deterministic and never silently substituted.

## Phase 8 — Media

- [ ] Configure Cloudflare R2 buckets by trust class.
- [ ] Implement server-authorized upload intent.
- [ ] Implement constrained short-lived presigned uploads.
- [ ] Validate actual MIME/magic bytes.
- [ ] Validate file size and dimensions.
- [ ] Validate decodability where applicable.
- [ ] Define metadata stripping/safety policy.
- [ ] Prevent arbitrary unsafe SVG by default.
- [ ] Implement authorized replacement/deletion.
- [ ] Ensure public projections include public-safe delivery metadata only.
- [ ] Add media security/integration tests.

## Phase 9 — Returning-owner workspace and capability expansion

- [ ] Implement adaptive dashboard shell.
- [ ] Implement fast Add Product.
- [ ] Implement fast Add Resource.
- [ ] Implement existing item search/filter.
- [ ] Implement edit and publish flow.
- [ ] Implement Identity edit and publish flow.
- [ ] Implement contextual capability discovery.
- [ ] Implement micro-onboarding for first-time capability use.
- [ ] Ensure changing Primary Use Case never changes permissions or migrates data.
- [ ] Ensure new capability activation never silently mutates public Identity.
- [ ] Add J5 E2E.
- [ ] Add J9 E2E.

## Phase 10 — Analytics

- [ ] Define canonical product analytics event schema.
- [ ] Implement Platform Activation event.
- [ ] Implement Spill Activation event.
- [ ] Implement Commerce Activation event.
- [ ] Implement Exact Reference Success and time-to-exact-item.
- [ ] Implement Search/Browse success semantics.
- [ ] Implement zero-result/refinement events.
- [ ] Implement Product outbound click.
- [ ] Implement Resource Open.
- [ ] Exclude Owner preview from public audience metrics.
- [ ] Keep creator/business analytics canonical inside Spall Spill.
- [ ] Configure PostHog only for approved internal telemetry.
- [ ] Add privacy/data-minimization review.

## Phase 11 — Moderation, operator access, and Audit

- [ ] Implement report taxonomy and report intake.
- [ ] Implement case creation/workflow.
- [ ] Implement evidence storage in private trust class.
- [ ] Implement enforcement model.
- [ ] Implement owner-facing enforcement notice treatment.
- [ ] Implement appeal eligibility/submission/re-review.
- [ ] Implement operator permission matrix.
- [ ] Require MFA for protected operator access.
- [ ] Implement fresh strong-auth checks for high-risk actions.
- [ ] Implement append-only Audit storage.
- [ ] Write protected mutation + Audit atomically where possible.
- [ ] Implement durable outbox/intent fallback where one transaction cannot cover external effects.
- [ ] Audit sensitive evidence disclosure.
- [ ] Add operator authorization allow + deny tests.
- [ ] Add critical moderation/operator E2E.

## Phase 12 — Async jobs, notifications, and operational controls

- [ ] Configure Supabase Queues / pgmq.
- [ ] Configure Supabase Cron / pg_cron.
- [ ] Implement transactional outbox processor.
- [ ] Ensure workers are idempotent.
- [ ] Configure Resend.
- [ ] Configure SPF/DKIM/DMARC before production email.
- [ ] Keep provider email payload outside domain truth.
- [ ] Implement health/readiness checks.
- [ ] Implement protected kill switches where locked product requirements require them.
- [ ] Add queue depth/age and worker failure monitoring.

## Phase 13 — Observability, security hardening, and performance

- [ ] Instrument OpenTelemetry.
- [ ] Configure Sentry.
- [ ] Add correlation/trace IDs.
- [ ] Ensure structured logs are PII-minimized.
- [ ] Configure security headers.
- [ ] Configure CSP.
- [ ] Configure HSTS.
- [ ] Configure Referrer-Policy.
- [ ] Configure Permissions-Policy.
- [ ] Validate CSRF/origin/session protections.
- [ ] Validate open-redirect protection.
- [ ] Validate XSS boundaries.
- [ ] Validate SSRF controls.
- [ ] Load-test critical public read paths.
- [ ] Track LCP/INP/CLS.
- [ ] Track public and owner API p95.
- [ ] Review slow DB queries and indexes.
- [ ] Verify Published projections are cacheable where appropriate.

## Phase 14 — Backup, recovery, release, and production readiness

- [ ] Define production backup policy.
- [ ] Enable appropriate provider-managed backup tier before serious production.
- [ ] Implement independent PostgreSQL logical backup.
- [ ] Store independent backup privately.
- [ ] Define retention.
- [ ] Perform clean restore drill.
- [ ] Run integrity/smoke checks after restore.
- [ ] Define RPO/RTO.
- [ ] Document rollback.
- [ ] Test rollback.
- [ ] Document secret rotation.
- [ ] Test secret rotation procedure.
- [ ] Document incident response responsibilities.
- [ ] Complete dependency/security audit.
- [ ] Complete accessibility audit.
- [ ] Complete Playwright J1–J9 release suite.
- [ ] Verify staging.
- [ ] Verify production configuration.
- [ ] Perform production smoke test.
- [ ] Tag release.

### Final production-ready gate
Spall Spill is production ready only when product behavior, authorization, database policy tests, security checks, E2E, observability, restore, rollback, and production smoke verification all pass.

## Immediate next task

**Original documentation-only next task (superseded by current local integration):
Start Phase 1: clean monorepo/application scaffold.**

Do not begin by rebuilding visible feature pages from the legacy app. The first runtime milestone is a clean, testable foundation with correct TypeScript, workspace, build, CI, and database direction.

---

# Spall Spill — Active Implementation TODO

**Branch baseline:** `m0/foundation@013b23744668c2ee13b7c4a4910ee237a9080ea7`
**Last audited:** 2026-10-04

This checklist tracks the active implementation branch. Product authority remains
`docs/product-spec/PRODUCT-SOURCE-OF-TRUTH.md` and its locked contracts.
The Phase 1 checklist on main describes an older documentation-only baseline;
do not recreate the existing foundation from that checklist.

## Current evidence

- The active branch contains the workspace, Next.js application, Auth, Owner
  resolver, local Supabase migrations/policy tests, and profile-media integration.
- The canonical index records O01-S4 as CLOSED / VERIFIED.
- Later commits already implement Relevant First Job foundation
  (`40f50d16e6bb81ea28a77ee59be846dc83ff0935`) and Identity Connection Working
  (`013b23744668c2ee13b7c4a4910ee237a9080ea7`).
- CI and Security completed successfully for those two implementation commits.
- The canonical index still defers S5 mechanics. This mismatch must be reconciled
  before a new onboarding/publication checkpoint is implemented. CI success does
  not establish contract closure or manual/runtime verification.

## Auth navigation regression gate

- [x] Audit the intended-destination implementation against locked contract 12.5.
- [x] Identify that Vitest includes only `src/**/*.test.ts` and excludes the
  existing `tests/intended-destination.test.mjs` security suite.
- [x] Wire the native Node suite into `pnpm test` before Vitest, with failure
  propagation through `&&`.
- [x] Add decoding-limit, deeply encoded unsafe-path, and canonical-idempotence
  regression cases.
- [x] Run the native suite locally on Node.js 24.19.0: 17 tests passed.
- [x] Verify the full frozen install/typecheck/lint/unit/build pipeline on
  candidate `730083e42eab0af3ee6181af5fba4f468b6306f6`: Application job passed;
  17 native Node tests and 84 Vitest tests passed.
- [x] Verify Database on `f5925c1a3670ff6be8fdd8a68beed4a62000b3eb`: reset, lint,
  and 659 pgTAP tests passed (CI run `37215552832`).
- [ ] Complete Security: dependency scan remains a release blocker; see below.
- [ ] Close the candidate only after the applicable execution-protocol gates pass.

No runtime navigation, database, publication, session, or permission behavior
changes in the auth-navigation batch. The separate dependency-patch batch below
updates manifests and regenerates the lockfile.

## Historical next onboarding batch — superseded

This checklist was created before contracts 12.12–12.19 and is retained only as
history. Do not use it for current task selection.

- [x] Reconcile the S5 code with the canonical Source of Truth and a JIT contract.
- [x] Read the pinned screen-level O01 and J1–J4 records for S5/S6 as part of the
  later bounded contract work.
- [x] Record existing S5 capabilities and stage later Product/Resource/publication
  boundaries under explicit contracts rather than inference.
- [ ] Complete the remaining journey/runtime/provider evidence still listed in
  the Current canonical implementation frontier.
- [ ] Implement the next bounded slice only once its technical authority exists.

## Dependency-security release blocker

Security run [37215324440](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37215324440)
scanned candidate `730083e42eab0af3ee6181af5fba4f468b6306f6` and failed OSV.
Secret Scan and SAST passed. The unchanged baseline lockfile has 10 advisory
matches across 6 affected package/version entries: 1 Critical, 5 High, 4 Medium.

| Package in existing lockfile | Installed | Scanner-reported fixed version |
| --- | --- | --- |
| next | 16.3.3 | 16.3.6 |
| vitest | 4.1.10 | 4.1.11 |
| @vitest/mocker | 4.1.10 | 4.1.11 |
| brace-expansion | 1.1.18 | 1.1.21 covers the three reported fixes |
| brace-expansion | 5.0.9 | 5.0.12 covers the three reported fixes |
| braces | 3.0.3 | No fixed version reported by this scan |

These versions are evidence from this exact scan, not a promise that a package
upgrade alone makes the full application secure.

- [x] Patch Next.js and its matching eslint-config-next dependency to 16.3.6.
- [x] Patch Vitest and its resolved mocker dependency to 4.1.11.
- [x] Trace affected parents: minimatch 3/10 resolve brace-expansion;
  eslint-config-next -> @next/eslint-plugin-next -> fast-glob -> micromatch
  resolves braces. Pin compatible brace-expansion patch lines with scoped overrides.
- [x] Remediate the remaining braces dependency without suppressing its advisory.
- [ ] Review the braces advisory and an upstream-supported remediation; do not
  suppress an unresolved finding to force a green scan.
- [x] Regenerate pnpm-lock.yaml through pnpm and run frozen-install,
  typecheck/lint/tests/build and the complete security scan (results below).
- [x] Re-run database reset/lint and all 659 database tests on patch commit.
- [ ] Complete applicable runtime verification and all release gates before merge/release.

Local dependency installation/regeneration remains blocked: pnpm is absent,
GitHub clone fails, and the npm registry request fails with EACCES. The lockfile
was generated through pnpm on a GitHub Actions runner, then read back and reviewed;
it was not hand-edited. The draft is not approved for merge or release.

## Follow-up remediation and S5 presentation — 2026-10-05

- Security fix `5504842` removes the vulnerable lint dependency tree through a
  version-scoped plugin patch and removal of its unused fast-glob dependency.
  No advisories or required gates are suppressed.
- Frozen install and pnpm audit passed with zero findings; five tooling tests,
  410 Vitest tests, 17 auth navigation tests, typecheck, lint, and three builds passed.
- [Security 37218867679](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37218867679)
  passed all three jobs for `5504842`.
- [CI 37218867718](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37218867718)
  passed Application and Database for `5504842`, including 779 pgTAP tests and
  database lint with no schema errors.
- Contract 12.12 and five rendered-form regressions cover focused optional
  Product entry, Affiliate emphasis, genuine Skip, and saved-Draft visibility
  after guidance changes. Product inputs remain mounted when the disclosure closes.
- The updated workspace has 415 Vitest tests, 17 auth navigation tests, and
  five tooling tests (437 total). Typecheck, lint, and all three builds pass locally.
- Resource Draft, full Product lifecycle, S6/publication, full browser journey,
  and live Web Risk/Gemini verification remain open. No S5/S6 closure is claimed.

## Historical dependency patch batch — 2026-10-04

Implementation commit: `d07d279a3f1469da37b6cc3d4a1f59b9e5957b33`.

Changes:
- Next.js and eslint-config-next: 16.3.3 -> 16.3.6, including matching Next internals.
- Vitest and @vitest/mocker: 4.1.10 -> 4.1.11, including matching Vitest internals.
- brace-expansion: 1.1.18 -> 1.1.21 and 5.0.9 -> 5.0.12 through major-scoped
  workspace overrides; no major substitution.
- pnpm 11.24.0 generated the lockfile with the existing release-age quarantine,
  trust policy, strict builds, and frozen-install policy intact.
- Local review found exactly three intended dependency files in this batch,
  with no unrelated package updates; `git diff --no-index --check` passed.
- The temporary dependency-resolution workflow exists only on
  `chore/dependency-resolution-20261004` and is not included in PR #2.

Verified evidence for that exact implementation commit:
- [CI run 37216285290](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37216285290):
  Application and Database passed.
- Frozen install, typecheck, lint, 17 native Node tests, 84 Vitest tests, and
  Next.js production build passed.
- Database reset, lint (no schema errors), and 659 pgTAP tests across 11 files passed.
- [Security run 37216285258](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37216285258):
  Secret Scan and SAST passed; Dependency Scan failed with exactly one finding.
- OSV went from 10 advisory matches to 1: 0 Critical, 1 High, 0 Medium.
  The remaining finding is `braces@3.0.3`,
  [GHSA-vfj7-8cjw-p6xm](https://osv.dev/GHSA-vfj7-8cjw-p6xm), CVSS 8.7;
  scanner reports no fixed version.
- The committed pnpm lockfile was fetched back and matched the runner output exactly.

Remaining boundaries:
- Release remains blocked by the braces finding. Its currently traced path is
  development lint tooling; this is not blanket proof that every runtime/bundled
  copy is unreachable or an accepted-risk decision.
- Resolve through an upstream-supported dependency replacement or separately
  reviewed remediation. Do not hide the advisory or weaken the security gate.
- Local full regression and targeted runtime/browser verification remain
  unavailable in this execution environment; no CLOSED / VERIFIED claim is made.
- The S5 Source of Truth/JIT contract mismatch remains a separate prerequisite
  for feature continuation. This dependency patch does not close S5 or S6.

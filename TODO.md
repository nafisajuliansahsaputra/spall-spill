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
- 12.27 staged opaque one-use Product click-intent core with injectable storage;
- 12.28 withheld durable hashed intent persistence/consume/bounded cleanup;
- 12.29 staged private application RPC store/cleanup adapter;
- 12.30 staged same-Published-snapshot confirmation/binding and private issuance;
- 12.31 withheld database clock/deadline and bounded calibration primitives;
- 12.32 operation-local calibrated private intent issuance/redemption wiring;
- 12.33 inactive bounded database retention scheduler foundation;
- 12.34 unmounted bounded request/permit/no-store primitives;
- 12.35 unmounted strict private HTTP/core response assembly;
- 12.36 unmounted strict native-form POST redemption adapter;
- 12.37 unmounted confirmation-before-provider native form renderer;
- 12.38 private snapshot-bound multi-provider confirmation/intent bundle;
- 12.39 unmounted guarded locator-only private HTTP bundle handler;
- 12.40 private atomic distributed action/work budget primitive;
- 12.41 private confined bounded Upstash REST EVAL transport;
- 12.42 private handler-specific HTTP / distributed budget composition.
- 12.43 private trusted-network canonicalization/keyed budget subjects.
- 12.44 private same-policy network subject / budgeted HTTP composition.
- 12.45 isolated Chromium confirmation/native-form fixture evidence.
- 12.46 isolated native-browser context/expiry/budget denial evidence.
- 12.47 isolated single/degraded provider native-browser evidence.
- 12.48 unmounted strict exact-reference locator normalization.
- 12.49 withheld Published Resource context / current source availability projection.
- 12.50 withheld exact Published Item type resolution / private SDK dispatch.
- 12.51 unmounted Published Resource recognition renderer.
- 12.52 withheld exact Published Resource source resolution / strict server validator.
- 12.53 withheld same-snapshot Resource recognition / private server binding.

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
- [x] Implement withheld durable intent store under 12.28; exact `17127f9`
  Database CI passed 1,503 pgTAP assertions and nine real concurrency tests.
- [x] Stage the private RPC store/one-call cleanup adapter under 12.29; no grants
  or schedule enabled. Exact latest-push evidence remains PENDING until observed.
- [x] Stage same-snapshot Published context and locator-only private issuance
  under 12.30; exact-push database/CI evidence remains PENDING until observed.
- [x] Stage database epoch/deadline RPCs and conservative clock calibration
  under 12.31; exact `a029b71` passed all automated gates; private wiring follows below.
- [x] Wire lower issuance/upper deadline bounds and committed-record database
  resolution under 12.32; actual authorized integration/public transport remain open.
- [x] Register inactive bounded intent/history retention under 12.33; actual
  isolated scheduler evidence passed on `19cce5e`; controlled activation/capacity/monitoring open.
- [x] Stage strict request/permit/body limits and no-store denial under 12.34;
  actual distributed limiter and mounted routes remain open.
- [x] Assemble strict locator/token HTTP responses with calibrated private core
  under 12.35; concrete identity/limiter and confirmation-before-action browser integration remain open.
- [x] Stage native-form POST redemption under 12.36 without relaxing JSON
  interfaces; no mounted route is enabled.
- [x] Stage confirmation-first provider forms under 12.37; real browser transport
  remains open, with private bundle foundations below.
- [x] Assemble private multi-provider confirmation/intent bundles under 12.38,
  checking shared publication binding before writes; guarded HTTP bundle integration remains open.
- [x] Stage guarded locator-only HTTP bundle responses under 12.39, preserving
  origin/permit/body/deadline/no-store gates; routes and actual distributed enforcement remain withheld.
- [x] Stage private atomic action/work budgets under 12.40, with explicit trusted
  policy/subject injection and required isolated Redis runtime tests; live Upstash/identity integration open.
- [x] Stage confined private Upstash REST EVAL transport under 12.41; protocol
  fixtures are not live provider compatibility or trusted deployment identity evidence.
- [x] Compose private HTTP handlers with mandatory handler-selected budgets under
  12.42; no permissive permit or caller-selected cost, no mounted public route.
- [x] Stage private trusted-runtime IP canonicalization/keyed subject derivation
  under 12.43; actual upstream attestation/provenance remains an enabling gate.
- [x] Compose private network subjects and budgeted HTTP under 12.44, binding a
  copied policy namespace and disallowing caller identity override/fallback.
- [x] Verify staged Product confirmation/native form/replay and recognition-only
  behavior in actual isolated Chromium under 12.45; deployed browser/TLS/CDN gates stay open.
- [x] Verify actual isolated native-browser context/expiry/budget denial and
  sibling-intent isolation under 12.46; live database/provider gates remain open.
- [x] Verify single/degraded provider CTA, original native redirect and browser
  no-referrer behavior under 12.47 owned fixtures; deployed evidence remains open.
- [x] Stage strict server-only exact-reference locator normalization under 12.48;
  actual Published lookup/type dispatch and public routing remain withheld.
- [x] Stage additive Published Resource context projection under 12.49; source
  degradation retains recognition with no URL, existing 12.19 reader unchanged.
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
- Exact implementation `4547321ac2842c130adcbc6383a48abd04e8d419` passed
  push-event [Application/Database CI 37399658222](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37399658222),
  [all Security scans 37399658213](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37399658213),
  and [Autopilot Guard 37399658244](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37399658244).
  Database regression passed 1,424 pgTAP assertions and seven concurrency tests;
  these existing tests do not prove the later durable intent adapter.
- Next dependency-safe task: lock and implement the withheld durable atomic intent
  store and exact Published confirmation/binding issuance adapter, including database
  replay/concurrency/retention evidence, before staged P03 action/HTTP assembly.

### Autonomous continuation — withheld durable intent store — 2026-10-06

- Refreshed clean `work` to exact `4547321ac2842c130adcbc6383a48abd04e8d419`;
  reread 12.27/current authority and existing database/concurrency patterns.
  Locked 12.28 before migration implementation; current Supabase RLS/function
  documentation readback confirmed explicit grants/revokes and private schema boundaries.
- Added private hashed-token record persistence with strict purpose/binding/hash/
  fixed 120-second epoch-time validation and RLS/no policies. Create validates
  current exact Published safety and database clock, inserts without overwrite;
  consume atomically burns and returns one current record; expired/future records
  burn without a response. Indexed cleanup locks/skips at most 500 expired rows.
- All table/helper/RPC execution/access remains withheld from public/anon/
  authenticated/service_role. No raw token/URL storage, application RPC adapter,
  public route/CTA, new credentials, cleanup schedule or Publish enabling.
- Added privileged rolled-back pgTAP boundary/collision/replay/expiry/cleanup tests
  and isolated multi-connection create/consume races to Database CI. No gate was
  weakened. Actual migration reset/lint/advisors/pgTAP/concurrency evidence is
  PENDING until committed CI runs; local Docker capacity prevents observation here.
- Local typecheck/lint/tooling/full tests (812 total), three builds, Node syntax
  check for the concurrency harness and diff checks passed. Unchanged application
  results used Turbo cache where appropriate. Exact latest-push remote evidence
  remains PENDING until observed; no CLOSED / VERIFIED or production claim.
- First store push `ee8173dbd51cee6b6bba40454de7f90328d73e84` passed Application,
  all Security scans and Guard. Database reset/lint/error-level advisors, 1,503
  pgTAP assertions across 27 files (79 new) and seven existing races passed.
  New race setup failed because pgTAP's transaction-installed `no_plan()` was
  unavailable on separate Node connections. The isolated concurrency fixture
  now explicitly installs the already available pgTAP extension; no assertions,
  database permissions or production paths were relaxed. New exact-push evidence
  remains required before the durable concurrency claim.
- Next dependency-safe task: exact same-snapshot Published confirmation/binding
  issuance plus concrete server RPC store adapter, and evidence for bounded cleanup
  wiring/clock alignment, before staged public action/HTTP assembly. Browser/live
  provider/cache/abuse/first-Publish gates and S5/S6 closure remain open.

### Autonomous continuation — staged private intent RPC adapter — 2026-10-06

- Clean `work` refreshed to exact `17127f940327191588ac8ae87532c720a00b88c7`.
  All six push-event gates passed: CI 37401010749, Security 37401010787 and
  Guard 37401010652. Database logs confirm 1,503 pgTAP assertions across 27
  files and nine actual races, including both new intent races. This supersedes
  the final-store evidence pending state above, not the original fixture failure.
- Locked 12.29 before code. Added an injected, server-only Supabase RPC adapter
  for strict create acknowledgment, standalone consume and one bounded cleanup
  call. Shared the existing record schema; canonical records, malformed data,
  errors and exceptions fail closed. No mutation retries, fallback persistence,
  credentials, grants, route/CTA, schedule, publication or journey change.
- Targeted adapter/core tests passed: 103 tests (49 new adapter cases). Full
  typecheck, lint, five tooling tests and 856 application tests passed (839 Vitest
  plus 17 native auth-navigation tests). Three production builds and final diff
  checks passed. Exact latest-push gates remain PENDING until
  observed. The actual Supabase SDK also passed POST/schema/parameter and no-retry checks
  with a test fetch; this is not live RPC/browser evidence.
- Existing Database CI supplies unchanged-schema regression. Same-snapshot
  Published confirmation/binding issuance is the next dependency-safe slice;
  actual authorized RPC integration, clock alignment, scheduled bounded cleanup,
  public transport/cache/abuse/origin controls and browser/live-provider gates
  remain open. S5/S6 remain NOT CLOSED / VERIFIED.

### Autonomous continuation — exact Published intent issuance — 2026-10-06

- Refreshed clean `work` to `d029075136d1bd02bebc0134009cd4aa36517efe`.
  All six exact push-event gates passed on that adapter baseline: CI 37423061706,
  Security 37423061823, Guard 37423061697. Database passed 1,503 pgTAP assertions
  and nine actual concurrency tests; this supersedes adapter evidence pending above.
- Locked 12.30 before code. Added a withheld server context RPC selecting the
  exact Published Identity/Product rows for both public confirmation and selected
  provider binding, rechecking same-Owner finalized canonical media and current
  safety. Protected aliases resolve canonical Handle. No private-state fallback.
- Added locator-only private issuance assembly using 12.27 core and 12.29 store,
  with standalone current resolver and durable acknowledgment before returning
  public confirmation plus opaque token. Raw DTO/digest/URL/Owner input denied.
  No grants, credentials, HTTP route/redirect, CTA, schedule, publication or
  journey change. Returned context is not evidence a human viewed the page.
- Targeted tests passed: 131 core/adapter/issuance cases (28 new issuance tests).
  Full typecheck/lint, five tooling tests, 884 application tests
  (867 Vitest plus 17 native auth-navigation) and three builds passed. Final diff
  review and checks passed before commit. New rolled-back database context tests are committed-CI evidence
  PENDING until observed; local Docker capacity remains insufficient. Exact latest
  pushed CI/Security/Guard must pass before an automated verification claim.
- Initial `756b982` push passed Application, all Security scans and Guard.
  Database reset/lint/advisors passed, but the new safety fixture violated the
  existing unsafe-verdict reason constraint after 36 successful new-file assertions.
  Fixture now sets valid reason codes/revisions and clears reasons on recovery.
  Media-denial fixture uses a schema-valid undersized asset instead of a MIME
  value already prohibited by the table constraint;
  no constraint/assertion was weakened. Final exact-push Database evidence remains
  PENDING until observed.
- Next safe dependency work: server/database clock alignment and bounded retention
  scheduling under a new contract, then staged P03 provider-action/HTTP transport
  with cache/abuse/origin controls. Real authorized RPC, browser/provider delivery,
  first-Publish binding/UI, D01 handoff and S5/S6 closure remain open.

### Autonomous continuation — database intent clock primitives — 2026-10-06

- Clean `work` refreshed to exact `496493324fdb7521412bac23d34e095f31cd9034`.
  All six push-event gates passed on the final issuance fixture commit: CI
  37428446588, Security 37428446664, Guard 37428446766. Database reset/lint/
  advisors, 1,553 pgTAP assertions across 28 files and nine real races passed.
  This supersedes the final 12.30 evidence pending state above.
- Locked 12.31 before implementation. Added withheld database epoch RPC and
  strict-record deadline resolver checking database time before/after fresh exact
  destination resolution. Neither helper consumes or authenticates a token;
  future assembly must first commit consumption of the stored record.
- Added bounded read-only SDK calibration with five-second abort/round-trip
  ceiling, separate conservative lower/upper monotonic epoch bounds, permanent
  invalidation after counter rollback/nonfinite values or overflow. No Date.now
  dependency, new credential, grant, route, CTA, scheduler or TTL extension.
- 24 targeted calibration tests passed using actual SDK/fetch fixtures. Typecheck,
  lint, five tooling tests, 908 application tests and all three builds passed.
  Final diff review and whitespace check passed. Rolled-back
  pgTAP includes malformed/future/expired/stale records and a controlled delayed
  resolver proving the final expiry check; actual Database/exact-push evidence
  remains PENDING until observed. Local Docker capacity remains insufficient.
- Initial `7734867` passed Application, all Security scans and Guard. Database
  reset/lint/advisors passed; pgTAP stopped after 35 new-file assertions because
  the expired safety fixture had expiry before its checked-at timestamp. The
  fixture now uses an earlier checked-at value and advances verdict revision on
  expiry/recovery; table constraints and denial assertions remain unchanged.
  Final exact-push Database/CI/Security/Guard evidence remains PENDING.
- Calibration is not wired into existing issuance/core by this bounded slice:
  current clock alignment is still incomplete. Next safe task is a bounded core/
  issuance integration contract using lower time for issuance, upper time for
  deadlines and the database expiry resolver after committed consumption.
  Scheduled retention, real RPC/browser/provider/cache/abuse and S5/S6 remain open.

### Autonomous continuation — calibrated private intent assembly — 2026-10-06

- Clean `work` refreshed to exact `a029b7151d0f802119f1799d9c845e4d57a94691`.
  All six push-event gates passed: CI 37429773966, Security 37429773975,
  Guard 37429773959. Database reset/lint/advisors, 1,595 pgTAP assertions across
  29 files and nine real races passed, superseding the 12.31 pending evidence above.
- Locked 12.32 before code. Private issue/redeem calibrates separately per call,
  with lower issuance timestamp and upper deadline decisions, fixed 120-second
  TTL, no application wall-clock fallback and no cross-operation clock cache.
- Redemption awaits durable consume, then passes only its strict stored record
  to the database expiry-aware resolver and rechecks the upper deadline afterward.
  Denial burns consumed authority without binding-only fallback or restoration.
  Calibration failure before consumption leaves the stored intent untouched.
- 118 targeted tests, typecheck/lint, five tooling tests, 920 application tests,
  all three builds and final diff checks/review passed. Exact latest-push
  CI/Security/Guard evidence remains PENDING until observed.
  SDK fetch fixtures are not live authorized RPC proof.
  No migrations, grants, routes, credentials, scheduler or publication changes.
- Next safe work: bounded retention scheduling under its own JIT contract.
  Real authorized RPC integration, browser action, cache/abuse/origin/provider
  evidence and first-Publish wiring remain open. S5/S6 are NOT CLOSED / VERIFIED.

### Autonomous continuation — inactive bounded retention scheduler — 2026-10-06

- Clean `work` refreshed to exact `b7887ca866d200ebbf8371b2beefd648531731cb`.
  All six exact push-event gates passed: CI 37435260252, Security 37435260217,
  Guard 37435260204, with 1,595 pgTAP assertions and nine real races.
  This supersedes the pending 12.32 evidence above, not S5/S6 journey closure.
- Locked 12.33 before code, following the existing 12.4 Supabase Cron decision.
  Migration registers one inactive minute-cadence postgres job and a withheld
  tick: transaction try-lock, one 500-expired-intent cleanup, at most 500 own
  terminal cron history records older than seven days. No application-role grants,
  HTTP/provider/credentials, TTL extension or publication/private-state changes.
- Rolled-back pgTAP covers bounded remainder cleanup, unexpired/recent/running/
  null-end-time/unrelated preservation and inactive configuration. CI adds real
  multi-connection lock competition and temporary isolated cron activation with
  successful run/deletion observation, always restoring inactive minute cadence.
  These database/runtime results are PENDING until observed; local Docker capacity
  remains insufficient. Typecheck/lint, five tooling tests, 920 application tests,
  three builds, Node syntax validation and final diff checks/review passed.
  Unchanged application gates reused the verified Turbo cache where applicable.
- This is an inactive scheduler foundation, not guaranteed production retention.
  Controlled activation, minute-cadence observation, capacity versus abuse limits
  and monitoring remain gates before public intent issuance. Next independent
  safe task: bounded staged HTTP/action boundary with no-store/origin/abuse checks,
  no public routes/grants until all transport/provider gates are met. Real authorized
  integration, browser/provider/publication and S5/S6 closure remain open.

### Autonomous continuation — unmounted request boundary — 2026-10-06

- Clean `work` synchronized to exact `19cce5ef99ea919b1a7d121aaefb36108805092d`.
  Exact push-event CI 37436124962, Security 37436124910 and Guard 37436124896
  passed, including 1,616 pgTAP assertions, nine existing races, retention lock
  competition and actual isolated cron execution/deletion with inactive restoration.
  This supersedes 12.33 pending evidence, not production scheduler activation.
- Locked 12.34 before code. Unmounted request helper requires configured exact
  HTTPS origin, POST JSON, matching Origin/URL/optional Host, safe request metadata
  and one literal-true action-specific permit acknowledgment with five-second limit.
- Streamed JSON enforces 4,096 actual bytes, bounded framing/read duration,
  declared length equality, strict UTF-8, cancellation and uniform null denial.
  Returned unknown JSON is not validated context or authority. Fresh no-store
  headers and generic unavailable response expose no redirect/CORS/private detail.
- 45 targeted tests, typecheck/lint, five tooling tests, 965 application tests,
  three builds and final diff review/checks passed. No database behavior changes.
  Latest exact-push CI/Security/Guard evidence remains PENDING until observed.
- No concrete limiter/provider/client-identity inference, credential, route,
  core/store invocation, browser change, grant, scheduler activation or publication.
  Next safe task: strict locator/token DTO and private HTTP/core assembly under
  its own contract, retaining injected fail-closed distributed permit dependency.
  Actual trusted identity/Upstash integration, browser/cache/CDN, retention
  activation/capacity/monitoring/provider and S5/S6 closure remain open.

### Autonomous continuation — private HTTP/core assembly — 2026-10-06

- Clean `work` synchronized to `f240742c91ccc0a1d27167c7ffd6ed642575e74a`.
  Exact push-event [CI 37462353637](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37462353637),
  [Security 37462353655](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37462353655)
  and [Guard 37462353664](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37462353664)
  passed all six jobs. Database evidence includes 1,616 pgTAP assertions,
  nine existing races, retention lock competition and actual isolated cron execution.
  This supersedes 12.34 pending evidence without enabling public transport.
- Locked 12.35 before code. Unmounted HTTP assembly uses strict locator-only
  issuance and canonical token/context redemption, the 12.34 request guard and
  internally constructed 12.32 calibrated private issuance. Exact Published
  confirmation/token returns only after durable creation; exact original Location
  returns only after committed consume and fresh deadline/safety resolution.
- Uniform no-store/no-referrer unavailable truth covers malformed input, rejected
  permits, SDK failures, aborted requests, core deadline stalls and unsupported
  Location encoding. Consumed authority is never restored or retried.
- 74 targeted tests, typecheck/lint, five tooling tests, 994 application tests,
  three builds and final diff review/checks passed. Initial typecheck caught an
  optional RequestInit signal in the test helper; corrected without weakening gates.
  No migration/database behavior changes. Latest exact-push CI/Security/Guard
  evidence remains PENDING until observed.
- No route, credential, grant, distributed limiter, browser navigation, scheduler
  activation or publication enabled. Next safe task: staged exact confirmation /
  explicit selected-provider browser action assembly after refreshing its authority.
  Actual privileged transport, trusted identity/Upstash, browser/cache/CDN,
  retention activation/capacity/monitoring and live provider/publication evidence
  remain open. S5/S6 are NOT CLOSED / VERIFIED.

### Autonomous continuation — native POST redemption — 2026-10-06

- Clean `work` synchronized to `50d6569c98bab9aed8701d1afe9662ac9032893d`.
  Its exact push-event [CI 37463408221](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37463408221),
  [Security 37463408298](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37463408298)
  and [Guard 37463408277](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37463408277)
  passed all six jobs, including 1,616 pgTAP assertions, nine existing races,
  retention lock competition and actual isolated cron execution. This supersedes
  12.35 pending evidence, not live/browser/public-enablement proof.
- Locked 12.36 before code: native forms need a separate URL-encoded POST target
  for top-level 303 navigation. Shared preflight/permit/byte/deadline protections
  remain intact; JSON issue/redeem still reject form bodies.
- Strict four-field decoding rejects decoded duplicate names, private/raw URL
  authority, malformed percent UTF-8, ambiguous framing and noncanonical references.
  Unmounted redeemForm uses the same calibrated consume/fresh resolution and exact
  original Location/no-store/error truth, always selecting the redeem permit.
- 131 targeted tests, frozen install, typecheck/lint, five tooling tests,
  1,051 application tests, three builds and final diff review/checks passed.
  No database behavior changes. Latest exact-push CI/Security/Guard evidence
  remains PENDING until observed.
- No route, form UI, automatic submission, credential, grant, distributed limiter,
  publication or production scheduler change. Browser navigation/confirmation,
  actual privileged RPC/identity/limiter, CDN/cache, retention capacity/monitoring
  and live provider/publication evidence remain open; S5/S6 are NOT CLOSED / VERIFIED.
  Next safe dependency: exact confirmation and provider-action form assembly under
  its own contract, preserving one-provider CTA / multi-provider chooser and no
  automatic outbound action.

### Autonomous continuation — confirmation/provider form presentation — 2026-10-06

- Clean `work` synchronized to `4bd784c446999e9a8cd40f7452584a1891c43573`.
  Independent presentation continued while Database infrastructure prepared;
  all six exact push-event gates subsequently passed:
  [CI 37464290466](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37464290466),
  [Security 37464290451](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37464290451),
  [Guard 37464290566](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37464290566).
  Database: 1,616 pgTAP assertions, nine existing races, retention lock competition
  and actual isolated cron execution. This supersedes 12.36 pending evidence.
- Reread pinned P03 and J2/J4/J6/J9; locked 12.37 before code. Separate unmounted
  renderer validates strict confirmation/intents and preserves recognition first,
  saved provider order, single direct CTA / direct multiple choices, structured
  provider labels, partial/all unavailability and internal navigation.
- Native forms post only canonical public locators and opaque tokens to fixed
  same-origin /actions/product-click. No destination URL, private binding, GET
  token query, script, automatic submission or provider-ranking claim is emitted.
  Invalid/private bundles deny generically; valid alternatives remain actionable.
- 77 targeted tests, typecheck/lint, five tooling tests, 1,072 application tests,
  three builds and final diff review/checks passed. SDK-fixture issuance → SSR
  hidden fields → private native redemption/replay passed; this is simulated
  request/rendering evidence, not actual browser or live provider evidence.
  No database behavior changes. Latest exact-push CI/Security/Guard is PENDING
  until observed; S5/S6 remain NOT CLOSED / VERIFIED.
- No route, grant, credential, publication or provider/scheduler activation.
  Next safe dependency: bounded snapshot-consistent multi-provider issuance /
  confirmation bundle assembly, before mounting any public renderer or action.
  Actual privileged RPC/identity/distributed limiter, browser/CDN/cache,
  retention activation/capacity/monitoring and provider/publication gates remain open.

### Autonomous continuation — snapshot-bound confirmation bundle — 2026-10-06

- Clean `work` synchronized to `919efbe535b6e21224ec3b2833e80e11e3a2bc0c`.
  Exact push-event [CI 37464919554](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37464919554),
  [Security 37464919453](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37464919453)
  and [Guard 37464919482](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37464919482)
  passed all six jobs, including 1,616 pgTAP assertions, nine existing races,
  retention lock competition and actual isolated cron execution. This supersedes
  12.37 pending evidence without claiming live/browser/public enablement.
- Locked 12.38 before code. Locator-only bundle reads existing withheld projection
  and private provider contexts, chooses trusted anchor confirmation and checks
  identical publication token, recognition and provider order before any create.
  Changed snapshot returns recognition without mixed intents; per-provider
  unavailable/error/fresh-safety/create failure preserves independent alternatives.
- All issued records hash the same exact anchor confirmation. A shared calibrated
  core constructor preserves existing single-provider issue/redeem behavior;
  bundle calibrates once per operation and rechecks final conservative expiry.
  Ten-second deadline stops later work/creates; already in-flight writes may commit
  without returning a token and remain subject to existing expiry/retention.
  Maximum work is 32 RPCs; future distributed transport must budget bundle work.
- Frozen install, 115 targeted tests, typecheck/lint, five tooling tests,
  1,104 application tests, three builds and final diff review/checks passed.
  Actual SDK fixtures prove two-provider bundle → SSR forms → native redemption /
  replay denial and exact creator URLs. Fixtures are not live RPC/browser evidence.
  No migration/database behavior changes. Exact push-event Application/Database and Guard passed on
  `e4c57b9730e61650636f796f2e7032ca526ae8d8`; Secret Scan and SAST passed.
  Dependency Scan failed on newly reported High `GHSA-wq5f-xc86-pv6w`
  (`sharp@0.35.4`, fixed in `0.35.5`). S5/S6 are NOT CLOSED / VERIFIED.
- No route, grant, credential, provider activation, publication or scheduler change.
  Next safe task: guarded strict locator-only private HTTP bundle response assembly
  under a bounded contract, retaining origin/no-store and required distributed permit.
  Actual identity/limiter/privileged RPC, browser/CDN/cache, retention activation /
  capacity/monitoring and live provider/publication gates remain open.

### Autonomous verification fix — patched image decoder — 2026-10-06

- Exact bundle push evidence: [CI 37477549620](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37477549620)
  passed Application and Database (1,616 pgTAP assertions / 30 files, nine existing
  races, retention lock competition and real isolated cron runtime).
  [Guard 37477549603](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37477549603)
  passed. [Security 37477549598](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37477549598)
  passed Secret Scan/SAST but failed Dependency Scan on High GHSA-wq5f-xc86-pv6w.
- Patched the direct media-sanitizer decoder from sharp 0.35.4 to 0.35.5 and
  regenerated the lockfile with its matching binaries/libvips 1.3.4. Existing
  12.4 patch/security and 12.11 media-processing authority applies; no new product
  semantics or JIT contract is needed for this dependency patch. No scan exemption,
  route/grant, credential, production or provider configuration change.
- Frozen install, 32 targeted sanitizer tests, typecheck/lint, five tooling tests,
  1,104 application tests, three builds and final diff review/checks passed.
  Exact latest-push CI/Security/Guard is PENDING until observed. S5/S6 remain
  NOT CLOSED / VERIFIED; private HTTP bundle assembly is still the next safe task.

### Autonomous continuation — private HTTP confirmation bundle — 2026-10-06

- Clean work synchronized to patch baseline
  `9eda271bef2dfce44ac5b87be8781b779366018f`; exact push-event Security
  (37509461475) passed all three scans, including the repaired sharp finding,
  and Guard (37509461405) passed. CI (37509461382) remained in progress at readback.
- Locked 12.39 before code. Separate unmounted issueBundle handler uses existing
  exact-origin POST JSON / body / literal-true permit gates, then accepts only
  handle/reference and internally assembles the 12.38 trusted snapshot bundle.
  Provider/token/private authority injection is denied before RPC. Fresh no-store
  headers apply to success/denial; recognition-only bundles remain valid 200,
  errors/timeouts/aborts fail uniformly without Location or private error data.
- Actual SDK fixtures exercise guarded HTTP → exact SSR confirmation/provider
  forms → independent native redemption/replay, partial/all-unavailable bundles,
  locator injection, wrong origin, nonliteral permit, abortion and timeout.
  Existing single-provider and request/core semantics are unchanged.
- 91 targeted tests, typecheck/lint, five tooling tests, 1,120 application tests,
  three builds and final diff review/checks passed. Latest exact-push evidence
  remains PENDING until observed; no database behavior change or migration.
- No route/grant/credential/provider/production change. S5/S6 NOT CLOSED / VERIFIED.
  Next safe task: inspect and lock a bounded private distributed action/work-budget
  adapter under 12.4 (Upstash), with injected trusted client identity, fail-closed
  denial and bundle work accounting. Do not configure a live provider or mount
  routes before required privileged/identity/limiter/browser/cache/retention gates.

### Autonomous continuation — atomic distributed click budgets — 2026-10-06

- Clean work synchronized to `5172aeab9dd29a2db262812744d3b245274e7ea6`.
  Exact push-event [CI 37509798120](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37509798120),
  [Security 37509798025](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37509798025)
  and [Guard 37509798067](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37509798067)
  passed all six jobs. Database logs proved 1,616 pgTAP assertions, nine existing
  races, retention lock competition and actual isolated cron execution. This
  supersedes pending 12.39 evidence, without closing S5/S6 or public enabling.
- Locked 12.40 before code. Private permit requires explicit server-selected
  operation, bounded deployment policy, trusted opaque client subject and injected
  atomic Redis EVAL transport. No default capacity, memory fallback or header/IP trust.
  Issue/bundle share an action counter; redeem has its own, all share work capacity.
  Work upper bounds are 4/32/3 RPCs for issue/bundle/redeem. Two keys share a
  cluster hash slot and use hashed partitioning without raw subject or intent data.
- Redis TIME / atomic Lua checks both budgets before consuming either, bounds TTL,
  resets fixed windows and denies malformed state/backward stored server time.
  Fixed-window adjacent bursts are explicit; deployment capacity remains an open
  gate. Two-second identity/EVAL and monotonic checks deny errors/abort/late grants
  without retry/refund; no EVAL starts after a late identity resolution.
- Added required isolated Redis runtime tests to web tests/Application CI.
  27 targeted unit and six actual local Redis tests passed, including competing
  grants, shared work, TTL/reset and corrupt/future-clock state denial. Redis is
  private to a temporary Unix socket with persistence/TCP disabled; tests do not
  use production services. CI provisions its isolated Redis test runtime.
- Frozen install, typecheck/lint, five tooling tests, 1,153 application/runtime tests,
  three builds and final diff review/checks passed. Latest exact-push evidence is
  PENDING until observed. No database migration or provider credential change.
- S5/S6 NOT CLOSED / VERIFIED. Next safe task: lock and stage a bounded private
  Upstash REST EVAL transport with injected server credentials, exact configured
  HTTPS service origin, no redirects/retries and strict bounded response parsing;
  use fixtures without live credentials or provider activation. Actual Upstash
  EVAL/TIME/TTL/cluster compatibility, trusted deployment identity/approved capacity,
  browser/cache/provider/publication/retention gates still block public enabling.

### Autonomous continuation — bounded private Upstash EVAL — 2026-10-06

- Clean work synchronized to `f3e00e5616aad8511b4eb4e62b3ed31349e0e5ae`.
  Exact push-event [CI 37511084740](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37511084740),
  [Security 37511084695](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37511084695)
  and [Guard 37511084767](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37511084767)
  passed all six jobs. Application CI actually ran six isolated Redis tests;
  Database CI passed existing migration/security/pgTAP/concurrency/cron gates.
  This supersedes 12.40 pending evidence, not live Upstash/identity or public enabling.
- Locked 12.41 before code after public @upstash/redis 1.39.0 source readback
  confirmed POST JSON EVAL/Bearer/result protocol. No new SDK dependency.
  Server-only adapter requires injected exact HTTPS Upstash service origin,
  namespace and bounded Bearer token; no environment reads or actual provider call.
- Confines invocation to the exact 12.40 script, same-slot namespace/digest
  action/work keys and canonical bounded matching work arguments. No arbitrary
  command, endpoint, redirects or retries. Token stays in Authorization only.
  Whole response has 1.5-second abort/monotonic deadline, 4,096 decoded-byte /
  4,097-read bounds, strict framing/UTF-8 and one literal numeric result key.
  Error/status/duplicate/private/late responses deny without leaking or retrying;
  abandoned bodies are cancelled without waiting for cancellation completion.
- 68 targeted tests (41 REST / 27 permit), six isolated Redis tests, frozen install
  from unchanged dependency baseline, typecheck/lint, five tooling tests, 1,194
  application/runtime tests, three builds and final diff review/checks passed.
  Fixtures integrate trusted subject → permit → exact REST EVAL → literal grant /
  denial. Latest exact-push evidence remains PENDING until observed.
- No route/grant/provider/credential configuration, migration or production change;
  S5/S6 NOT CLOSED / VERIFIED. Next safe task: lock private handler-specific
  HTTP/permit composition so bundle always budgets 32 and issue/redeem 4/3, with
  injected trusted identity/policy/transport; verify full SDK/REST fixture flow.
  Initial 12.41 SAST identified dynamic RegExp construction; replaced it with a
  static bounded regex plus explicit namespace equality, with no suppression/rule change.
  Redis runtime tests remain a separate mandatory Application CI command, preserving
  native Windows pnpm test without requiring a Unix Redis binary; no silent skip.
  Actual provider EVAL/TIME/replication/TTL/cluster compatibility, approved capacity
  and trusted deployment identity/browser/cache/retention/publication gates remain open.

### Autonomous continuation — private budgeted HTTP composition — 2026-10-06

- Clean work synchronized to `345953dfb3bfdd040b37ba0abdfd0ff76d36d803`.
  Exact push-event [CI 37512049348](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37512049348),
  [Security 37512049379](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37512049379)
  and [Guard 37512049256](https://github.com/nafisajuliansahsaputra/spall-spill/actions/runs/37512049256)
  passed all six jobs, including the corrected SAST gate, six actual Redis tests
  without skips, 1,616 pgTAP assertions, nine races and retention lock/cron runtime.
  This supersedes pending 12.41 evidence, not live provider/identity/public enabling.
- Locked 12.42 before code. Separate unmounted factory requires trusted policy,
  subject resolver, Redis transport, server Supabase client and application origin.
  Internally composes only the correctly budgeted issue/bundle/redeem handlers;
  server-selected costs are 4/32/3, with no caller operation or permissive permit.
  Native and JSON redemption share the redeem permit; all requests get fresh
  decisions and share existing namespace/subject work state, without cached grants.
- Actual SDK/REST fixtures exercise bundle → exact SSR forms → two independent
  native provider redemption/replay and single issue → JSON redemption, preserving
  exact original URLs. Failed budgets/origin/missing policy/subject/transport
  prevent RPC. Caller cost injection cannot lower bundle cost; invalid DTO may
  conservatively spend capacity but performs no RPC or refund.
- 171 targeted tests, typecheck/lint, five tooling tests, 1,200 application tests,
  six isolated Redis tests, three builds and final diff review/checks passed.
  Latest exact-push CI/Security/Guard evidence remains PENDING until observed.
- No migration, route/grant, credentials, provider or production changes. S5/S6
  NOT CLOSED / VERIFIED. Next safe task: audit and lock bounded trusted-source
  network identity canonicalization / opaque subject derivation under 12.4,
  requiring injected trusted runtime metadata and server key, without reading
  arbitrary forwarded headers or treating hashing as proof of trust. Actual
  upstream identity provenance, live Upstash compatibility/capacity, browser/cache,
  retention activation and provider/publication evidence remain open enabling gates.

### Autonomous continuation — private trusted-network budget subject — 2026-10-06

- Clean work synchronized to `27c54db8ff8a45df9d7ea72aa81821a13231f15c`.
  Exact push-event CI 37513153112, Security 37513153120 and Guard 37513152998
  passed all six jobs, 1,616 pgTAP assertions, nine races and isolated retention
  lock/cron runtime. This supersedes pending 12.42 automated evidence only.
- Locked 12.43 before code. Unmounted server-only resolver takes an injected
  trusted metadata reader, bounded namespace and copied 32–64 byte HMAC key.
  Bare IPv4/IPv6 literals only; normalize IPv6 equivalence and collapse mapped
  IPv6 to IPv4, preserving all other address bits. Return only domain-separated
  base64url HMAC; never read forwarded headers or log/persist raw addresses.
- Fresh reads, malformed/extra metadata, reader errors, abortion and 500 ms
  monotonic timeout fail closed. No cached subject, retry or permissive fallback;
  canonical subjects share existing distributed work keys, absent identity never
  reaches Redis. No follower account required; hashing is not provenance proof.
- Latest exact-push CI/Security/Guard evidence remains PENDING until observed.
  No dependency/migration/route/grant/credential/provider/production changes.
  75 targeted tests (48 new subject cases and 27 budget regressions), 1,248
  application tests, six isolated Redis tests, five tooling tests, typecheck/lint,
  three builds and final diff review/checks passed. Fixtures are not live evidence.
  S5/S6 NOT CLOSED / VERIFIED. Next safe task: audit authoritative runtime client
  metadata provenance and lock a bounded deployment-source adapter if evidence
  supports it; never substitute arbitrary headers for source attestation.
  Actual runtime trust, live Upstash/capacity/browser/cache, retention activation
  and provider/publication evidence remain open enabling gates.

### Autonomous continuation — private network-subject HTTP composition — 2026-10-06

- Clean work synchronized to `7265f27991458d04d318fe52ca8995736670764f`.
  Exact push-event CI 37545813408, Security 37545813258 and Guard 37545813134
  passed all six jobs, six Redis tests without skips, 1,616 pgTAP assertions,
  nine races and isolated retention lock/cron runtime; 12.43 automated evidence
  superseded, without closing deployment provenance or other enabling gates.
- Read back [Vercel SDK headers source at 2cace21](https://github.com/vercel/vercel/blob/2cace21c4b65057822dd2fbec39dc5fcc62e05d0/packages/functions/src/headers.ts):
  ipAddress() reads x-real-ip; this getter is not deployment sanitization proof.
  Header-source adapter path remains withheld. Continue independent private work.
- Locked 12.44 before code. Separate unmounted factory composes 12.43 and 12.42
  with required server key/runtime reader and copied budget policy. Subject and
  Redis namespaces stay bound despite unchecked override or external mutation.
  No caller identity, independent namespace, permissive fallback or account gate.
- Actual SDK/REST/runtime/SSR fixtures verify fresh reads and shared work keys
  through bundle/form/native independent provider redemption/replay and single
  issue/JSON redemption. Origin-first, missing dependencies, invalid metadata,
  exhausted budget and late reader all deny before RPC. Costs remain 4/32/3.
- Latest exact-push CI/Security/Guard evidence remains PENDING until observed.
  No dependency, migration, credential, route/grant, provider or production changes.
  233 targeted tests, 1,262 application tests, six isolated Redis tests, five
  tooling tests, typecheck/lint, three builds and final diff review/checks passed.
  S5/S6 NOT CLOSED / VERIFIED. Next safe task: audit/lock bounded isolated browser
  confirmation and native-form verification using owned fixtures, without live
  credentials, public enabling or claiming deployed provider/cache evidence.
  Upstream trusted metadata provenance, live Upstash/capacity/browser/cache,
  retention activation and provider/publication gates remain open.


## Isolated Product browser fixture evidence — 2026-10-07

- Continued clean baseline `61cccf6f30f908a193c57290c6677f70b2810825`.
  Exact push CI 37546489491, Security 37546489008 and Guard 37546489004
  passed all six jobs, including 1,616 pgTAP assertions, nine races and isolated
  retention lock/cron runtime. This supersedes 12.44 pending automated evidence.
- Locked 12.45 before test implementation. Real headless Chromium 151.0.7922.173
  uses actual SSR components and production-build CSS, actual Supabase SDK with
  injected RPC/metadata/Redis fixtures, ephemeral profile and bounded loopback CDP.
  Page requests are intercepted before network; provider navigation/favicon and
  image responses are owned stubs. No marketplace/provider/database contacted.
- Two browser tests observed confirmation before saved-order provider choices,
  zero initial POST/outbound navigation, browser-generated same-origin native POST
  with four exact fields, one-use consume, exact attribution-preserving 303 and
  no-store 403 replay denial; recognition-only state has no marketplace forms.
  Native mouse input scrolls the actual styled button into view. Tests initially
  exposed absent production CSS in the fixture; loading built CSS fixes the
  fixture rather than changing product behavior or weakening the assertion.
- Separate browser command is mandatory after production build in Application CI;
  missing browser/build CSS fails, no skips or new dependencies. Default unit
  command remains unchanged, including Windows compatibility.
- Local 1,262 application tests, two Chromium tests, six actual Redis tests without
  skips, five tooling tests, typecheck/lint and three builds passed. Final diff
  review/checks passed. Latest exact-push CI/Security/Guard remains PENDING until
  observed. No route/grant, migration, credential, provider or production change.
- First 12.45 push `15220e17f139672b225b9cae93abb72ae7d7e654` passed Security
  and Guard but Application CI 37551279923 exposed ENOTEMPTY during profile
  cleanup with Chrome 154. Isolated fixture now launches its own POSIX process
  group, terminates its renderer/utility children and uses bounded filesystem
  retries only for its own temporary profile. No assertion or gate is relaxed.
  Replacement exact-push evidence remains PENDING until observed.
- S5/S6 NOT CLOSED / VERIFIED. Chromium interception is not live TLS/CDN/cache,
  provider reachability, production browser hardening or trusted metadata provenance
  evidence. Next safe task: audit remaining bounded browser denial/journey cases
  against J6 and pinned P03 before locking another fixture-only contract; public
  enabling still requires actual provider/provenance/capacity/retention gates.


## Isolated native-browser denial evidence — 2026-10-07

- Refreshed clean workspace to `7b3ac7a5e039f86327357a4d64a9200cbb0ffd04`.
  All six exact push-event jobs passed: CI 37551550595, Security 37551550597,
  Guard 37551550705. Application observed both browser scenarios in Google Chrome
  154.0.8037.97; Database observed 1,616 pgTAP assertions, nine races and isolated
  retention lock/cron. This supersedes 12.45 pending automated evidence.
- Locked 12.46 before extending owned fixtures. Three actual Chromium native POST
  scenarios deny browser-edited provider context, server-fixture expiry beyond
  120,000 ms, and denied redemption budget. Every denial has no-store/no-referrer
  403, no Location and zero marketplace requests; another explicit click still
  cannot replay consumed fixture authority or fall back to a sibling provider.
- RPC traces distinguish clock/consume before context/expiry denial from budget
  denial before all SDK calls. Context/expiry consume only the selected record;
  sibling record is untouched. Budget denial retains both unconsumed records.
  Costs remain 32/3/3. No production validator, clock, consume, permit or renderer
  behavior changes; fixture clock/Redis/records are not live-provider/database proof.
- Five Chromium cases, 1,262 application tests, six actual Redis tests, five tooling
  tests, typecheck/lint and three builds passed locally; final diff checks/review
  passed. Exact latest-push CI/Application/Database/Security/Guard remains PENDING
  until observed. No dependency, migration, route/grant, credential or deployment.
- S5/S6 NOT CLOSED / VERIFIED. Next safe task: lock bounded Chromium single-provider
  and partially degraded provider-choice evidence from J6/P03; retain recognition,
  exact attribution and absence of a redundant one-choice chooser. Live provider,
  trusted metadata provenance/capacity, TLS/CDN/cache, retention activation and
  firstPublish/public enabling remain separate open gates.


## Isolated single/degraded provider browser evidence — 2026-10-07

- Clean workspace synchronized to `cfec3f4d4cc3df733648c5991ca23dd1f36aa5a0`.
  All six exact push-event jobs passed: CI 37570605365, Security 37570605502,
  Guard 37570605477. Chrome 154.0.8037.57 passed all five browser scenarios;
  Database passed 1,616 pgTAP assertions, nine races and retention lock/cron.
  This supersedes 12.46 pending automated evidence.
- Locked 12.47 before fixture code. Actual private SDK/bundle output feeds real
  SSR/production CSS/Chromium for one saved provider, unavailable first provider,
  and denied first-provider durable create. Each shows Product recognition and
  exactly one direct provider CTA with no redundant chooser; partial failures
  retain the existing unavailable message and only the usable provider's intent.
- Native mouse input is required before the sole form POST. Actual handler
  consumes that selected fixture record, returns exact original affiliate URL
  303/no-store/no-referrer, and only that provider's intercepted navigation occurs.
  Browser outbound request omits Referer. Costs remain 32/3; no implicit fallback,
  initial POST/navigation, invented authority or contact with real providers.
- Eight browser cases, 1,262 application tests, six actual Redis tests, five tooling
  tests, typecheck/lint and three builds passed locally; final diff review/checks
  passed. Latest exact-push CI/Security/Guard remains PENDING until observed.
  No production renderer, validator, route/grant, migration, dependency, credential,
  publication or provider configuration changed. S5/S6 NOT CLOSED / VERIFIED.
- Next safe task: audit J6/12.19 public-route ingress dependencies and lock an
  unmounted exact-reference normalization / Product-or-Resource dispatch slice if
  canonical authority supports it, preserving exactness and no public grants.
  Live provider/provenance/capacity/TLS/CDN/cache/retention activation and
  firstPublish/public enabling gates remain open; fixtures are not deployed proof.


## Private exact-reference locator prerequisite — 2026-10-07

- Refreshed clean workspace to `b82b741e0d17b9e3502189446cc0e478618a9a17`.
  All six exact push-event jobs passed: CI 37571125173, Security 37571125186,
  Guard 37571125185. Chrome 154.0.8037.97 passed eight browser cases; Database
  passed 1,616 pgTAP assertions, nine races and isolated retention lock/cron.
  This supersedes pending 12.47 automated evidence.
- Audited J6, pinned P02/P03, 12.19 and current locator/projection/transport code.
  Locked 12.48 before source. Separate unmounted server-only parser accepts only
  string handle/reference, normalizes 27 and #27 identically and reuses existing
  requested-Handle/canonical safe-integer reference schemas. It does not classify
  arbitrary keyword input, resolve current Owner/alias/type, fetch data or navigate.
- Strict fields/types, canonical numeric framing/range, no coercion/trim/URL decode,
  hostile getter/proxy denial and caller immutability passed 63 targeted tests.
  No neighbor/fuzzy/provider fallback, private/raw-URL authority or public enabling.
- Local 1,325 application tests, eight Chromium cases, six actual Redis tests,
  five tooling tests, typecheck/lint and three builds passed; final diff review /
  checks passed. Exact latest-push CI/Security/Guard remains PENDING until observed.
  No SQL/migration/grant/credential/provider/dependency/publication change.
- S5/S6 NOT CLOSED / VERIFIED. Next safe task: audit/lock Published exact-match
  type/visibility resolution using J6, pinned P02/P04 and 12.19/12.24 before private
  SDK dispatch; do not guess Resource degradation semantics or mount routes.
  Provider/provenance/capacity/TLS/CDN/cache/retention activation and firstPublish
  enabling still require their separate committed evidence gates.

## Published Resource context prerequisite — 2026-10-07

- Refreshed clean Cloud `work` to `3454591fa3578a73b6a3de8e6a790eef068387d0`.
  All six exact push-event gates passed: CI 37571553523, Security 37571553544,
  Guard 37571553530. Database passed 1,616 pgTAP assertions, nine concurrency
  cases and isolated retention lock/cron; this supersedes pending 12.48 evidence.
- Audited J6/J8/J9, pinned P02/P04 decision 18, 12.14/12.18/12.19/12.24 and
  source/migrations/tests. Locked 12.49 before source: add a separate withheld
  `resolve_public_resource_context` reader; preserve the 12.19 safe-source reader.
- Exact same-Owner Published Identity/Resource recognition survives missing,
  pending/review/blocked/expired/hash-mismatched source verdicts. URLs are masked
  unless exact fresh-safe; recovery preserves original attribution and reference.
  Private Working source/type/title repairs never become public or fallback.
- Strict public DTO accepts only explicit Resource semantics and bounded context;
  shared destination policy rejects unsafe/noncanonical URLs without rewriting.
  47 targeted DTO tests and full 1,372 application tests, eight Chromium fixtures,
  six actual Redis tests, five tooling tests, typecheck/lint/three builds and diff
  checks passed locally. Initial test-only union typing error was corrected.
- First push `3fa35956b9dec0c61905e4068b792cf019b13fc7` passed Application,
  all three Security jobs and Guard. Database reset/lint/advisors passed, but the
  new pgTAP fixture violated `external_destination_pending_shape` by retaining
  verdict metadata during a pending transition. The fixture now clears metadata
  for pending and restores it for review; no production constraint/gate changed.
  Reverification targets the exact corrected push, not this failed predecessor.
- Added 65 pgTAP assertions for grants, role/alias equality, ownership/type/range,
  lifecycle/minimum fields, degradation/recovery, private isolation and no writes.
  Migration reset/lint/security advisors/pgTAP/concurrency/retention are delegated
  to committed isolated CI; latest exact-push gates remain PENDING until observed.
- No public/private table grant, firstPublish, renderer, Resource Open, dispatch,
  route, provider/credential/dependency/production change. S5/S6 NOT CLOSED /
  VERIFIED; deployed browser/provider/provenance/cache/capacity gates remain open.
- Next safe slice after required evidence: audit/lock a private exact Published
  Item type resolver and SDK dispatch using 12.48/12.49/12.24, with no fuzzy,
  neighboring reference, cross-Owner or newer private fallback; do not mount routes.

## Exact Published Item resolution prerequisite — 2026-10-07

- Refreshed the clean Cloud lane to `1aa03fa897313a9e653384a28407756f14d6cc60`.
  All six exact push-event gates passed: CI 37575974247, Security 37575974249,
  Guard 37575974321. Database passed 1,681 pgTAP assertions across 31 files,
  nine real concurrency cases and two isolated retention checks. This supersedes
  pending 12.49 evidence and its failed predecessor fixture.
- Locked 12.50 before coding after refreshing J6/J8, pinned P02/P03/P04 and
  12.13/12.24/12.48/12.49. The withheld resolver selects immutable same-Owner
  reference/type binding and dispatches only the matching Published reader.
  Missing/private/hidden/invalid context returns uniform unavailable without
  cross-type, neighboring reference, newer Working or cross-Owner fallback.
- Strict tagged DTO and unmounted server-only SDK accept only the exact locator,
  call one RPC, retain authoritative alias context and exact reference, and keep
  operational null separate from unavailable. Fixed five-second client deadline,
  strict parsing and AbortSignal ignore late responses without retry or logging.
- All 41 new SDK/schema tests passed using the pinned client with mocked fetch;
  no live/provider credential claim. Full 1,413 application tests (1,132 web),
  five tooling tests, six actual Redis tests, eight Chromium fixtures, typecheck,
  lint, three production builds and diff checks passed locally.
- Added 32 pgTAP assertions across the existing Product/Resource suites. Isolated
  committed CI must verify migration reset/lint/security advisors/pgTAP, nine
  concurrency cases and retention. Exact latest-push CI/Security/Guard evidence
  remains PENDING until observed; no CLOSED / VERIFIED claim is made here.
- No public/RPC grant, route, renderer, outbound, publication, provider, credential,
  dependency or production enabling. S5/S6 NOT CLOSED / VERIFIED.
- Next safe slice after required evidence: audit pinned P04 and lock a bounded
  unmounted Resource recognition renderer, preserving Published degradation and
  semantic context while keeping Resource Open/public-route assembly withheld.

## Published Resource recognition prerequisite — 2026-10-07

- Clean Cloud baseline `9e5e6bffa265f1c9a6c2a0615ac09290fdcc35be` passed all
  six exact push-event gates: CI 37600188252, Security 37600188096, Guard
  37600188162. Database passed 1,713 assertions across 31 files, nine real
  concurrency cases and two retention checks. Pending 12.50 evidence is superseded.
- Refreshed J6/J8, 12.49/12.50/12.25, canonical Resource labels, existing renderer
  tests and pinned P04 regions A–D/decision 18. Locked 12.51 before source.
- Unmounted strict Published Resource renderer preserves Owner/current Handle,
  reference, semantic type, title and intentional decorative type fallback.
  Source degradation retains recognition/internal navigation with textual status;
  read-time safe sources still emit no outbound URL or fake active/disabled CTA.
  Private/malformed/unavailable input gives identical generic denial. No fabricated
  optional fields, source-host inference, iframe, download, fetch or mutation.
- All 27 new SSR tests passed. Full 1,440 application tests (1,159 web), five
  tooling/six actual Redis/eight existing Product Chromium fixtures, typecheck,
  lint, three builds and diff checks passed locally. Product fixture results are
  regression evidence, not Resource browser/responsive or live-source evidence.
- No database/migration/grant/dependency change; all exact latest-push automated
  gates, including existing Database CI, remain PENDING until observed. No public
  route, Resource Open, publication, provider or production enabling. S5/S6 and
  full P04 NOT CLOSED / VERIFIED.
- Next safe slice: audit and lock bounded exact Published Resource click-time
  source resolution/transport prerequisites under J8 and safety authority before
  source-action or public-route assembly. Preserve one semantic source action,
  creator attribution and current Published visibility with no private fallback.

## Published Resource source-resolution prerequisite — 2026-10-07

- Clean Cloud baseline `d71ac3029a05ee13f3457040f5af44775e84f54f` passed all
  six exact push-event gates: CI 37601075570, Security 37601075575, Guard
  37601075581. Database passed 1,713 assertions across 31 files, nine real
  concurrency cases and both retention checks. Pending 12.51 evidence is superseded.
- Refreshed J6/J8, 12.49–12.51/12.26, pinned P04 and source/migration/test
  authority. Locked 12.52 before source; CLI-created the additive migration.
- Withheld exact Resource source resolver requires both Published Identity/Resource
  row digest and exact original source hash. Final SELECT independently rechecks
  eligible same-Owner/type/reference/context and wall-clock exact fresh safety.
  Changed publication or attribution cannot inherit old binding, even if safe.
  Public recognition degradation stays unchanged; no fallback or lifecycle writes.
- Pure server validator rejects malformed/private fields, unsafe/noncanonical URL
  and mismatched original bytes without rewriting attribution or doing I/O.
  It neither derives server context nor authorizes browser-supplied raw bindings.
- All 33 new validator tests and full application/tooling/typecheck/lint/build/diff
  gates passed locally, including six actual Redis and eight existing Product
  Chromium regression fixtures. No Resource browser/live-provider evidence claimed.
- Added 45 pgTAP assertions for grants, roles/aliases, exact private/Owner/type/ref
  denial, stale Identity/Resource/source bindings, safety degradation/recovery,
  malformed context and no writes. Required migration reset/lint/advisors/pgTAP/
  concurrency/retention and six exact latest-push gates remain PENDING until
  observed in committed isolated CI. No local Docker or production DB claim.
- No public/RPC grant, browser intent, source CTA, route, publication, provider,
  credential, dependency or production enabling. S5/S6 remain NOT CLOSED / VERIFIED.
- Next safe slice after required evidence: audit/lock same-Published-snapshot
  Resource recognition plus private server binding derivation and SDK validation;
  never derive outbound authority from browser tokens or public DTOs.

## Same-snapshot Resource server-context prerequisite — 2026-10-07

- Clean Cloud baseline `7e699c5c20bda7c8bd7708fc9470cac31c90eb9c` passed all
  six exact push-event gates: CI 37606769599, Security 37606769584, Guard
  37606769580. Database passed 1,758 assertions across 31 files, nine real
  concurrency cases and both retention checks. Pending 12.52 evidence is superseded.
- Refreshed J6/J8, 12.49–12.52/12.30, pinned P04 and current source/tests.
  Locked 12.53 before source and CLI-created the additive migration.
- One materialized context selection applies the stable Identity eligibility gate
  and exact Published Owner/type/ref/structural checks in the same SQL statement.
  Recognition and server binding derive from those same publication rows; current
  safety is evaluated once at one wall-clock time. Unsafe sources retain Published
  recognition with binding=null and disclose no masked source hash/token.
- Pure server-only parser validates strict outer/recognition/binding fields, exact
  reference, authoritative canonical Handle agreement, availability/binding shape
  and original source hash. Invalid/private/cross-context/hostile input is null.
  Tokens are not derived from public DTOs or treated as browser authorization.
- All 27 new parser tests and full application/tooling/typecheck/lint/build/diff
  checks passed locally, including six actual Redis and eight existing Product
  Chromium fixtures. No Resource browser or live provider proof is claimed.
- Added 43 pgTAP assertions for same-row digest/source/context, alias/role equality,
  degradation/recovery, changed rows/source, private/Owner/type/ref/lifecycle denial
  and no writes. Migration reset/lint/advisors/pgTAP/concurrency/retention and six
  exact latest-push jobs remain PENDING until observed in isolated committed CI.
- Initial push `d37b08d90e026b2cf87c5f873a83d30523285f84` passed Application,
  all three Security jobs and Guard. Database reset/lint/advisors passed, but a
  missing quote in the new binding-to-source pgTAP assertion stopped that suite
  after 78 successful assertions. The fixture quote is corrected; no production
  function/gate changed. All latest-push evidence requires exact-SHA reverification.
- No grants, browser intent, source CTA, route, publication, credential/provider,
  dependency or production enabling. S5/S6 remain NOT CLOSED / VERIFIED.
- Next bounded slice after required evidence: private injected-client Resource
  context/source RPC adapter with strict locator-only ingress, deadline, no retry,
  no binding exposure and current fresh source validation before intent assembly.

## Private Resource RPC adapter prerequisite — 2026-10-07

- Clean Cloud baseline `b7ea84eb51b64009d3020a0c63a11fad3dc6d51c` passed all
  six exact push-event gates: CI 37607906948, Security 37607906801, Guard
  37607906887. Database passed 1,801 assertions across 31 files, nine real
  concurrency cases and both retention checks. Pending 12.53 evidence and its
  failed predecessor are superseded by this exact final commit's passing evidence.
- Refreshed J6/J8, pinned P04, 12.52/12.53 and actual pinned SDK source/tests.
  Locked 12.54 before source. Current Supabase AbortSignal documentation was read;
  changelog access returned proxy 403, with no bypass or dependency change.
- Unmounted server-only injected-client adapter reads private context once from
  strict normalized locator ingress and validates it through 12.53. Uniform
  authoritative unavailable remains distinct from operational null. Source reads
  validate only trusted server bindings and exact original canonical URL/hash.
- Both calls have independent five-second deadlines/AbortSignals, ignore late
  success and perform no retry/fallback/cache/log/client or credential creation.
  Future assembly must select bindings through the trusted server boundary;
  browser raw tokens/public DTOs are never action authority.
- All 36 new actual pinned-SDK mocked-fetch tests passed; full local typecheck,
  lint, five tooling tests, 1,536 application tests, six actual Redis tests, three
  production builds, eight existing Product Chromium fixtures and diff checks
  passed. No Resource browser/live-provider proof is claimed.
- No database/grant/publication/route/intent/CTA/provider/credential/dependency or
  production change. Required exact latest-push CI/Security/Guard, including the
  unchanged database regression, remain PENDING until observed. S5/S6 NOT CLOSED /
  VERIFIED.
- Next safe slice after required evidence: audit 12.27/12.28/12.31 and lock a
  bounded opaque one-use Resource Open intent core binding recognition to its
  exact server-selected publication/source, without browser raw-binding authority.

## Resource Open intent core prerequisite — 2026-10-07

- Clean Cloud baseline `acee5b8c60d453010bbc20b94fc5740dedd21a27` passed all
  six exact push-event gates: CI 37638435524, Security 37638435405, Guard
  37638435557. Database passed 1,801 assertions across 31 files, nine real
  concurrency cases and both retention checks. Pending 12.54 evidence is superseded.
- Refreshed J6/J8, pinned P04, 12.27/12.28/12.31 and 12.52–12.54 source/tests.
  Locked 12.55 before source. No user-journey, provider chooser or publication change.
- Server-only injectable Resource Open core issues from strict locator/private
  same-snapshot context, rechecks exact source before storage and returns only an
  opaque random 256-bit capability. Records contain token hash, purpose, exact
  binding, recognition hash and fixed 120-second lifetime; no raw token/source URL.
- Redemption accepts only canonical opaque token/public Handle/ref, atomically
  consumes first, validates record/context/time, freshly re-resolves source and
  rechecks expiry/progression after async resolution. Denial never restores authority.
  Schemas do not prove server selection provenance or that a visitor viewed P04.
- All 76 new unit tests passed, including strict/private/degraded/hostile ingress,
  collision/error acknowledgement, canonical encoding, clock/overflow/expiry,
  replay/competing consume, cross-context burns, exact attribution and independent
  capabilities. Memory persistence is explicitly test-only, not durable DB evidence.
- Full local typecheck/lint, five tooling tests, 1,612 application tests, six actual
  Redis tests, three builds, eight existing Product Chromium fixtures and diff checks
  passed. No Resource browser/live-provider or database capability proof is claimed.
- No migration/grants/concrete store/client/credential/HTTP/CTA/publication or
  production enabling. Required exact latest-push jobs, including unchanged database
  regression, remain PENDING until observed. S5/S6 remain NOT CLOSED / VERIFIED.
- Next bounded prerequisite after required evidence: audit/lock durable private
  hashed Resource intent persistence with strict records, atomic create/consume,
  fresh exact binding checks, database time, bounded cleanup and real concurrency
  evidence, retaining withheld execution grants and no public transport.

### Resource intent recovery and framework security patch — 2026-10-10

- Owner authorized recovery of preserved local commit `11cb08c`; it was pushed
  without rewriting history from `acee5b8` to `codex/autopilot`. Clean local and
  remote HEAD equality was verified before the security remediation below.
- Exact recovered push: CI 38055016564 Application/Database, Security
  38055016709 Secret Scan/SAST and Guard 38055016575 passed. Dependency Scan
  failed with six Next.js 16.3.6 advisories (one High, five Medium), all reporting
  16.3.8 as the fixed version. This is a real security failure, not pending infra.
- Under the existing patched Active LTS requirement in 12.4, all three apps now
  pin Next.js/eslint-config-next 16.3.8 and matching Next internals. The existing
  plugin patch is byte-identical and remains version-scoped; its unused fast-glob
  tree stays removed. Release-age/trust/build policies and scanner gates are intact.
  Lockfile review found only intended Next versions, integrity and patch paths.
- Frozen install, typecheck, lint, five tooling tests, 1,612 application tests,
  six actual Redis tests, three builds, eight existing Product Chromium fixtures
  and diff checks passed on the patched tree. The final captured verification
  reused matching Turbo caches; Redis/tooling/browser checks ran directly.
- No product source behavior, migration, grants, credentials or publication change.
  All six exact security-patch push-event gates remain PENDING until observed;
  neither recovery nor this dependency update closes S5/S6 or proves Resource
  browser/provider/durable capability behavior.
- Next safe task after required evidence: the bounded durable private hashed
  Resource intent store already identified under 12.55, with a new locked contract,
  database clock/atomic operations/cleanup/concurrency and withheld execution grants.

### Withheld durable Resource Open intent persistence — 2026-10-10

- Fresh clean Cloud baseline `9122f8166dcda49f70eb131b0925df8d2f51351c` passed all
  six exact push-event gates: CI 38055281125, Security 38055281147, Guard
  38055281143. Database passed 1,801 assertions, nine races and both retention
  tests. OSV found no issues in 535 packages; earlier pending evidence superseded.
- Refreshed J6/J8, 12.28/12.52–12.55 and source/migration/tests; read pinned P04
  from bb79dce4e5ee384d3e9932504386602f60d074ce. Locked 12.56 before coding.
  Supabase RLS documentation was read through its documentation connector after
  direct HTTP docs/changelog access returned 403; no CLI/API upgrade was made.
- Added private hashed Resource intent table with strict fixed-lifetime records,
  fresh exact source resolution and database-clock bounds on create, atomic
  create-if-absent without expired collision overwrite, consume/delete before
  returning one still-current record, expired/future burns and bounded indexed
  SKIP LOCKED cleanup. RLS has no policies; all public/browser/service execution
  stays withheld. No raw token/source URL or Owner/Item UUID is persisted.
- Added rolled-back pgTAP schema/security/strict-ingress/freshness/collision/time/
  cleanup/state-isolation tests plus isolated duplicate-create, committed consume/
  replay and actually-locked cleanup races, wired additively into Database CI.
- Typecheck/lint, five tooling tests, 1,612 application tests, six actual Redis
  tests, three builds and eight existing Product Chromium fixtures passed locally;
  unchanged application Turbo results were reused. Node syntax and diff review
  passed. Database behavior is not claimed locally: committed isolated CI supplies
  required reset/lint/error advisors/pgTAP/concurrency/retention evidence.
- Latest push-event Application/Database/Secret/SAST/Dependency/Guard evidence
  remains PENDING until observed. No adapter, credentials, retention scheduler,
  public grants, route/CTA or publication enabling; S5/S6 remain NOT CLOSED / VERIFIED.
- Next bounded dependency after required evidence: lock/implement the private
  injected Resource intent RPC adapter with strict create/consume acknowledgements,
  committed consumption and finite deadlines; database clock calibration and
  inactive retention wiring remain later prerequisites before public transport.
- Initial push `cc8274d` passed Application, Secret/SAST/Dependency and Guard.
  Database reset/lint/error advisors passed; pgTAP then stopped at a missing closing
  parenthesis in the new malformed-record VALUES fixture after 71 passing assertions.
  Corrected fixture syntax without changing runtime SQL or weakening coverage.
  PostgreSQL parser validation passed for all 16 migration and 83 fixture statements;
  full local quality gates, Redis and existing Product Chromium checks passed again.
  Exact corrected-push database/all-six evidence remains PENDING until observed.

### Staged private Resource intent RPC adapter — 2026-10-10

- Preserved the current-thread 12.57 contract prepared before the pause; no unrelated
  workspace edits or unpushed commits. HEAD equals explicit fetched autopilot ref
  `b1dfa1e2669ef987ee981c2f16902c737e0cdf5e` before implementation.
- Rechecked all six exact baseline push-event jobs: CI 38056051562, Security
  38056051554 and Guard 38056051559 passed. Observed Database evidence: 1,910
  assertions / 32 files, twelve concurrency cases and two retention tests. This
  supersedes the pending corrected-store evidence above.
- Refreshed J6/J8, pinned P04 and 12.29/12.55/12.56; implemented under locked 12.57.
  Injected api-schema create/consume/cleanup only, strict canonical record/hash/
  acknowledgements and bounded counts, five-second independent AbortSignal deadlines,
  fail-closed late responses and no retries/fallback/restoration. Standalone consume
  completes before core source resolution. No new client credentials/table access,
  migration/grants/scheduler/route/CTA/publication mutation.
- Fifty-five targeted tests passed including malformed/private/noncanonical input,
  permission/transport errors, exact pinned SDK POST/schema/parameters, no retries,
  cleanup bounds, independent deadlines, abort-ignoring late completion and denied
  core resolution after uncertain consume. SDK mocked-fetch is not live RPC proof.
- Full typecheck/lint, five tooling tests, 1,667 application tests, six actual
  Redis tests, eight existing Product Chromium fixtures, three builds and final
  diff review passed. No Resource browser/manual/provider evidence is claimed.
- Latest push-event CI/Security/Guard remains PENDING until observed. Database
  behavior is unchanged and isolated Database CI remains required regression.
  Next safe dependency: lock database-clock/deadline calibration before trusted
  Resource issuance/redemption assembly, then inactive retention wiring.
  Resource browser/live-provider/public transport evidence and S5/S6 remain open.

### Staged Resource database clock/deadline primitives — 2026-10-10

- Exact adapter push `e34f7756e10418d51ae2fe1c43336c77c6e1dcfc` passed all six
  gates: CI 38078890673, Security 38078890655, Guard 38078890669; this supersedes
  adapter pending evidence above.
- Clean explicit fetched lane at `e34f7756e10418d51ae2fe1c43336c77c6e1dcfc`;
  refreshed changed authority and the existing 12.31–12.33 patterns. This bounded
  prerequisite uses verified 12.52/12.55/12.56 independently of 12.57 adapter gates.
  Locked 12.58 before implementation; J6/J8 and pinned P04 semantics unchanged.
- Added withheld database wall-clock sample and strict record-aware exact Resource
  source resolver checking database time before and after resolution. No capability
  authentication is inferred from a supplied record; future assembly must commit
  one-use consumption first. No grants, state writes, credentials or public enabling.
- Added operation-local monotonic calibration with lower issuance/upper deadline
  bounds, permanent invalidation on counter failure/rollback/overflow and a finite
  five-second AbortSignal deadline even if transport ignores abort. No retries,
  wall-clock fallback, TTL extension or shared calibration.
- Twenty-six targeted tests and full typecheck/lint, five tooling tests, 1,693
  application tests, six Redis tests, eight existing Product Chromium fixtures,
  three builds and diff review passed. PostgreSQL parser accepted six migration
  and 71 pgTAP statements. Database reset/lint/error advisors/pgTAP/races/retention
  evidence must come from committed isolated CI, not this parser or mocked fetch.
- Added rolled-back pgTAP clock-range/grant/strict/time/safety/stale/attribution/
  state-isolation fixtures, including expiry during a controlled delayed resolver.
  Latest exact push-event six gates remain PENDING until observed.
- Next: bounded trusted per-operation calibrated Resource issuance/redemption
  assembly, then inactive bounded retention wiring before public transport.
  Actual authorized calibration/RPC, Resource browser/manual/provider, cache/
  origin/abuse and publication gates remain open. S5/S6 NOT CLOSED / VERIFIED.

- Initial clock push `863e057` passed Application, all three Security scans and
  Guard. Database reset/lint/error advisors passed; pgTAP stopped after 47 new
  assertions because the blocked-safety fixture omitted mandatory reason_codes.
  Corrected the fixture with malware reason and restored empty reasons on safe
  recovery; runtime SQL and security constraints are unchanged. Corrected exact
  push evidence remains PENDING until observed.

### Staged calibrated Resource Open assembly — 2026-10-10

- Clean fetched Cloud lane at `e9ae09efceee2d54cc9dfbcb24fc7aaace27a65e`;
  all six exact push-event gates rechecked successful: CI 38079349366, Security
  38079349395, Guard 38079349383. Database passed 1,964 assertions / 33 files,
  twelve concurrency cases and two retention tests, superseding clock pending
  evidence above. Prior transient runner port conflict was resolved by retry.
- Refreshed current authority, locked J6/J8, pinned P04 and 12.54–12.58/source.
  Locked 12.59 before implementing injected private issuance/redemption assembly.
  Issue reads same-Published RPC recognition/binding and calibrates separately;
  uses lower bound for issuance and upper for expiry. Redemption commits one-use
  consumption before strict returned-record database deadline resolution, then
  checks the upper bound again. Five-second abort-ignoring deadline, no retries,
  wall-clock fallback, shared calibration, restoration or TTL grace.
- No credentials, migration/grants, scheduler, route/CTA, analytics or publication
  writes. Return only recognition and opaque token; private binding stays server-side.
- Twenty assembly tests cover actual pinned SDK mocked-fetch provenance/parameters,
  distinct/per-operation bounds, calibration failure, context mismatch, replay,
  expiry, rejected exact source, late timeout and cleanup without calibration.
  Full typecheck/lint, five tooling tests, 1,713 application tests, six Redis,
  eight existing Product Chromium fixtures, three builds and final diff review
  passed. Exact latest-push six gates remain PENDING until observed; unchanged
  Database CI remains required regression evidence.
- Next safe slice: lock inactive bounded Resource intent retention wiring under
  the existing pg_cron policy, including actual isolated cadence/lock/cleanup tests.
  Trusted live RPC/calibration, Resource browser/provider, HTTP/cache/origin/abuse
  and public publication gates remain open. S5/S6 NOT CLOSED / VERIFIED.

### Staged inactive Resource Open retention — 2026-10-10

- Clean fetched Cloud lane at `6d4766ad5e369b61d63c6bf95fbe39dbbde18ebe`;
  all six exact push-event gates rechecked successful: CI 38082775815, Security
  38082775732, Guard 38082775789. Database passed 1,964 assertions / 33 files,
  twelve concurrency cases and two Product retention tests. This supersedes
  assembly pending evidence without closing S5/S6.
- Refreshed current authority, locked J6/J8, pinned P04, 12.33/12.56–12.59 and
  existing SQL/tests/CI. Locked 12.60 before implementing inactive Resource cron.
  Reuses pg_cron; separate transaction try-lock, one indexed 500-intent cleanup
  and own terminal history older than seven days bounded to 500. Fixed five-second
  statement/one-second lock limits; registration and deactivation in one transaction.
  No grants, credentials, HTTP/provider, publication/Working/Draft/safety/analytics
  changes, TTL extension or restoration. Product intents/job remain unchanged.
- Added rolled-back pgTAP for inactive cadence/ownership/fixed command/withheld
  grants, 500 plus remainder cleanup and protected-state preservation. Added two
  isolated actual multi-connection/cadence tests, restoring inactive minute job,
  as an additive Database CI step. Node syntax and SQL statement parsing passed;
  those are not database runtime evidence. Local Docker capacity remains insufficient.
- Full typecheck/lint, five tooling tests, 1,713 application tests, six actual Redis,
  eight existing Product Chromium fixtures, three builds and final diff review
  passed (unchanged application gates used local Turbo cache where applicable).
  New migration reset/lint/error advisors/pgTAP/races/actual Resource retention and
  all six exact latest-push gates remain PENDING until observed in isolated CI.
- Next safe slice: bounded private Resource action-specific abuse budget/transport
  contract using existing Product safety patterns, without enabling public routes
  or grants. Controlled minute-cadence/monitoring/capacity, trusted live integration,
  Resource browser/manual/provider and publication gates remain open.
  S5/S6 NOT CLOSED / VERIFIED.

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

# Spall Spill — Product Requirements Document

**Status:** Execution summary for the locked MVP  
**Repository:** nafisajuliansahsaputra/spall-spill  
**Last synchronized:** 2026-10-04

## 1. Authority and purpose

This PRD is the implementation-facing product summary for Spall Spill.

It does **not** replace the canonical product specification. If this file conflicts with a locked product decision, the following authority order applies:

1. docs/product-spec/PRODUCT-SOURCE-OF-TRUTH.md
2. locked modular product records referenced by MIGRATION-MANIFEST.md
3. docs/product-spec/technical-architecture/12.4-production-technology-stack-security-architecture.md
4. ARCHITECTURE.md
5. PRD.md
6. TODO.md, SKILL.md, and WORKFLOW.md as execution guidance

Historical product decisions remain pinned to the source commit documented in MIGRATION-MANIFEST.md. The legacy runtime repository is not an implementation dependency.

## 2. Product definition

Spall Spill is a creator/business identity and structured discovery platform.

The product has two first-class concepts:

- **Identity** — the public owner/profile surface used for identity, connection, navigation, links, and public context.
- **Spill** — the structured catalog/discovery surface used for Products and Resources.

The product must let a person start simple and expand capabilities later without changing account type, migrating content, replacing URLs, or repeating full onboarding.

## 3. Core product principles

- Identity is not Commerce.
- Draft is not Working.
- Saved is not Live.
- Working saves never silently change Published state.
- Publish is explicit and authoritative.
- Public discovery exposes public-safe Published projections only.
- Authentication is not Authorization.
- Owner identity is stable even when Handle changes.
- Persistent Spill Reference is stable and never reused.
- Product and Resource are structured entities, not raw URLs.
- Reports and automated signals are not verdicts.
- Appeal submission is not automatic reversal.
- Audit is accountable product reality, not analytics.
- Owner preview is excluded from normal public audience analytics.
- Marketplace outbound click is not a purchase.
- Returning-owner workflows must be dramatically shorter than onboarding.
- Capability expansion is additive, not transformational.

## 4. Target users and jobs

### 4.1 Personal
A user who wants a polished link-in-bio / identity page without being forced into commerce or catalog complexity.

Primary job:
- create account;
- claim Handle;
- create Identity;
- add social/links;
- preview;
- publish;
- share.

### 4.2 Affiliator
A user who publishes recommended Products and sends visitors to one or more marketplace destinations.

Primary job:
- establish Identity;
- add first Product;
- add at least one valid destination;
- confirm Product;
- publish;
- share and continue adding Products.

### 4.3 Business / UMKM
A business that needs a public identity plus structured Resources such as menu, catalog, price list, portfolio, PDF, or website.

Primary job:
- establish business Identity;
- add first Resource;
- add external destination;
- publish;
- share and manage Resources.

### 4.4 Creator
A creator who needs a first-class Identity and may optionally use Product, Resource, Spill, or Analytics capabilities.

Primary job:
- publish creator Identity first;
- add Spill only when relevant;
- preserve a clean personal-brand experience.

### 4.5 Returning Owner
An existing owner who needs fast recurring operations.

Primary jobs:
- edit Identity;
- add Product or Resource;
- manage destinations;
- publish changes;
- hide, restore, archive, and search existing items;
- inspect analytics and notices where relevant.

### 4.6 Follower / Visitor
A public visitor who must be able to discover and open content without account friction.

Primary jobs:
- find an exact item by persistent reference;
- search/browse a creator Spill;
- inspect Product context before outbound marketplace navigation;
- inspect Resource context before opening its destination.

### 4.7 Operator
A protected platform role responsible for moderation, evidence, enforcement, appeals, audit, health, and emergency platform controls.

Operator access is privileged, explicit, deny-by-default, MFA-protected where required, and fully accountable.

## 5. Canonical domain concepts

### Owner
Stable application identity. It is not replaced by authentication-provider identity and does not change when Handle changes.

### Handle
Human-facing mutable locator. It is unique under canonical normalization rules and may retain historical alias/reservation behavior.

### Identity
Owner-editable public identity surface with separate Working and Published state.

### Spill Item
Structured owner content with a stable entity identity and persistent Spill Reference.

MVP item types:
- Product
- Resource

### Product
Structured item that may have one or more validated marketplace destinations.

### Marketplace Destination
A validated outbound destination belonging to a Product. Marketplace click is measured as outbound intent, not purchase.

### Resource
Structured item such as Menu, Price List, Catalog, Portfolio, Media Kit, Rate Card, Document/PDF, Website/External Resource, or Other.

### Persistent Spill Reference
Owner-scoped stable reference used for exact retrieval. It is allocated once and is never recycled or reassigned.

### Working state
Authoritative editable owner state protected by revision/concurrency rules.

### Published projection
Public-safe snapshot derived from a specific eligible Working revision.

## 6. Activation model

Spall Spill keeps activation semantics separate:

- **Platform Activation** — the owner successfully publishes Identity.
- **Spill Activation** — the owner publishes the first valid Product or Resource.
- **Commerce Activation** — the owner publishes a Product with at least one valid marketplace destination.

These are separate product events and must not be collapsed into one generic activation metric.

## 7. Locked MVP journeys

### J1 — Personal → First Identity Publish
Simple Identity-first onboarding. Product, Resource, marketplace, advanced analytics, SEO, bulk tools, and automation must not block the first experience.

### J2 — Affiliator → First Commerce Activation
Identity + first Product + at least one destination, ending in a single final publish moment. Metadata extraction is assistance only; manual fallback always remains possible.

### J3 — Business / UMKM → First Resource Publish
Business Identity + first structured Resource. External Resource destination is sufficient for MVP.

### J4 — Creator → First Creator Identity Publish + Optional Spill
Creator Identity remains first-class. Product/Resource capability is optional and progressively exposed.

### J5 — Returning Owner → Add / Edit / Manage
No repeat onboarding. Working/autosave protects edits; public state changes only through explicit publish. Hide is reversible; Archive intentionally retires while preserving the persistent reference.

### J6 — Exact Spill Retrieval
Inputs such as 27 and #27 normalize to the same exact reference. Exact reference always wins over fuzzy search. A unique published match auto-opens item detail. Product detail confirms context before outbound marketplace navigation.

### J7 — Browse / Search Discovery
Discovery is scoped to the current creator Spill for MVP. Search and Browse are both first-class. Exact-reference-shaped input delegates to J6. Featured/Pinned + Newest Published is the scalable browse model.

### J8 — Resource Discovery
Resource is an entity, not a URL. The visitor sees lightweight semantic context and an adaptive Open/View action before reaching the destination.

### J9 — Capability Expansion
Users gain new capabilities without account migration, role conversion, data migration, or full re-onboarding. First use may use micro-onboarding. Public Identity changes remain explicit.

## 8. Functional MVP scope

### Public / marketing
- landing / entry;
- signup, login, recovery;
- public Identity;
- public Spill;
- exact reference retrieval;
- creator-scoped keyword search and browse;
- Product detail and destination chooser;
- Resource detail and open action;
- unavailable/retired states that do not leak private lifecycle details.

### Owner
- onboarding and Handle claim;
- Identity editor with live preview;
- Working persistence / autosave status;
- explicit publication;
- Product creation/editing;
- Resource creation/editing;
- marketplace destination management;
- search/filter existing Spill items;
- hide/restore/archive;
- analytics surfaces;
- settings/account surfaces;
- moderation/enforcement notices where applicable;
- adaptive capability exposure.

### Operator
- authenticated operator workspace;
- explicit granular permissions;
- report/case/evidence workflows;
- enforcement;
- appeal review;
- audit access under protected rules;
- platform health and protected controls.

## 9. Locked route families

The current route families remain:

- /
- /signup
- /login
- /recovery
- /onboarding
- /{handle}
- /{handle}/spill
- /{handle}/spill/{reference}
- /dashboard/*
- /ops/*

The locked MVP logical screen inventory is 25 screens. Exact screen-level behavior is governed by the historical pinned product specification and must be read before implementing a specific surface.

## 10. UX requirements

- Mobile-first and responsive without making desktop an afterthought.
- Accessible interaction primitives and keyboard/focus behavior.
- Clear distinction between local/unsaved, Saving, Saved, save failure, Working, and Published state.
- Public flows require no follower signup/login gate.
- Exact reference retrieval must be fast and deterministic.
- Keyword discovery may be forgiving; reference resolution must be conservative.
- Returning-owner actions must minimize unnecessary navigation.
- Empty/error states must offer recovery, not dead ends.
- Back navigation should preserve reasonable query/filter/category context.
- UI must not expose security implementation details or private lifecycle state.
- Identity and Spill must remain understandable as separate but connected product concepts.

## 11. Security and trust requirements

Product behavior must preserve:

- server-side ownership authorization;
- deny-by-default protected actions;
- tested database RLS/grant defense in depth;
- strict separation of private Working state and public projections;
- optimistic concurrency and STALE_WRITE rejection;
- MFA / fresh strong authentication for sensitive operator/high-risk actions;
- validated outbound URLs;
- SSRF-safe metadata fetching;
- constrained presigned media upload;
- append-only accountable Audit;
- action-specific rate limits;
- PII-minimized logs and telemetry;
- backup, restore, rollback, incident, and secret-rotation readiness before public launch.

## 12. Non-goals for initial MVP

Unless a later locked decision changes this, MVP does not require:

- platform-wide cross-creator shopping discovery;
- follower accounts for normal public discovery;
- microservices;
- Kubernetes;
- Kafka;
- service mesh;
- a dedicated search cluster;
- multi-region writable database;
- full-catalog manual drag ordering;
- forced hosted Resource uploads;
- embedded full document viewer;
- automatic marketplace redirect immediately after exact reference resolution;
- permanent account modes that restrict universal capabilities.

## 13. Product success signals

Canonical semantic metrics include:

- Platform Activation;
- Spill Activation;
- Commerce Activation;
- Exact Reference Success;
- time-to-exact-item;
- Search Success;
- Browse/Discovery Success;
- zero-result rate and refinement;
- Product outbound marketplace click;
- Resource Open;
- productive returning-owner actions.

Numeric targets must be added only when deliberately agreed; this PRD does not invent KPI thresholds.

## 14. MVP completion definition

The MVP is not complete merely because pages render.

MVP completion requires:

- locked J1–J9 behavior implemented;
- correct Working/Published isolation;
- stable Handle and Spill Reference semantics;
- secure AuthN/AuthZ boundaries;
- owner and public flows covered by meaningful automated tests;
- critical RLS/grant allow + deny tests passing;
- production build, typecheck, lint, unit/integration tests, and critical Playwright E2E passing;
- observability and typed errors present;
- backup/restore and rollback procedures tested;
- security-critical findings resolved or explicitly risk-managed;
- production environment verified without relying on undocumented dashboard-only state.

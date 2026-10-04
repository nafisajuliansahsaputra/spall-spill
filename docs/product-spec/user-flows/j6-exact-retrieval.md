# J6 — Follower → Exact Spill Retrieval (#reference) — LOCKED

**Goal:** follower yang sudah mengetahui persistent Spill Reference seperti `#27` dapat mencapai exact Product/Resource secepat mungkin, memastikan item yang ditemukan memang benar, lalu melakukan meaningful action tanpa login/signup friction.

```mermaid
flowchart TD
    A[Social context: "link #27"] --> B{Entry path}
    B -->|Creator Identity| C[Open Identity]
    B -->|Direct Spill| D[Open Spill]
    B -->|Direct Item Link| K[Open Item Detail]
    C --> D
    D --> E[First-class Spill Search]
    E --> F[Enter 27 or #27]
    F --> G[Normalize as persistent reference]
    G --> H{Exact published match?}
    H -->|No| I[Unavailable / Not Found]
    I --> J[Search by name or Browse Spill]
    H -->|Yes| K[Auto-open Exact Item Detail]
    K --> L{Spill Item Type}
    L -->|Product| M[Visual + Context Confirmation]
    M --> N{Valid destinations}
    N -->|One| O[Provider CTA: Open in Marketplace]
    N -->|Multiple| P[Marketplace Chooser]
    O --> Q[Outbound Marketplace Click]
    P --> Q
    L -->|Resource| R[Lightweight Resource Context]
    R --> S[Open Resource]

    T[Hidden / Draft] --> I
    U[Archived search] --> I
    V[Archived stable permalink] --> W[Retired / Tombstone State]
```

## Locked rules

- Exact-reference lookup is a dedicated fast path, not generic keyword search.
- Minimum `27` and `#27` normalize to the same persistent reference lookup.
- Exact reference priority is absolute over fuzzy/title results.
- A unique exact published match auto-opens Item Detail; no intermediate “1 result” page.
- No follower login, signup, email gate, or app-download requirement.
- If entry starts on Identity, Spill must be obvious and at most a minimal decision away; direct Spill entry never routes back through Identity.
- Product never auto-redirects straight to marketplace after reference match. Product Detail provides visual/context confirmation first.
- One destination → provider-specific CTA. Multiple destinations → marketplace chooser.
- Original creator destination/affiliate attribution must be preserved.
- Resource uses lightweight context/detail then Open Resource; no marketplace chooser.
- Missing reference never silently falls back numerically to a neighboring reference.
- Draft/Hidden lifecycle is not leaked publicly; it appears unavailable.
- Archived items are excluded from normal search/browse, but stable direct permalinks may show a retired/tombstone state.
- Persistent references are never recycled or reassigned to another item.
- Direct stable item links may skip search but still retain Product confirmation.
- Back navigation should preserve reasonable search/browse context.
- Marketplace outbound click / Resource open is the journey’s meaningful action; it is not called a purchase without real conversion data.
- Instrument Exact Reference Success separately and measure time-to-exact-item.

## Locked principle

**Exactness wins over fuzzy convenience.** Exact reference should be the fastest route to the exact item, while confirmation remains strong enough to prevent the follower from acting on the wrong Product/Resource.

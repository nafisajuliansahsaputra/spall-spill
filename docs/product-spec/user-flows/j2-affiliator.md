# J2 — Affiliator → First Commerce Activation — LOCKED

**Goal:** Identity foundation + first Product + at least one valid marketplace destination, with a single final publish moment.

```mermaid
flowchart TD
    A[Landing / Entry] --> B[Create Account]
    B --> C[Claim Handle]
    C --> D[Select Intent: Affiliate / Product Recommendations]
    D --> E[Basic Identity + Affiliate Starter Composition]
    E --> F[Add First Product]
    F --> G[Paste Marketplace / Affiliate URL]
    G --> H{Provider / metadata assistance succeeds?}
    H -->|Yes| I[Prefilled Product]
    H -->|No| J[Manual Fallback - keep pasted URL]
    I --> K[Confirm Product]
    J --> K
    K --> L[First Marketplace Destination]
    L --> M{Add another marketplace?}
    M -->|Optional| N[Add Destination]
    M -->|Skip| O[Continue]
    N --> O
    O --> P[Preview Identity + Spill]
    P --> Q[Single Final Publish]
    Q --> R[Platform + Spill + Commerce Activation]
    R --> S[Share / Add Another Product]
    S --> T[Affiliate-Adaptive Dashboard]
    F -. Skip Product .-> U[Publish Identity only]
    U --> V[Platform Activation only]
```

## Locked rules
- Metadata extraction is assistance, never a dependency.
- Taxonomy complexity must not block first Commerce Activation.
- Persistent Spill Reference is system-managed.
- Multi-marketplace is optional beyond the first valid destination.
- Identity remains a full universal capability after activation.

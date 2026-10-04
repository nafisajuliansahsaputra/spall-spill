# J3 — Business / UMKM → First Resource Publish — LOCKED

**Goal:** brand Identity + first structured Resource live. Identity handles connection; Spill handles structured discovery.

```mermaid
flowchart TD
    A[Landing / Entry] --> B[Create Account]
    B --> C[Claim Handle]
    C --> D[Select Intent: Business / UMKM]
    D --> E[Basic Business Identity + Starter Composition]
    E --> F[Add First Resource]
    F --> G[Choose What to Share: Menu / Price List / Catalog / Portfolio / PDF / Other]
    G --> H[Paste Resource Destination]
    H --> I{Metadata assistance available?}
    I -->|Yes| J[Prefill Helpful Metadata]
    I -->|No| K[Manual Entry]
    J --> L[Confirm Resource]
    K --> L
    L --> M[Preview Identity + Spill]
    M --> N[Single Final Publish]
    N --> O[Platform + Spill Activation]
    O --> P[Share / Add Another Resource]
    P --> Q[Business-Adaptive Dashboard]
    F -. Skip Resource .-> R[Publish Identity only]
    R --> S[Platform Activation only]
```

## Locked rules
- Resource is structured and recognizable, not a raw URL.
- External Resource workflow is sufficient for MVP; hosted upload may come later.
- Thumbnail and category must not block the first Resource publish when unnecessary.
- Business can add Product later without account migration or type changes.

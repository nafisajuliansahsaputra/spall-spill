# J5 — Returning Owner → Add / Edit / Manage — LOCKED

**Goal:** recurring jobs are dramatically shorter than onboarding so Spall Spill becomes a real operating workflow.

```mermaid
flowchart TD
    A[Returning Owner] --> B{Session valid?}
    B -->|Yes| C[Adaptive Dashboard / Intended Workspace]
    B -->|No| D[Login / Re-authenticate]
    D --> C
    C --> E{What do you need to do?}
    E -->|Update Identity| F[Identity Editor + Live Preview]
    F --> G[Working / Autosaved Changes]
    G --> H[Publish Changes]
    E -->|Add Spill Item| I{Product or Resource?}
    I --> J[Fast Product Entry]
    I --> K[Fast Resource Entry]
    J --> L[Publish]
    K --> L
    E -->|Manage Existing Item| M[Search by #reference / title / filters]
    M --> N[Open Existing Product / Resource]
    N --> O[Edit entity / destination]
    O --> P[Save & Publish]
    H --> Q[Clear Success Feedback]
    L --> Q
    P --> Q
    Q --> R[Continue / Add Another / Back to Spill]
    N --> S[Hide]
    S --> T[Hidden + Undo / Restore]
    N --> U[Archive]
    U --> V[Confirm]
    V --> W[Archived - reference remains reserved]
```

## Locked rules
- Returning owners do not repeat onboarding and Home is not a mandatory waypoint.
- **Working / Autosaved State ≠ Public State.** Autosave protects work; Publish / Save & Publish changes public state explicitly.
- Editing a destination never recreates the Product/Resource or changes its persistent reference.
- Hide is reversible and favors immediate action + Undo; Archive is intentional retirement and requires confirmation.
- Hard delete is not a primary catalog action.
- Meaningful return analytics are based on productive actions, not login alone.

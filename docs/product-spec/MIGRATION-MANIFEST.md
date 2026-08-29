# Spall Spill Product Source of Truth — Migration Manifest

## Status

**MIGRATION AUTHORITY ESTABLISHED / RUNTIME EXECUTION MAY BEGIN**

This repository is the production implementation repository for the clean Spall Spill rebuild.

The legacy runtime repository is **not** an implementation dependency.

## Historical source provenance

The complete pre-implementation Product Source of Truth was authored in:

- repository: `nafisajuliansahsaputra/spall-spill-next`
- branch: `product-spec`
- locked technology/security authority commit: `bb79dce4e5ee384d3e9932504386602f60d074ce`
- technology/security record blob SHA at migration: `9eff1f81052a640337b1062ced15f5c9ffa44ab3`
- canonical index blob SHA at migration: `05ebb1d64b1c6d66455b7d2f436a8a6ab93a7ede`

That source commit is immutable provenance for all locked Product Foundation, J1–J9, Functional Requirements 7.0–7.12, Information Architecture 8.0–8.6, Screen-Level UX 9.0–9.25, Shared UX 10.0–10.6, Stage 11 locks 11.1–11.28, and Stage 12 architecture decisions 12.1–12.4.

## Authority rule after repository split

1. New product or implementation decisions are recorded in **this repository**.
2. The legacy application runtime is never copied forward as implementation authority.
3. Historical product decisions keep their original meaning and decision history; repository separation does not reopen them.
4. `docs/product-spec/PRODUCT-SOURCE-OF-TRUTH.md` is the current execution index in this repository.
5. `docs/product-spec/technical-architecture/12.4-production-technology-stack-security-architecture.md` is the current technology/security authority.
6. J1–J9 remain locked. No user-flow topology change was required by the repository/technology migration.
7. If implementation requires a detail from a historical modular spec not yet materialized locally, read the exact file from the pinned historical commit before implementing that surface, then preserve any new resolution in this repository.

## Migration integrity

This migration deliberately preserves the original immutable Git provenance rather than pretending the new repository authored the historical decisions. The production codebase starts clean, while the product specification lineage remains traceable to the exact source commit.

No legacy runtime source code is part of this migration.

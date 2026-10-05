# Repository synchronization — 2026-10-05

The Owner explicitly requested comparison and synchronization of all local and
GitHub branches, preserving both sides' work. This is a repository maintenance
operation, not production deployment or S5/S6 checkpoint closure.

## Comparison before synchronization

The most advanced integrated branch was `codex/autopilot` at `abd2f1c`.
It already contained the local application/database baseline at `8d6f8c1`, plus
22 documentation, execution-authority, and CI commits. Its push-event CI,
Security, and Autopilot Guard runs all passed on that exact commit.

| Branch | Previous tip | Commits behind autopilot | Unique commits |
| --- | --- | ---: | ---: |
| `main` | `885daae` | 86 | 0 |
| `m0/foundation` | `013b237` | 48 | 0 |
| `test/auth-navigation-ci-coverage` | `4f6cfce` | 44 | 0 |
| `codex/local-preservation-20261004` | `8d6f8c1` | 22 | 0 |
| `codex/sync-local-foundation-20261004` | `8d6f8c1` | 22 | 0 |
| `chore/dependency-resolution-20261004` | `b7de70a` | 46 | 2 |

The two unique dependency-resolution commits only introduced a temporary
dependency-generation workflow. Their history is preserved through a normal
merge. The exact workflow is retained at
`archive/resolve-dependency-patches.yml`, outside GitHub's active workflow
directory: its historical dependency patch has already been integrated and the
old recipe must not rerun during branch synchronization.

## Synchronization boundaries

- Advance existing branches using ordinary fast-forward pushes, without force
  pushes, history rewrites, branch deletion, or discarded commits.
- Preserve ignored local configuration, local database state, and untracked
  scratch files; synchronize tracked repository files and Git history only.
- Create missing local tracking branches for existing GitHub branches.
- Keep `codex/autopilot` as the canonical development lane for future work.
- No application, database migration, product contract, or release-readiness
  status is changed by this maintenance merge.

The branch comparison is a historical snapshot. Future development branches may
advance independently; use a fresh fetch and ancestry comparison for later
synchronization decisions.

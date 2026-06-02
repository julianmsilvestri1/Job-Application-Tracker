# Supplemental plans (archived branch snapshots)

The **canonical** build specs for upcoming work live in the parent
[`docs/plans/`](../) directory. They are kept aligned with
[`master-plan-autonomous-apply.md`](../master-plan-autonomous-apply.md).

This folder holds **verbatim copies** of expanded phase write-ups from the
superseded remote branch `origin/cursor/phase-3-discovery-23c7` (commit
`b5e9393`). That branch diverged after correctness (merge-base `22c4663`) and
contains an alternate Phase 3 implementation plus deeper Phase 2/4/5 unit
breakdowns. **Do not merge that branch into `main`** — it conflicts with the
shipped Phase 3 work and master plan on `claude/fervent-fermi-QRBVK`.

| Supplement | Canonical (use for builds) |
|------------|----------------------------|
| [`cursor-phase-3-discovery-23c7/phase-2-apply.md`](./cursor-phase-3-discovery-23c7/phase-2-apply.md) | [`../phase-2-apply.md`](../phase-2-apply.md) |
| [`cursor-phase-3-discovery-23c7/phase-4-tracker.md`](./cursor-phase-3-discovery-23c7/phase-4-tracker.md) | [`../phase-4-tracker.md`](../phase-4-tracker.md) |
| [`cursor-phase-3-discovery-23c7/phase-5-scale.md`](./cursor-phase-3-discovery-23c7/phase-5-scale.md) | [`../phase-5-scale.md`](../phase-5-scale.md) |

Use supplements only for extra detail when planning; implement from the
canonical files plus the master plan.

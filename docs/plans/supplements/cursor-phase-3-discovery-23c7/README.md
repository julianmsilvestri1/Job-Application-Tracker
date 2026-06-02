# Supplement: `cursor/phase-3-discovery-23c7`

**Status:** Code **not merged** into `claude/fervent-fermi-QRBVK` (superseded).

Phase 3 shipped via **`cursor/phase-3-personalized-discovery-0e08`** (PR #9), which is the canonical implementation on the main line (JobCard, dashboard recommended feed, `preferences` routes, ESLint/CI, etc.).

This branch was an earlier parallel line. Merging it wholesale would **revert** newer UI and APIs. Useful pieces were:

- **Merged as docs only:** expanded Phase 2/4/5 plan drafts in this folder (`phase-2-apply.md`, …).
- **Ported selectively:** positioning confirmation banner, headline de-duplication in heuristics, clearing stale search results while loading.

The branch remains on GitHub for reference; do not open a full merge PR without a manual rebase review.

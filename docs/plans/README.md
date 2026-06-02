# Implementation Plans

Build-ready breakdowns of every roadmap phase. [`ROADMAP.md`](../../ROADMAP.md)
is the *what/why*; these docs are the *how*, structured so each piece can be
implemented and shipped on its own.

## Documents
| Plan | Phase | Theme |
|------|-------|-------|
| [phase-1.5-foundation.md](./phase-1.5-foundation.md) | 1.5 | Documents as AI context + AI orchestration |
| [phase-correctness.md](./phase-correctness.md) | X-cut | Correctness, tests, CI |
| [phase-2-apply.md](./phase-2-apply.md) | 2 | Apply assistance: links, checklist, extension |
| [phase-3-discovery.md](./phase-3-discovery.md) | 3 | Fit scoring, recommended feed, positioning |
| [phase-4-tracker.md](./phase-4-tracker.md) | 4 | Tracker AI, document variants, analytics |
| [phase-5-scale.md](./phase-5-scale.md) | 5 | Auth & multi-device sync (optional) |

## Build order
`1.5` → `correctness` → `3` → `2` → `4` → `5`. Within a phase, work units are
numbered in dependency order. Each unit is sized to one PR.

Phase 2, Phase 4, and Phase 5 now include expanded implementation structures:
core units, optional innovation tracks, schemas, endpoint contracts, UI flows,
AI prompts, test plans, acceptance criteria, and suggested commit boundaries.

---

## Shared conventions

These contracts are introduced in Phase 1.5 and reused everywhere. Every later
plan assumes them.

### A. Work-unit format
Every unit in these docs uses this template so it can be executed directly:

> **Unit N.M — Title**
> - **Objective** — one sentence.
> - **Depends on** — prior units.
> - **Packages** — new npm deps.
> - **Schema** — migration(s) to add.
> - **Backend** — files + endpoints + logic.
> - **Frontend** — files + UI.
> - **Prompt** — AI design (if applicable).
> - **Tests** — what to assert.
> - **Acceptance** — observable done criteria.
> - **Commit** — suggested message / PR boundary.

### B. Database migrations (introduced in Unit 1.5.0)
SQLite schema is versioned via `PRAGMA user_version` and an ordered migration
list — no more relying on `CREATE TABLE IF NOT EXISTS` drift.

```js
// server/src/migrations.js
export const migrations = [
  // index i applies and bumps user_version to i+1. Never edit/reorder a
  // shipped migration; only append.
  (db) => { /* migration 1: full current baseline, all IF NOT EXISTS (idempotent) */ },
  (db) => { /* migration 2: ALTER TABLE documents ADD COLUMN extracted_text ... */ },
];

export function runMigrations(db) {
  const current = db.pragma('user_version', { simple: true });
  for (let v = current; v < migrations.length; v++) {
    db.transaction(() => {
      migrations[v](db);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}
```
`db.js` calls `runMigrations(db)` on boot instead of inline `db.exec`. Rule:
**migrations are append-only and idempotent where practical.**

### C. AI orchestration contract (introduced in Unit 1.5.2)
All Claude usage goes through one module. No route calls the Anthropic API
directly after Phase 1.5.

```js
// server/src/services/ai/orchestrator.js
export function aiEnabled();                       // ANTHROPIC_API_KEY present?

// Builds the candidate context string injected into every prompt.
// Pulls profile + experiences + education + DEFAULT RESUME extracted text.
export async function buildCandidateContext({ includeResume = true });

// Low-level call: handles model/version/headers/timeout/JSON tool-use.
async function complete({ system, user, maxTokens, jsonSchema });

// Task functions — each returns { ...result, source: 'ai'|'template', warning? }
// and each has a deterministic template fallback when !aiEnabled():
export async function coverLetter({ job });
export async function answerQuestion({ job, question });
export async function scoreJobs({ jobs });          // Phase 3
export async function positioning();                // Phase 3
export async function planQueries({ intent });      // Phase 3
export async function coachApplication({ application }); // Phase 4
```

- **Model/config:** `ANTHROPIC_MODEL` (default `claude-sonnet-4-6`),
  `anthropic-version: 2023-06-01`, `AbortSignal.timeout`.
- **Structured outputs** (scoring, positioning): use Anthropic **tool-use** with
  an `input_schema` to force valid JSON; parse defensively, fall back on error.
- **Caching:** in-memory `Map` keyed by `task + hash(context + input)`, TTL
  configurable (default 10 min). Same pattern as the job-search cache.
- **Token budgets:** declared per task in its unit.
- **Fallbacks:** every task works with no API key (template/heuristic), so the
  app never hard-depends on AI.

### D. Testing & CI (introduced in phase-correctness)
- **Server:** `node --test`, files `server/src/**/*.test.js`. Pure functions and
  DB logic tested against `better-sqlite3(':memory:')` with migrations applied.
- **Client:** `vitest` + `jsdom` + `@testing-library/react` for components and
  the `api.js` wrapper (fetch mocked).
- **CI:** `.github/workflows/ci.yml` — Node 20 & 22 matrix: install, lint,
  server tests, client build, client tests.
- **No network in tests:** provider modules are tested with `fetch` stubbed;
  never hit live boards (also matches the sandbox network policy).

### E. Definition of done (per unit)
1. Code + tests committed on a feature branch, one unit per PR.
2. `node --test` (server) and `vitest` (client) green; client build passes.
3. Acceptance criteria demonstrably met (manual note or test).
4. Docs touched if behavior/setup changed (`README.md`, `.env.example`).
5. No new direct Anthropic calls outside the orchestrator; no schema change
   outside a migration.

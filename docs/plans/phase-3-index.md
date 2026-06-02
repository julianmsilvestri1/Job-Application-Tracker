# Phase 3 — Execution Index & Build Plan

This is the **execution index** for Phase 3 (Personalized Discovery). It turns the
unit spec in [`phase-3-discovery.md`](./phase-3-discovery.md) into a concrete,
ordered build plan with the exact files, schema, endpoints, prompts, and tests
that ship. Phase 1.5 and the cross-cutting correctness phase are complete; this
plan assumes the [shared conventions](./README.md) (migrations, AI orchestration,
template fallbacks, testing/CI).

> Status legend: ✅ done · 🟡 in progress · ⬜ not started

## Status: ✅ complete

All four units shipped with deterministic fallbacks. 53 server + 10 client tests
green; lint clean (`--max-warnings 0`); client build passes; manual end-to-end
walkthrough captured.

## Goal

Make the portal **personalized**: rank every posting by an explainable fit score,
surface a profile-driven "Recommended for you" feed, give the candidate
positioning guidance, and let the AI expand vague searches into better coverage —
all working **with or without** an `ANTHROPIC_API_KEY` (deterministic heuristics
back every AI task).

## Architecture additions

```
orchestrator.scoreJobs / positioning / planQueries   ← new AI tasks (tool-use JSON)
        │  every task has a deterministic fallback in
        ▼
services/ai/heuristics.js   ← pure, DB-free scoring/positioning/query helpers (unit-tested)
        │
        ▼
job_scores (DB cache)   search_preferences (DB)   ← migrations 4 & 5
        │
        ▼
routes: POST /api/jobs/score · GET /api/jobs/search?rank=true · GET /api/jobs/recommended
        GET/PUT /api/preferences · GET /api/assistant/positioning · GET /api/assistant/plan-queries
        │
        ▼
client: Search (fit badges, Sort by fit, ✨ Improve my search)
        Dashboard (Recommended for you) · Profile (Job preferences + Positioning)
```

Design rules carried from the conventions:
- **No direct Anthropic calls** outside `orchestrator.js`.
- **Structured AI outputs** use Anthropic tool-use with an `input_schema`; parsing
  is defensive and falls back to the heuristic on any error.
- **Scoring is the priciest call** → batched (≤8 jobs/call) and cached in the
  `job_scores` table keyed by `(job_key, profile_hash)`; only uncached jobs hit AI.
- **Pure heuristics** live in `heuristics.js` so they can be unit-tested without a
  DB or network, matching the "no network in tests" rule.

## Work units (ordered)

### Unit 3.1 — AI job-fit scoring ✅
- **Schema:** migration 4 adds `job_scores(job_key, profile_hash, score, reasons,
  gaps, method, created_at)` (PK `job_key, profile_hash`).
- **Heuristics:** `heuristicScore(candidate, job)` → `{ score 0–100, reasons[],
  gaps[] }` from skill/title overlap.
- **Orchestrator:** `scoreJobs({ jobs, db, refresh })` — builds candidate context
  once, computes `profile_hash`, reads cached scores, batches uncached jobs to
  Claude (tool-use `{ results:[{job_key,score,reasons,gaps}] }`), persists, and
  fills any gaps with the heuristic. Returns scores aligned to input jobs, each
  tagged `source: 'ai' | 'heuristic' | 'cache'`.
- **Endpoints:** `POST /api/jobs/score {jobs}` and `GET /api/jobs/search?rank=true`
  (attaches a `fit` object to each job).
- **Frontend:** fit badge (`87% fit`) per result, expandable reasons/gaps, and a
  "Sort by fit" toggle (`FitBadge` + `JobCard`).
- **Tests:** heuristic band test; AI path parses tool JSON; cache hit avoids a 2nd
  call; model-omission + API-error fall back to heuristic; client FitBadge + sort.

### Unit 3.2 — Preferences & "Recommended for you" ✅
- **Schema:** migration 5 adds `search_preferences` (single row, id=1).
- **Endpoints:** `GET/PUT /api/preferences`; `GET /api/jobs/recommended` builds
  queries from prefs (or, when empty, from `planQueries` over the profile), runs
  `searchAll`, scores, returns top N. Cached for the search TTL.
- **Frontend:** Profile "Job preferences" card; Dashboard "Recommended for you".

### Unit 3.3 — Positioning suggestions ✅
- **Orchestrator:** `positioning({ db, refresh })` → `{ headlines[], targetTitles[],
  keywordStrategy[], summaryRewrite }`; heuristic fallback from skills/recent titles.
- **Endpoint:** `GET /api/assistant/positioning`.
- **Frontend:** Profile "Positioning" panel — apply a headline / summary to the
  profile in one click; target titles deep-link into Search (`/search?q=`).

### Unit 3.4 — AI query planning / expansion ✅
- **Orchestrator:** `planQueries({ intent, db, refresh })` → `{ queries:[{query,
  location?, remote?}], rationale }`; heuristic = synonym/skill expansion.
- **Endpoint:** `GET /api/assistant/plan-queries?intent=…` (also used by
  `/recommended`).
- **Frontend:** Search "✨ Improve my search" runs the expanded multi-query search
  and merges results.

## Phase exit criteria (all pass)
- [x] Jobs sortable by explainable fit score (AI + heuristic fallback).
- [x] Dashboard "Recommended for you" driven by preferences/profile.
- [x] Positioning suggestions actionable from Profile.
- [x] Query planning improves search coverage.
- [x] Scoring cached; token cost bounded by batching + cache.
- [x] All server (`node --test`) and client (`vitest`) tests green; lint clean;
      client build passes; manual end-to-end walkthrough captured.

# Phase 3 — Personalized Discovery

**Goal:** the highest-visibility payoff — rank jobs by fit, recommend roles, and
suggest positioning. Depends on Phase 1.5 (documents feed the AI). See
conventions in [README.md](./README.md).

**Units:** 3.1 → 3.2 → 3.3 → 3.4

---

## Unit 3.1 — AI job-fit scoring
- **Objective:** score how well a posting fits the candidate, with reasons.
- **Depends on:** 1.5.2.
- **Schema (migration):** cache table (scoring is the priciest AI call):
  ```sql
  CREATE TABLE job_scores (
    job_key text not null,          -- source:externalId
    profile_hash text not null,     -- hash of candidate context
    score integer,                  -- 0..100
    reasons text,                   -- JSON array of strings
    gaps text,                      -- JSON array of strings
    created_at text default (datetime('now')),
    primary key (job_key, profile_hash)
  );
  ```
- **Backend:** `orchestrator.scoreJobs({ jobs })`:
  - **Batch** up to N (~8) jobs per Claude call to save tokens.
  - **Tool-use JSON** with `input_schema`:
    `{ results: [{ job_key, score, reasons[], gaps[] }] }`.
  - System prompt: score fit of candidate context vs. each job; reasons cite
    candidate strengths, gaps cite missing requirements; deterministic-ish
    (low temperature).
  - Cache by `(job_key, profile_hash)`; only call AI for uncached jobs.
  - **Fallback (no key):** heuristic score = keyword overlap between profile
    skills/headline and job title/description (0–100), with reasons listing
    matched terms. So ranking works key-free, just coarser.
  - Endpoint: extend `GET /api/jobs/search` with `&rank=true`, or
    `POST /api/jobs/score {jobs}` returning scores to merge client-side.
- **Frontend:** Search results show a fit badge (e.g. `87% fit`), expandable to
  reasons/gaps; a "Sort by fit" toggle.
- **Tests:** heuristic scorer unit test (overlap → expected band); AI path with
  stubbed `fetch` returning tool JSON parses into scores; cache hit avoids a 2nd
  call.
- **Acceptance:** results can be sorted by fit; each score explains itself; works
  with and without an API key.
- **Commit:** `feat(discovery): AI job-fit scoring with caching`

---

## Unit 3.2 — Search preferences & "Recommended for you" feed
- **Objective:** a profile-driven feed surfaced on the Dashboard.
- **Depends on:** 3.1.
- **Schema (migration):**
  ```sql
  CREATE TABLE search_preferences (
    id integer primary key check (id = 1),
    titles text default '[]',       -- JSON array
    locations text default '[]',    -- JSON array
    keywords text default '[]',     -- JSON array
    remote_only integer default 0,
    min_salary text default '',
    sources text default '[]',      -- empty = all
    updated_at text default (datetime('now'))
  );
  ```
- **Backend:** `GET/PUT /api/preferences`. New `GET /api/jobs/recommended`:
  build queries from preferences (or, if empty, derive from profile
  headline/skills via `planQueries` — Unit 3.4), run `searchAll`, score (3.1),
  return top N. Cache for the search-cache TTL.
- **Frontend:** Profile gets a "Job preferences" card; Dashboard gets a
  "Recommended for you" section (top scored jobs with Save/Apply/Assistant
  actions reused from Search).
- **Tests:** preferences CRUD; recommended endpoint composes queries from prefs
  (providers stubbed).
- **Acceptance:** Dashboard shows relevant ranked jobs based on preferences/profile.
- **Commit:** `feat(discovery): recommended-for-you feed + preferences`

---

## Unit 3.3 — Positioning suggestions
- **Objective:** brand/positioning guidance for the candidate.
- **Depends on:** 1.5.2.
- **Backend:** `orchestrator.positioning()` (tool-use JSON):
  `{ headlines: string[], targetTitles: string[], keywordStrategy: string[],
  summaryRewrite: string }` from candidate context. Fallback = heuristic from
  skills/recent titles. Endpoint `GET /api/assistant/positioning`.
- **Frontend:** Profile "Positioning" panel: shows headline variants (one-click
  apply to `profile.headline`), target titles (one-click search), keyword list,
  optional summary rewrite (one-click apply).
- **Tests:** fallback returns non-empty arrays; AI JSON parsed defensively.
- **Acceptance:** suggestions are specific to the profile; applying a headline
  updates the profile.
- **Commit:** `feat(discovery): positioning & keyword suggestions`

---

## Unit 3.4 — AI query planning / expansion
- **Objective:** expand a vague search into board-appropriate queries.
- **Depends on:** 1.5.2.
- **Backend:** `orchestrator.planQueries({ intent })` →
  `{ queries: [{ query, location?, remote? }], rationale }`. Used by `/recommended`
  (3.2) and offered in Search as "Improve my search". Fallback = synonym/skill
  expansion from profile.
- **Frontend:** Search "✨ Improve my search" button → fills in expanded terms /
  runs a multi-query search and merges results.
- **Tests:** fallback expansion includes profile skills; AI path parsed.
- **Acceptance:** a vague query returns materially better coverage.
- **Commit:** `feat(discovery): AI query planning`

---

## Phase exit criteria — ✅ complete
See [`completed/phase-3-index.md`](./completed/phase-3-index.md) for the as-built execution plan.
- [x] Jobs sortable by explainable fit score (AI + heuristic fallback).
- [x] Dashboard "Recommended for you" driven by preferences/profile.
- [x] Positioning suggestions actionable from Profile.
- [x] Query planning improves search coverage.
- [x] Scoring cached; token cost bounded by batching + cache.

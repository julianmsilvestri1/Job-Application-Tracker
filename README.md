# Job Application Portal

[![CI](https://github.com/julianmsilvestri1/job-application-tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/julianmsilvestri1/job-application-tracker/actions/workflows/ci.yml)

A tailored, local-first portal for your job hunt:

- 🔍 **Search** jobs across **eight** boards at once — Adzuna, Jooble, USAJOBS, Remotive, The Muse, RemoteOK, Arbeitnow and Jobicy. Adzuna and Jooble aggregate listings from Indeed, LinkedIn-adjacent boards and thousands of other sites; five of the eight need **no API key at all**.
- ⚡ **Autofill helper** — one-click copy of every profile field to paste into any application form.
- ✍️ **AI assistant** — generate tailored cover letters and draft answers to application questions, grounded in your real profile **and the extracted text of your uploaded resume**. Answers persist per application; everything has a no-API-key template fallback.
- 📋 **Tracker** — a pipeline (`saved → applied → interviewing → offer → rejected`) so you always know where each application stands.
- 👤 **Profile** — store personal info, work history, education, skills, reusable custom answers, and upload your resume/documents (text auto-extracted for the AI). This data powers everything else.
- 🎯 **Personalized discovery** *(Phase 3)* — explainable fit scores on search results, a “Recommended for you” dashboard feed, job preferences, positioning suggestions, and “Improve my search” query expansion (all with no-API-key fallbacks).

> **A note on Indeed & LinkedIn:** neither offers an open public job-search API, and scraping or programmatically auto-submitting applications on them violates their Terms of Service and is actively blocked. This app takes the compliant route: it pulls listings through legitimate aggregator APIs and **assists** your applications (autofill + AI drafting) rather than secretly submitting them for you. You stay in control and click "Apply" on the real site.

## Tech stack

| Layer    | Choice                                  |
|----------|-----------------------------------------|
| Frontend | React + Vite + React Router             |
| Backend  | Node.js + Express                       |
| Storage  | SQLite (`better-sqlite3`), local file   |
| AI       | Claude API (optional)                   |

## Getting started

Requires **Node.js 18+** (tested on 22).

```bash
# 1. Install everything (root tooling + server + client)
npm run install:all

# 2. Configure the server (optional but recommended)
cp server/.env.example server/.env
#   edit server/.env to add API keys

# 3. Run both server and client together
npm run dev
```

- Client (dev): http://localhost:5173
- API: http://localhost:4000

The app runs **with zero configuration** — five job boards (Remotive, The Muse,
RemoteOK, Arbeitnow, Jobicy) need no key, and cover letters fall back to a
built-in template. Each key you add unlocks more:

| Variable | Unlocks | Where to get it |
|----------|---------|-----------------|
| `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` | Indeed / LinkedIn-adjacent / broad listings | https://developer.adzuna.com/ |
| `JOOBLE_API_KEY` | Additional aggregated listings | https://jooble.org/api/about |
| `USAJOBS_API_KEY`, `USAJOBS_EMAIL` | US federal jobs | https://developer.usajobs.gov/ |
| `THE_MUSE_API_KEY` *(optional)* | Higher Muse rate limit | https://www.themuse.com/developers/api/v2 |
| `ANTHROPIC_API_KEY` | AI-tailored cover letters & answers | https://console.anthropic.com/ |

### How search works across boards

Boards like Adzuna, Jooble and USAJOBS support server-side keyword/location
search. Boards that don't (The Muse, RemoteOK, Arbeitnow, Jobicy) are fetched
and **filtered locally** by your query. Every provider runs in parallel with a
per-source timeout, results are de-duplicated and sorted by recency, and
identical searches are cached for 5 minutes — so one slow or failing board
never breaks or delays your search.

## Production build

```bash
npm run build      # builds the client into client/dist
npm start          # Express serves the API + the built client on :4000
```

## Project structure

```
.
├── server/                 # Express + SQLite API
│   ├── src/
│   │   ├── index.js        # app entry
│   │   ├── db.js           # SQLite connection
│   │   ├── migrations.js   # versioned schema migrations (PRAGMA user_version)
│   │   ├── routes/         # profile, documents, jobs, applications, answers, assistant
│   │   └── services/
│   │       ├── jobProviders/   # 8 boards + util + aggregator (cache, dedupe, timeouts)
│   │       ├── documents/      # resume text extraction (PDF/DOCX/TXT)
│   │       └── ai/             # orchestrator, heuristics, embeddings (RAG)
│   ├── uploads/            # uploaded resumes (gitignored)
│   └── data/               # SQLite db file (gitignored)
├── client/                 # React (Vite) frontend
│   └── src/
│       ├── pages/          # Dashboard, Search, Applications, Profile
│       └── components/     # AssistantModal, AutofillPanel, FitBadge, JobCard
└── extension-safari/       # Phase 2: Safari autofill extension (scaffold)
```

## Phase buildout

This project is built in **phases**, not as one big release. Each phase has a
spec under [`docs/plans/`](./docs/plans/README.md); [`ROADMAP.md`](./ROADMAP.md)
covers architecture, risks, and sequencing in more depth. The
[master plan](./docs/plans/master-plan-autonomous-apply.md) is the north star
toward autonomous, human-in-the-loop applying (Phase 6).

**Status legend:** ✅ **Complete** · 🟡 **In progress** · ⬜ **Not started**

### At a glance

| Phase | Name | Status | What it adds |
|-------|------|--------|----------------|
| **1** | Core portal | ✅ | Multi-board search, profile, tracker, in-app autofill, AI cover letters & Q&A |
| **1.5** | Intelligence foundation | ✅ | Resume extraction, AI orchestrator, persisted answers, migrations, profile editing |
| **X** | Correctness & quality | ✅ | Tests, ESLint, CI, search de-dupe & query fixes |
| **3** | Personalized discovery | ✅ | Fit scoring, recommended feed, preferences, positioning, query planning |
| **3.5** | Local RAG / semantic layer | 🟡 | Embeddings + retrieval (see below) |
| **2** | Real apply assistance | ⬜ | Production extension, apply checklist, documents ↔ applications |
| **4** | Tracker intelligence | ⬜ | Coaching, document variants, analytics, calendar/contacts |
| **6** | Autonomous apply engine | ⬜ | Field resolver, apply plans, extension autopilot, approval gate, optional Playwright runner |
| **7** | Connected portal | ⬜ | SSE live tracker, MCP server for Claude Desktop/Cursor |
| **5** | Scale *(optional)* | ⬜ | Auth & multi-device sync |

**Recommended build order:** `1.5` → `correctness` → `3` → **`3.5`** → `2` → `4` → `6` → `7` → `5 (opt)`.

**Current focus:** finish the **discovery track** — **Phase 3** (shipped) plus **Phase 3.5** (RAG), then Phase 2 apply assistance.

---

### Phase 1 — Core portal ✅

**Goal:** a usable local job-hunt workspace without external automation.

| Delivered | In the app today |
|-----------|------------------|
| Search across 8 job boards (5 key-free) | Search page, provider status |
| Profile, skills, experience, education | Profile page |
| Document upload & storage | Profile → documents |
| Application tracker pipeline | Applications page |
| In-app autofill copy panel | Autofill helper |
| AI cover letters & application Q&A (template fallback) | Assistant modal |

**Missing / later phases:** browser extension autofill (Phase 2), fit ranking (Phase 3), autonomous apply (Phase 6).

---

### Phase 1.5 — Intelligence foundation ✅

**Goal:** make uploaded resumes real AI context and route all Claude calls through one module.

| Unit | Status | Delivered |
|------|--------|-----------|
| Versioned SQLite migrations | ✅ | `server/src/migrations.js` |
| PDF/DOCX/TXT extraction on upload | ✅ | `services/documents/extract.js` |
| AI orchestrator (cover letter, answers) | ✅ | `services/ai/orchestrator.js` |
| Persisted application answers | ✅ | `application_answers` table |
| Q&A template fallback (no API key) | ✅ | Orchestrator fallbacks |
| Editable experience & education | ✅ | Profile UI |
| Global error toasts | ✅ | `Toaster` component |

**Spec:** [`docs/plans/phase-1.5-foundation.md`](./docs/plans/phase-1.5-foundation.md)

---

### Cross-cutting — Correctness & quality ✅

**Goal:** trustworthy search and a test/CI baseline before larger features.

| Item | Status |
|------|--------|
| De-dupe by canonical URL/id | ✅ |
| Jobicy / The Muse query fidelity | ✅ |
| Server tests (`node --test`) + client tests (Vitest) | ✅ |
| ESLint (`npm run lint`) | ✅ |
| GitHub Actions CI (Node 20 & 22) | ✅ |

**Spec:** [`docs/plans/phase-correctness.md`](./docs/plans/phase-correctness.md)

---

### Phase 3 — Personalized discovery ✅

**Goal:** rank jobs by fit, recommend roles, and help with positioning and search coverage.

| Unit | Status | Delivered |
|------|--------|-----------|
| **3.1** Job-fit scoring (AI + heuristic, cached) | ✅ | Fit badges, “Sort by fit”, `POST /api/jobs/score` |
| **3.2** Preferences & recommended feed | ✅ | Dashboard “Recommended for you”, `search_preferences` |
| **3.3** Positioning suggestions | ✅ | Profile positioning panel, apply headline/summary |
| **3.4** AI query planning | ✅ | Search “✨ Improve my search” |

All four units ship **with or without** `ANTHROPIC_API_KEY` (heuristic fallbacks in `services/ai/heuristics.js`).

**Specs:** [`phase-3-discovery.md`](./docs/plans/phase-3-discovery.md) · as-built index: [`completed/phase-3-index.md`](./docs/plans/completed/phase-3-index.md)

**Not in Phase 3 (planned for 3.5):** retrieval-augmented prompts, semantic near-dedupe, answer “voice memory”.

---

### Phase 3.5 — Local RAG / semantic layer 🟡 *in progress*

**Goal:** embed your profile, answers, and résumé locally; retrieve only the most relevant chunks for each AI task instead of sending the full profile every time.

| Unit | Status | What’s done / missing |
|------|--------|------------------------|
| **3.5.0** Embedding service + vector store | 🟡 | `embeddings` table + `services/ai/embeddings.js` (hash-based embedder, pure-JS cosine); neural MiniLM opt-in still per spec |
| **3.5.1** Index knowledge base on save + boot backfill | ⬜ | No `indexer.js` yet |
| **3.5.2** Retrieval-augmented context in orchestrator | ⬜ | `buildCandidateContext` still uses full profile |
| **3.5.3** Semantic fit blend + near-duplicate detection | ⬜ | Phase 3 fit still keyword/heuristic + AI |
| **3.5.4** Answer memory from user edits | ⬜ | No `answer_edits` table yet |

**Exit criteria (phase not done until all pass):** see checklist in [`phase-3.5-rag-semantic.md`](./docs/plans/phase-3.5-rag-semantic.md).

---

### Phase 2 — Real apply assistance ⬜

**Goal:** guided, human-in-the-loop applying — not silent auto-submit on Indeed/LinkedIn/major ATS.

| Planned | Status |
|---------|--------|
| Production Safari/Chrome extension (per-ATS field maps) | ⬜ Scaffold only in [`extension-safari/`](./extension-safari/) |
| Per-application apply checklist (steps, deadlines) | ⬜ |
| Link documents ↔ applications (which resume was sent) | ⬜ |

**Spec:** [`docs/plans/phase-2-apply.md`](./docs/plans/phase-2-apply.md)

---

### Phase 4 — Tracker intelligence & document variants ⬜

**Goal:** smarter pipeline management and per-job tailored documents.

| Planned | Status |
|---------|--------|
| AI next actions, follow-ups, interview prep | ⬜ |
| Per-job resume/cover variants (“Resume v2 for Stripe”) | ⬜ |
| Offer comparison, export, analytics, calendar/contacts | ⬜ |

**Spec:** [`docs/plans/phase-4-tracker.md`](./docs/plans/phase-4-tracker.md)

---

### Phase 6 — Autonomous apply engine ⬜

**Goal:** the “apply for me” north star — answer vault, field resolver, apply plans, extension autopilot, approval gate, audit log, optional local Playwright runner on **eligible** hosts only (LinkedIn/Indeed stay denylisted).

**Spec:** [`docs/plans/master-plan-autonomous-apply.md`](./docs/plans/master-plan-autonomous-apply.md) (Phase 6 units 6.0–6.7)

---

### Phase 7 — Connected portal ⬜

**Goal:** real-time tracker updates (SSE) and an MCP server so Claude Desktop/Cursor can search, draft, and update pipeline status — never auto-submit.

**Spec:** [`docs/plans/phase-7-connected-portal.md`](./docs/plans/phase-7-connected-portal.md)

---

### Phase 5 — Scale *(optional)* ⬜

**Goal:** auth and multi-device sync if local-only SQLite is outgrown.

**Spec:** [`docs/plans/phase-5-scale.md`](./docs/plans/phase-5-scale.md)

---

### Planning docs map

| Document | Use when you need… |
|----------|-------------------|
| [`ROADMAP.md`](./ROADMAP.md) | Architecture diagram, risks, honest constraints |
| [`docs/plans/README.md`](./docs/plans/README.md) | Index of all phase specs + shared conventions |
| [`docs/plans/master-plan-autonomous-apply.md`](./docs/plans/master-plan-autonomous-apply.md) | Full autonomous-apply vision and Phase 6 detail |

## Data & privacy

Everything is stored locally: SQLite (`server/data/app.db`) and uploaded files
(`server/uploads/`). Nothing leaves your machine except (a) the job-search
queries you run and (b) the profile/job text sent to Anthropic **only if** you
enable AI. Both data and uploads are gitignored.

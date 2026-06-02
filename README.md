# Job Application Portal

[![CI](https://github.com/julianmsilvestri1/job-application-tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/julianmsilvestri1/job-application-tracker/actions/workflows/ci.yml)

A tailored, local-first portal for your job hunt:

- 🔍 **Search** jobs across **eight** boards at once — Adzuna, Jooble, USAJOBS, Remotive, The Muse, RemoteOK, Arbeitnow and Jobicy. Adzuna and Jooble aggregate listings from Indeed, LinkedIn-adjacent boards and thousands of other sites; five of the eight need **no API key at all**.
- ⚡ **Autofill helper** — one-click copy of every profile field to paste into any application form.
- ✍️ **AI assistant** — generate tailored cover letters and draft answers to application questions, grounded in your real profile **and the extracted text of your uploaded resume**. Answers persist per application; everything has a no-API-key template fallback.
- 🎯 **Personalized discovery** — score jobs by fit, explain strengths/gaps, save search preferences, get Dashboard recommendations, generate positioning suggestions, and expand vague searches with AI-assisted query planning.
- 📋 **Tracker** — a pipeline (`saved → applied → interviewing → offer → rejected`) so you always know where each application stands.
- 👤 **Profile** — store personal info, work history, education, skills, reusable custom answers, and upload your resume/documents (text auto-extracted for the AI). This data powers everything else.

> **A note on Indeed & LinkedIn:** neither offers an open public job-search API, and scraping or programmatically auto-submitting applications on them violates their Terms of Service and is actively blocked. This app takes the compliant route: it pulls listings through legitimate aggregator APIs and **assists** your applications (autofill + AI drafting) rather than secretly submitting them for you. You stay in control and click "Apply" on the real site.

## Tech stack

| Layer    | Choice                                  |
|----------|-----------------------------------------|
| Frontend | React + Vite + React Router             |
| Backend  | Node.js + Express                       |
| Storage  | SQLite (`better-sqlite3`), local file   |
| AI       | Claude API (optional, with fallbacks)   |

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
| `ANTHROPIC_API_KEY` | AI-tailored cover letters, answers, fit scoring, positioning and query planning | https://console.anthropic.com/ |

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
│   │       └── ai/             # orchestrator: all Claude usage (cover letters, answers)
│   ├── uploads/            # uploaded resumes (gitignored)
│   └── data/               # SQLite db file (gitignored)
├── client/                 # React (Vite) frontend
│   └── src/
│       ├── pages/          # Dashboard, Search, Applications, Profile
│       └── components/     # AssistantModal, AutofillPanel
└── extension-safari/       # Phase 2: Safari autofill extension (scaffold)
```

## Roadmap

- **Phase 1.5 (done):** documents as AI context, AI orchestration, application answers, multi-board search, full tracker, profile + resume storage.
- **Phase 3 (done):** explainable fit scoring, recommendations, search preferences, positioning suggestions, and query planning.
- **Phase 2:** Safari Web Extension that injects autofill directly into external application forms — scaffold in [`extension-safari/`](./extension-safari/).

## Data & privacy

Everything is stored locally: SQLite (`server/data/app.db`) and uploaded files
(`server/uploads/`). Nothing leaves your machine except (a) the job-search
queries you run and (b) the profile/job text sent to Anthropic **only if** you
enable AI. Both data and uploads are gitignored.

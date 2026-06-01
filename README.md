# Job Application Portal

A tailored, local-first portal for your job hunt:

- 🔍 **Search** jobs across multiple boards at once (Adzuna, Jooble, Remotive) — Adzuna and Jooble aggregate listings from Indeed, LinkedIn-adjacent boards and thousands of other sites.
- ⚡ **Autofill helper** — one-click copy of every profile field to paste into any application form.
- ✍️ **AI assistant** — generate tailored cover letters and draft answers to application questions, grounded in your real profile.
- 📋 **Tracker** — a pipeline (`saved → applied → interviewing → offer → rejected`) so you always know where each application stands.
- 👤 **Profile** — store personal info, work history, education, skills, reusable custom answers, and upload your resume/documents. This data powers everything else.

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

The app runs **with zero configuration** — Remotive needs no key and cover
letters fall back to a built-in template. Each key you add unlocks more:

| Variable | Unlocks | Where to get it |
|----------|---------|-----------------|
| `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` | Indeed / LinkedIn-adjacent / broad listings | https://developer.adzuna.com/ |
| `JOOBLE_API_KEY` | Additional aggregated listings | https://jooble.org/api/about |
| `ANTHROPIC_API_KEY` | AI-tailored cover letters & answers | https://console.anthropic.com/ |

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
│   │   ├── db.js           # SQLite schema & connection
│   │   ├── routes/         # profile, documents, jobs, applications, assistant
│   │   └── services/
│   │       ├── jobProviders/   # adzuna, jooble, remotive + aggregator
│   │       └── assistant.js    # Claude-backed cover letters / answers
│   ├── uploads/            # uploaded resumes (gitignored)
│   └── data/               # SQLite db file (gitignored)
├── client/                 # React (Vite) frontend
│   └── src/
│       ├── pages/          # Dashboard, Search, Applications, Profile
│       └── components/     # AssistantModal, AutofillPanel
└── extension-safari/       # Phase 2: Safari autofill extension (scaffold)
```

## Roadmap

- **Phase 1 (done):** in-app autofill helper, AI cover letters / answers, multi-board search, full tracker, profile + resume storage.
- **Phase 2:** Safari Web Extension that injects autofill directly into external application forms — scaffold in [`extension-safari/`](./extension-safari/).

## Data & privacy

Everything is stored locally: SQLite (`server/data/app.db`) and uploaded files
(`server/uploads/`). Nothing leaves your machine except (a) the job-search
queries you run and (b) the profile/job text sent to Anthropic **only if** you
enable AI. Both data and uploads are gitignored.

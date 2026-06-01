# Roadmap

This document turns the project audit into a plan. It captures the **current
state**, the **target architecture**, the **phased work**, and the **risks &
constraints** to keep expectations honest. Nothing here is implemented yet
beyond what is marked ✅.

> Status legend: ✅ done · 🟡 partial · ⬜ not started

---

## 1. Current state

### Done well ✅
- Local monorepo (`client` + `server` + `extension-safari` scaffold).
- Multi-board search aggregator with **8 providers** (5 key-free): Adzuna,
  Jooble, USAJOBS, Remotive, The Muse, RemoteOK, Arbeitnow, Jobicy.
- Aggregator robustness: per-source timeouts, graceful per-source errors,
  local keyword/location filtering, cross-board de-dupe, recency sort,
  5-minute result cache.
- Profile (personal info, skills, experience, education, custom answers).
- Document vault (upload/download/default/delete, gitignored storage).
- Application tracker (saved → applied → interviewing → offer → rejected),
  notes, per-application cover letter.
- Claude-assisted **cover letters** and **application Q&A** (template fallback
  for cover letters).

### Not yet aligned with the full vision
- **Discovery/personalization:** no fit ranking, no "recommended for you", no
  positioning/keyword strategy, no learning from tracker history.
- **AI scope is narrow:** Claude is a bolt-on to two endpoints; there is no
  shared orchestration layer coordinating search → match → tailor → track →
  apply.
- **Uploaded PDFs are inert:** resumes are files on disk, never extracted into
  profile/prompt context. Blocks "tailor from my real CV" and upload-driven
  autofill.
- **Tailoring uses structured DB fields**, not resume content; no per-job
  document variants; documents are not linked to applications; Q&A answers are
  not persisted.
- **Apply path is assist-only:** no guided per-employer/ATS checklist; the
  extension is a non-shipping scaffold.
- **Tracker is a basic CRM:** no calendar/reminders/contacts, no interview-stage
  detail, no offer comparison, no export/search/analytics beyond status counts.
- **Quality gaps:** no tests/lint/CI; no auth (fine locally); experience/
  education UI is add/delete only; several silent `catch(() => {})` client loads.

---

## 2. Target architecture

The end state is **not a rewrite** — it adds two things to today's code: (1)
documents become first-class AI context, and (2) a thin AI orchestration module
the rest of the app calls into.

```
┌─────────────────────────────────────────────────────────────┐
│                     AI orchestration layer                   │
│  (Claude): match score, positioning, tailor docs, coach      │
└───────────────┬─────────────────────────────┬───────────────┘
                │                             │
    ┌───────────▼──────────┐      ┌───────────▼──────────┐
    │  Job intelligence     │      │  Application engine   │
    │  search + rank + feed │      │  autofill + steps +   │
    │                       │      │  extension + tracker  │
    └───────────┬──────────┘      └───────────┬──────────┘
                │                             │
    ┌───────────▼─────────────────────────────▼──────────┐
    │           Profile + document intelligence           │
    │  structured fields + extracted PDF text + versions  │
    └────────────────────────────────────────────────────┘
```

**Proposed module boundaries (server):**
- `services/ai/orchestrator.js` — single entry for AI tasks (match, tailor,
  coach, queryPlan), owns model/prompt/caching policy. `assistant.js` folds in.
- `services/documents/extract.js` — PDF/DOCX → text; stored alongside the
  document row; injected into prompts.
- `services/jobProviders/*` — unchanged interface; add per-provider `dedupeKey`.

---

## 3. Phased plan

> **Build-ready detail:** each phase below has a step-by-step implementation spec
> (work units, file paths, schema/migrations, API contracts, prompts, tests,
> acceptance criteria) under [`docs/plans/`](./docs/plans/README.md).


### Phase 1.5 — Intelligence foundation 🟡 (highest leverage)
Goal: make documents real AI context and consolidate AI behind one module.
- ⬜ PDF/DOCX text extraction on upload; persist extracted text on the document
  row (`documents.extracted_text`).
- ⬜ Inject default-resume text into cover-letter and Q&A prompts (tailor from
  the real CV, not just structured fields).
- ⬜ Add `services/ai/orchestrator.js`; migrate `assistant.js` calls through it
  (shared model/version/caching config).
- ⬜ Persist Assistant **Q&A** answers (new `application_answers` table linked to
  `applications`).
- ⬜ Q&A **template fallback** when `ANTHROPIC_API_KEY` is absent (parity with
  cover letters). *(Issue: #qa-fallback)*
- ⬜ Profile UI: **edit** experience/education (API already supports it).
- ⬜ Surface client load errors instead of silent `catch(() => {})`.

**Acceptance:** uploading a resume measurably changes generated cover letters;
Q&A persists and survives reload; no AI key still yields useful drafts.

### Phase 2 — Real apply assistance ⬜
- ⬜ Production extension: remove ESM `export` from content script (bundle or
  inline), configurable portal URL (not hardcoded `localhost:4000`),
  per-ATS field maps (Greenhouse, Lever, Workday, Ashby), committed
  Safari/Xcode project via `safari-web-extension-converter`.
- ⬜ Per-application **apply checklist** (steps, deadline, required attachments).
- ⬜ Link documents ↔ applications (which resume/cover letter was sent).

**Constraint:** stays human-in-the-loop; no auto-submit on Indeed/LinkedIn/ATS.

### Phase 3 — Personalized discovery ⬜
- ⬜ AI **job-fit score** per posting (explainable: why it matches).
- ⬜ **Recommended for you** feed ranked against profile + resume text.
- ⬜ **Positioning suggestions**: headline variants, title targeting, keyword
  strategy; AI query expansion/planning for search.

### Phase 4 — Tracker intelligence & document variants ⬜
- ⬜ AI **next actions**, follow-up reminders, interview prep per application.
- ⬜ Per-job **document variants** ("Resume v2 for Stripe") tied to applications.
- ⬜ Offer comparison; tracker search; analytics beyond status counts; export.
- ⬜ Calendar/reminders, contacts.

### Phase 5 — Scale (optional) ⬜
- ⬜ Auth + multi-device sync if single-machine SQLite is outgrown.

### Cross-cutting — Correctness & quality ⬜
- ⬜ De-dupe by stable URL/id (not company+title); revisit Jooble hash identity.
- ⬜ Jobicy: pass **all** keywords / multiple tags, not just the first.
- ⬜ Fix `db.js` `applications.source` comment (lists 4; code supports 8 + manual).
- ⬜ Tests (Vitest/node:test), lint (ESLint), CI (GitHub Actions).

---

## 4. Risks & constraints (keep expectations honest)

1. **No Indeed/LinkedIn parity.** No official open API; scraping/auto-submit
   violates ToS and is blocked. Coverage depends on Adzuna/Jooble aggregation —
   results will not mirror those sites 1:1.
2. **AI is currently a bolt-on**, not orchestration. Phase 1.5 fixes the
   architecture, not just features.
3. **Uploaded PDFs are inert until extraction ships.** "Tailor from my real CV"
   and upload-driven autofill are blocked on Phase 1.5.
4. **Client-side filtered boards** (The Muse, RemoteOK, Arbeitnow, Jobicy) are
   weak for precise queries; Jobicy currently uses only the first keyword.
5. **De-dupe is company+title**, so cross-board duplicates are possible;
   Jooble's hashed id complicates stable tracking.
6. **Extension is a scaffold**, not shippable (ESM `export` in content script,
   hardcoded URL, no per-site maps, no Xcode project). Validate in Safari/Chrome
   before relying on it.
7. **Compliance.** The "method of applying" must stay human-in-the-loop for
   Indeed/LinkedIn/major ATS unless you accept legal/ToS risk.

---

## 5. Suggested sequencing

`Phase 1.5` → `Cross-cutting correctness` → `Phase 3 (discovery)` →
`Phase 2 (apply)` → `Phase 4 (tracker AI)` → `Phase 5 (scale)`.

Rationale: 1.5 unblocks the most vision features at once; correctness is cheap
and de-risks everything; discovery is the highest-visibility payoff once
documents feed the AI.

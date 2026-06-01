# Phase 4 — Tracker Intelligence & Document Variants

**Goal:** grow the tracker from basic CRM into an intelligent, document-aware hub.
Depends on Phase 1.5 (AI context) and 2.1 (doc↔app links). See conventions in
[README.md](./README.md).

**Units:** 4.1 → 4.2 → 4.3 → 4.4 → 4.5

---

## Unit 4.1 — AI next actions & coaching
- **Objective:** per-application guidance: next steps, follow-up timing, prep.
- **Depends on:** 1.5.2, 2.2.
- **Backend:** `orchestrator.coachApplication({ application })` (tool-use JSON):
  `{ nextActions: [{label, due_in_days}], followUp: {when, draftEmail}, status }`
  using application status, notes, dates, and job description. Endpoint
  `POST /api/applications/:id/coach`. Optionally write `nextActions` into
  `application_tasks` (from 2.2). Fallback = rules by status (e.g. `applied` +
  >7 days → "Send follow-up").
- **Frontend:** "Coach me" on each application → renders next actions (add to
  checklist) and a follow-up email draft (copy).
- **Tests:** rule fallback for each status; AI JSON parsed; actions can be added
  as tasks.
- **Acceptance:** an `applied` item older than a week suggests a follow-up with a
  draft email.
- **Commit:** `feat(tracker): AI next actions and follow-up coaching`

---

## Unit 4.2 — Interview prep generator
- **Objective:** tailored prep for an interviewing-stage application.
- **Depends on:** 1.5.2.
- **Backend:** `orchestrator.interviewPrep({ application })` →
  `{ likelyQuestions[], talkingPoints[], questionsToAsk[] }` from job + candidate
  context. Endpoint `POST /api/applications/:id/interview-prep`. Persist to a
  `prep_notes` column or `application_answers` (reuse). Fallback = generic role
  questions + profile talking points.
- **Frontend:** shown when status ∈ {interviewing}; saved with the application.
- **Tests:** fallback non-empty; AI parsed.
- **Acceptance:** interviewing items get specific, saved prep.
- **Commit:** `feat(tracker): interview prep generator`

---

## Unit 4.3 — Per-job document variants
- **Objective:** tailored resume/cover-letter variants tied to a job.
- **Depends on:** 1.5.1, 2.1.
- **Schema (migration):** extend `documents` with
  `derived_from integer` (source doc id) and `application_id integer` (nullable);
  add `type` values `resume_variant`, `cover_letter_variant`.
- **Backend:** `orchestrator.tailorResume({ application, baseDocumentId })` →
  tailored **text** (Markdown). Save as a new `documents` row (variant) linked via
  `application_documents`. Endpoint
  `POST /api/applications/:id/tailor-resume {baseDocumentId}`. Optional
  text→PDF render (`md-to-pdf` or `puppeteer`) is a sub-task; default to storing
  Markdown/TXT.
- **Frontend:** "Tailor resume for this job" → preview/edit → save variant →
  auto-attached (2.1). Variants listed in the document vault grouped by job.
- **Tests:** variant creation links to the application; fallback (no key) returns
  the base text with a note.
- **Acceptance:** "Resume v2 for <Company>" exists, is editable, and is attached.
- **Commit:** `feat(documents): per-job tailored resume variants`

---

## Unit 4.4 — Analytics, search & export
- **Objective:** insight beyond status counts.
- **Depends on:** none (data already present).
- **Backend:**
  - `GET /api/applications/analytics` → funnel conversion (saved→applied→
    interview→offer), applications-per-week, response rate, avg days-to-response.
  - `GET /api/applications?q=&source=&remote=` → text search + filters.
  - `GET /api/applications/export.csv` → CSV download.
- **Frontend:** Dashboard charts (lightweight — `recharts` or hand-rolled SVG);
  Applications search/filter bar; Export button.
- **Tests:** analytics math on a seeded `:memory:` DB; CSV shape; search filters.
- **Acceptance:** funnel + weekly volume render; search/filter works; CSV opens
  in a spreadsheet.
- **Commit:** `feat(tracker): analytics, search, and CSV export`

---

## Unit 4.5 — Contacts, reminders & calendar export
- **Objective:** lightweight CRM extras.
- **Depends on:** 2.2 (tasks/due dates) for reminders.
- **Schema (migration):**
  ```sql
  CREATE TABLE contacts (
    id integer primary key autoincrement,
    application_id integer, name text, role text, email text, phone text,
    notes text, created_at text default (datetime('now')),
    foreign key (application_id) references applications(id) on delete cascade
  );
  ```
  (Reminders reuse `application_tasks.due_date`.)
- **Backend:** contacts CRUD under `/api/applications/:id/contacts`;
  `GET /api/calendar.ics` exporting tasks with due dates + interview dates as
  VEVENTs (hand-built iCal — no dep).
- **Frontend:** contacts list per application; an "Upcoming" widget on the
  Dashboard (tasks due soon); "Add to calendar" link.
- **Tests:** contacts CRUD; iCal output contains expected VEVENTs.
- **Acceptance:** contacts persist per application; `.ics` imports into a calendar
  app with correct dates.
- **Commit:** `feat(tracker): contacts and calendar (.ics) export`

---

## Phase exit criteria
- [ ] Applications get AI next actions + follow-up drafts (rule fallback).
- [ ] Interview-stage items get saved prep.
- [ ] Per-job tailored resume variants exist and attach to applications.
- [ ] Funnel/volume analytics, tracker search, and CSV export work.
- [ ] Contacts + `.ics` calendar export work.

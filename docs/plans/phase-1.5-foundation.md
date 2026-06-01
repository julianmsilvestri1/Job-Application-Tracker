# Phase 1.5 — Intelligence Foundation

**Status: ✅ COMPLETE** (Units 1.5.0–1.5.6 shipped & tested).

**Goal:** make uploaded documents first-class AI context and route all AI through
one orchestration module. This unblocks Phases 3–4. See conventions in
[README.md](./README.md).

**Outcome:** uploading a resume changes generated cover letters; AI is reachable
from one place; Q&A persists; everything still works with no API key.

**Units (in order):** 1.5.0 → 1.5.1 → 1.5.2 → 1.5.3 → 1.5.4 → 1.5.5 → 1.5.6

---

## Unit 1.5.0 — Migration framework
- **Objective:** version the SQLite schema so later units add columns safely.
- **Depends on:** none.
- **Packages:** none.
- **Schema:** introduce `PRAGMA user_version`. Migration #1 = current baseline
  (all existing `CREATE TABLE IF NOT EXISTS` statements, unchanged → idempotent
  on existing DBs).
- **Backend:**
  - New `server/src/migrations.js` exporting `migrations[]` and `runMigrations(db)`
    (see README §B).
  - `server/src/db.js`: move the inline `db.exec(schema)` into migration #1; call
    `runMigrations(db)` after opening the connection + pragmas. Keep the
    `INSERT OR IGNORE INTO profile (id) VALUES (1)` seed after migrations.
- **Frontend:** none.
- **Tests:** `server/src/migrations.test.js` — open `:memory:` DB, run
  `runMigrations` twice, assert `user_version === migrations.length` and that
  re-running is a no-op; assert all tables exist.
- **Acceptance:** fresh DB and an existing `data/app.db` both boot cleanly;
  `user_version` reflects migration count.
- **Commit:** `chore(db): add versioned migration framework`

---

## Unit 1.5.1 — Document text extraction
- **Objective:** extract text from uploaded resumes so AI can read them.
- **Depends on:** 1.5.0.
- **Packages:** `pdf-parse` (PDF), `mammoth` (DOCX). TXT read directly. (DOC
  legacy binary: skip — mark `unsupported`.)
- **Schema (migration #2):** `ALTER TABLE documents ADD COLUMN`
  - `extracted_text TEXT DEFAULT ''`
  - `extraction_status TEXT DEFAULT 'pending'`  (`pending|done|failed|unsupported`)
  - `extraction_error TEXT DEFAULT ''`
  - `text_chars INTEGER DEFAULT 0`
- **Backend:**
  - New `server/src/services/documents/extract.js`:
    `extractText({ path, mimetype }) -> { text, status, error }`. Dispatch by
    mimetype; cap stored text (e.g. 50k chars) and normalize whitespace.
  - `routes/documents.js` POST handler: after the row is inserted, run extraction
    (await — uploads are infrequent), then `UPDATE documents SET extracted_text,
    extraction_status, extraction_error, text_chars`.
  - New `POST /api/documents/:id/reextract` to retry a failed extraction.
  - `GET /api/documents` returns `extraction_status`, `text_chars` (NOT the full
    text); add `GET /api/documents/:id/text` for the extracted text.
- **Frontend:** `DocumentsCard` shows a status chip (`✓ text ready`,
  `⚠ no text — re-extract`) and a "Preview text" expander; wire re-extract.
- **Tests:** `extract.test.js` with a tiny fixture PDF/DOCX/TXT under
  `server/test/fixtures/`; assert non-empty text + `status==='done'`; assert
  unsupported mimetype → `unsupported`.
- **Acceptance:** uploading a real resume shows `text ready` and
  `GET /:id/text` returns readable content.
- **Commit:** `feat(documents): extract text from uploaded resumes`

---

## Unit 1.5.2 — AI orchestration module
- **Objective:** one module owns all Claude usage + candidate-context building.
- **Depends on:** 1.5.1.
- **Packages:** none (continue using `fetch`; optionally `@anthropic-ai/sdk`
  later — keep `fetch` for zero-dep parity).
- **Schema:** none.
- **Backend:**
  - New `server/src/services/ai/orchestrator.js` implementing the README §C
    contract: `aiEnabled`, `buildCandidateContext`, private `complete`,
    `coverLetter`, `answerQuestion` (others stubbed for later phases).
  - `buildCandidateContext({ includeResume })`: assemble profile + experiences +
    education + **default resume `extracted_text`** (the `documents` row with
    `type='resume' AND is_default=1`), truncated to a token budget (~6k chars).
  - In-memory cache + per-task token budgets (cover letter 900, answer 500).
  - **Refactor:** delete the Anthropic call from `services/assistant.js`; make
    `assistant.js` re-export the orchestrator's `coverLetter`/`answerQuestion`
    (or update `routes/assistant.js` to import the orchestrator). Keep route
    paths and response shape identical.
- **Frontend:** none (behavior improves invisibly — letters now reference resume).
- **Tests:** `orchestrator.test.js` — `aiEnabled()` false path returns template
  with `source:'template'`; `buildCandidateContext` includes resume text when a
  default resume exists (seed `:memory:` DB). Stub `fetch` to assert the resume
  text appears in the request body when AI is enabled.
- **Acceptance:** with a default resume uploaded + API key set, the cover letter
  references real resume content; with no key, template still returned.
- **Commit:** `refactor(ai): centralize Claude usage in an orchestration module`

---

## Unit 1.5.3 — Persist Assistant Q&A
- **Objective:** save generated application answers (parity with cover letters).
- **Depends on:** 1.5.2.
- **Schema (migration #3):**
  ```sql
  CREATE TABLE application_answers (
    id integer primary key autoincrement,
    application_id integer,            -- nullable: answers from search context
    job_title text default '',
    company text default '',
    question text not null,
    answer text default '',
    source text default 'ai',          -- ai | template | manual
    created_at text default (datetime('now')),
    foreign key (application_id) references applications(id) on delete cascade
  );
  ```
- **Backend:** `routes/applications.js` (or new `routes/answers.js`):
  - `POST /api/applications/:id/answers` — save `{question, answer, source}`.
  - `GET /api/applications/:id/answers` — list.
  - `DELETE /api/answers/:id`.
  - Optionally `POST /api/answers` with inline `{job_title, company}` for
    search-context answers (nullable `application_id`).
- **Frontend:** `AssistantModal` Q&A tab gains a **Save** button (calls save) and
  a list of previously saved answers for that application; `Applications.jsx`
  passes the application id.
- **Tests:** route test against `:memory:` — create app, post answer, list, delete.
- **Acceptance:** a saved answer survives reload and appears under its application.
- **Commit:** `feat(assistant): persist application Q&A answers`

---

## Unit 1.5.4 — Q&A template fallback
- **Objective:** useful answers even without an API key.
- **Depends on:** 1.5.2.
- **Schema:** none.
- **Backend:** in `orchestrator.answerQuestion`, add a heuristic template path
  when `!aiEnabled()`: classify common questions (why-this-company,
  greatest-strength, why-leaving, salary, availability, sponsorship) by keyword
  and compose an answer from profile facts (skills, headline, summary,
  work_authorization, desired_salary). Generic fallback otherwise. Return
  `source:'template'`.
- **Frontend:** none (modal already shows `source`/warning).
- **Tests:** `orchestrator.test.js` — for each question category, assert a
  non-empty answer that includes a relevant profile fact.
- **Acceptance:** with no API key, drafting an answer yields a sensible draft,
  not an empty box.
- **Commit:** `feat(assistant): template fallback for application answers`

---

## Unit 1.5.5 — Edit experience & education in UI
- **Objective:** close the add/delete-only gap (PUT endpoints already exist).
- **Depends on:** none (independent; do anytime).
- **Schema:** none.
- **Backend:** none (uses existing `PUT /profile/experiences/:id`,
  `/education/:id`).
- **Frontend:** `Profile.jsx` `ExperienceCard`/`EducationCard`: each row gets an
  Edit toggle → inline form pre-filled → Save (PUT) / Cancel. Reuse the draft
  form markup; extract a small `<ItemForm>` to avoid duplication.
- **Tests:** component test (vitest) — render with one item, click Edit, change a
  field, Save → asserts `api.updateExperience` called with new value (api mocked).
- **Acceptance:** editing a job title persists after reload.
- **Commit:** `feat(profile): edit experience and education entries`

---

## Unit 1.5.6 — Surface client load errors
- **Objective:** replace silent `catch(() => {})` with visible, non-blocking errors.
- **Depends on:** none.
- **Schema:** none.
- **Backend:** none.
- **Frontend:**
  - New `client/src/components/Toaster.jsx` + a tiny `useToast` context provider
    mounted in `App.jsx` (replaces the ad-hoc per-page `toast` state).
  - Replace `.catch(() => {})` in `Dashboard/Search/Applications/Profile` loads
    with `.catch((e) => toastError(e.message))`.
  - Optional `ErrorBoundary` around `<Routes>`.
- **Tests:** component test — a rejected api call triggers a visible toast.
- **Acceptance:** stopping the server then loading a page shows an error toast,
  not a blank panel.
- **Commit:** `feat(ui): surface load errors via a toast system`

---

## Phase exit criteria
- [x] Resume text demonstrably influences cover letters (test asserts resume text is in the AI request body).
- [x] All Claude calls flow through `orchestrator.js`; none elsewhere (old service deleted).
- [x] Q&A persists per application; visible after reload.
- [x] No-API-key path returns useful cover letters **and** answers (template fallbacks).
- [x] Experience/education editable in UI.
- [x] Load failures are visible (global toaster).
- [x] `node --test` (18) + `vitest` (2) green; client build passes.

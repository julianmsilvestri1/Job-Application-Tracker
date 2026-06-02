# Phase 2 — Real Apply Assistance

**Goal:** turn the apply flow from "open link + copy fields" into guided,
reliable, human-in-the-loop assistance. See conventions in [README.md](./README.md).

**Hard constraint:** never auto-submit on Indeed/LinkedIn/major ATS — assist and
prefill only. The user reviews and clicks submit.

**Units:** 2.1 → 2.2 → 2.3 → 2.4

---

## Unit 2.1 — Link documents ↔ applications
- **Objective:** record which resume/cover letter is used for each application.
- **Depends on:** 1.5.1.
- **Schema (migration):**
  ```sql
  CREATE TABLE application_documents (
    application_id integer not null,
    document_id integer not null,
    role text default 'resume',     -- resume | cover_letter | other
    primary key (application_id, document_id, role),
    foreign key (application_id) references applications(id) on delete cascade,
    foreign key (document_id)    references documents(id)    on delete cascade
  );
  ```
- **Backend:** `routes/applications.js`:
  `POST /:id/documents {document_id, role}`, `DELETE /:id/documents/:docId`,
  and include attached docs in `GET /:id` (join).
- **Frontend:** Applications card: an "Attachments" row — pick from uploaded
  documents (dropdown) to attach as resume / cover letter; show + detach.
- **Tests:** route test (attach, list, detach, cascade on delete).
- **Acceptance:** an attached resume persists and shows on the application.
- **Commit:** `feat(tracker): link documents to applications`

---

## Unit 2.2 — Per-application apply checklist
- **Objective:** track the steps to actually apply (with deadlines).
- **Depends on:** none.
- **Schema (migration):**
  ```sql
  CREATE TABLE application_tasks (
    id integer primary key autoincrement,
    application_id integer not null,
    label text not null,
    done integer default 0,
    due_date text,
    sort_order integer default 0,
    foreign key (application_id) references applications(id) on delete cascade
  );
  ```
- **Backend:** CRUD under `/api/applications/:id/tasks`. On application **create**,
  seed a default checklist: *Tailor resume · Write cover letter · Complete
  application form · Submit · Follow up (1 week)*.
- **Frontend:** checklist UI on each application (toggle done, set due date, add/
  remove); progress shown as `n/m` on the card and Dashboard.
- **Tests:** seeding on create; toggle persists; cascade delete.
- **Acceptance:** new applications start with a checklist; progress is visible.
- **Commit:** `feat(tracker): per-application apply checklist`

---

## Unit 2.3 — Apply checklist intelligence (optional AI)
- **Objective:** tailor the checklist + required attachments per posting.
- **Depends on:** 2.2, 1.5.2.
- **Backend:** `orchestrator.applyPlan({ job })` → suggested steps + likely
  required attachments (resume, cover letter, portfolio, references) inferred
  from the job description; template fallback = the default checklist. Endpoint
  `POST /api/applications/:id/apply-plan` merges suggestions into tasks.
- **Frontend:** "Suggest steps" button on the checklist.
- **Tests:** fallback returns default steps with no key; AI path parsed defensively.
- **Acceptance:** suggested steps reflect the specific posting when AI is on.
- **Commit:** `feat(tracker): AI-suggested apply steps`

---

## Unit 2.4 — Production browser extension
- **Objective:** real in-page autofill (replaces the scaffold). Review-only; no
  auto-submit.
- **Depends on:** 1.5 (autofill endpoint already exists).
- **Packages (extension build):** `esbuild` (bundle content script — removes the
  ESM `export` problem).
- **Structure:** convert `extension-safari/` into a buildable extension:
  - `src/content.js` (IIFE/bundled, no top-level `export`), `src/popup.{html,js}`,
    `src/options.{html,js}` (set portal URL → `chrome.storage`).
  - `src/fieldMaps/` — per-ATS selector maps keyed by hostname:
    `greenhouse.io`, `lever.co`, `myworkdayjobs.com`, `ashbyhq.com`, plus a
    generic label/name/autocomplete heuristic fallback (today's logic).
  - `build.js` (esbuild) → `dist/`; `npm run build` in the extension workspace.
  - Manifest: configurable `host_permissions`; `default_popup`; options page.
  - **Safari:** document + script the
    `xcrun safari-web-extension-converter ./dist` step and commit the generated
    Xcode project under `extension-safari/safari-app/`.
- **Behaviour:** popup → "Autofill" → content script fetches
  `GET <portalUrl>/api/assistant/autofill`, applies the matching field map, fills
  empty fields, reports count. Never submits.
- **Bi-directional bridge (sets up Phase 6.3):** the content script also
  **scrapes the live form** (job title/company/description + normalized
  `{label, selector, type, required}`) and POSTs it to
  `POST /api/extension/context`, which resolves answers (RAG-narrowed, Phase 3.5)
  and returns a field→answer map; plus `POST /api/extension/save-job` to push a
  listing into the tracker on visit. **Lock Express CORS to the extension's
  origin ID** so no other local process can reach these routes.
- **Cross-browser:** one shared MV3 content-script core wrapped in thin **Safari
  and Chrome/Arc** manifests (`esbuild` builds both; Safari via
  `safari-web-extension-converter`).
- **Tests:** unit-test field-map matching with jsdom fixtures of each ATS form
  (sample HTML snippets under `extension-safari/test/`); `/extension/context`
  rejects disallowed origins.
- **Acceptance:** loads unpacked in Chrome/Arc and as a Safari Web Extension;
  fills a sample Greenhouse/Lever form correctly; portal URL configurable;
  cross-origin requests to `/extension/*` are refused.
- **Commit:** `feat(extension): production autofill with per-ATS field maps`

---

## Phase exit criteria
- [ ] Documents attach to applications and persist.
- [ ] Every application has a working, deadline-aware checklist.
- [ ] Extension builds, loads in Chrome + Safari, fills real ATS forms, never
      auto-submits, and uses a configurable portal URL.
- [ ] Field-map matching is unit-tested.

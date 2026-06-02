# Phase 2 — Real Apply Assistance

**Status:** planned.

**Goal:** turn the apply flow from "open link + copy fields" into a complete,
reliable, human-in-the-loop application workspace. Phase 2 should make each
application feel like a guided package: selected documents, tasks, required
answers, field-fill support, extension assist, and a durable activity trail.

**Hard constraint:** never auto-submit on Indeed, LinkedIn, or major ATS sites.
The portal may prepare, prefill, copy, validate, and track work, but the user
reviews and clicks submit.

**Primary outcomes:**
- Every application has attached documents, tasks, due dates, and apply state.
- The portal can infer what a specific job application will require before the
  user opens the external site.
- The browser extension fills known ATS forms safely and records what happened.
- The user gets a repeatable "application packet" for every job.

**Units:** 2.0 → 2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 2.6 → 2.7 → 2.8

---

## Unit 2.0 — Apply workspace foundation
- **Objective:** introduce a single "apply workspace" concept so later units do
  not bolt unrelated controls onto the application card.
- **Depends on:** Phase 1.5, Phase 3 recommended/search save flow.
- **Packages:** none.
- **Schema:** none in this unit.
- **Backend:**
  - Add `GET /api/applications/:id` if it does not already exist, returning one
    application plus nested arrays for:
    - `documents` (added in 2.1)
    - `tasks` (added in 2.2)
    - `answers` (already available from Phase 1.5)
    - `events` (added in 2.7)
  - Keep this route tolerant: nested arrays return empty until their migrations
    exist.
  - Add a helper in `routes/applications.js`:
    `serializeApplication(row, { includeDetails = false })`.
- **Frontend:**
  - Split `Applications.jsx` into:
    - `ApplicationsList`
    - `ApplicationCard`
    - `ApplicationWorkspace`
    - `ApplicationDetailsPanel`
  - Opening a card shows the workspace inline or in a side panel.
  - Workspace sections are stable even before later units ship:
    `Overview`, `Documents`, `Checklist`, `Assistant`, `Activity`.
- **AI / prompt:** none.
- **Tests:**
  - Route smoke test: `GET /api/applications/:id` returns a normalized
    application with empty nested arrays.
  - Component smoke test: clicking an application opens the workspace.
- **Acceptance:**
  - A saved application can be opened into a detail workspace.
  - Existing list behavior remains unchanged.
- **Commit:** `refactor(applications): introduce apply workspace`

---

## Unit 2.1 — Link documents ↔ applications
- **Objective:** record exactly which resume, cover letter, portfolio, reference
  sheet, or generated variant belongs to each application.
- **Depends on:** 1.5.1 document extraction, 2.0 workspace.
- **Packages:** none.
- **Schema (migration):**
  ```sql
  CREATE TABLE application_documents (
    application_id integer not null,
    document_id integer not null,
    role text default 'resume',          -- resume | cover_letter | portfolio | references | transcript | other
    label text default '',
    attached_at text default (datetime('now')),
    primary key (application_id, document_id, role),
    foreign key (application_id) references applications(id) on delete cascade,
    foreign key (document_id) references documents(id) on delete cascade
  );
  CREATE INDEX idx_app_docs_document ON application_documents(document_id);
  ```
- **Backend:**
  - `GET /api/applications/:id` includes `documents`.
  - `POST /api/applications/:id/documents`
    body: `{ document_id, role, label? }`.
  - `PATCH /api/applications/:id/documents/:documentId`
    body: `{ role?, label? }`.
  - `DELETE /api/applications/:id/documents/:documentId?role=resume`.
  - Return each attached document with document metadata plus join metadata:
    `{ id, original_name, type, role, label, is_default, extraction_status }`.
  - On delete of an application or document, cascade removes links.
- **Frontend:**
  - Workspace `Documents` section:
    - Role dropdown.
    - Document picker grouped by type.
    - "Attach default resume" quick action.
    - Attached document chips with role, filename, text status, download, detach.
  - Search/Assistant flow can auto-attach a generated cover letter once saved.
- **AI / prompt:** none.
- **Tests:**
  - Attach/list/detach route tests against `:memory:`.
  - Cascade tests for deleting application and document.
  - UI test: selecting a document calls the attach API and renders it.
- **Acceptance:**
  - Attached documents persist and show in the workspace.
  - The application record answers "which resume did I send?".
- **Commit:** `feat(apply): link documents to applications`

---

## Unit 2.2 — Per-application apply checklist
- **Objective:** make every application actionable with tasks, deadlines, and
  completion progress.
- **Depends on:** 2.0.
- **Packages:** none.
- **Schema (migration):**
  ```sql
  CREATE TABLE application_tasks (
    id integer primary key autoincrement,
    application_id integer not null,
    label text not null,
    done integer default 0,
    due_date text,
    category text default 'apply',       -- apply | document | form | follow_up | interview | custom
    source text default 'template',      -- template | ai | manual | extension
    sort_order integer default 0,
    created_at text default (datetime('now')),
    updated_at text default (datetime('now')),
    foreign key (application_id) references applications(id) on delete cascade
  );
  CREATE INDEX idx_app_tasks_due ON application_tasks(due_date);
  CREATE INDEX idx_app_tasks_app ON application_tasks(application_id);
  ```
- **Backend:**
  - On application create, seed default tasks:
    1. Review job requirements.
    2. Select resume.
    3. Tailor resume/cover letter.
    4. Complete application form.
    5. Submit application.
    6. Follow up after one week.
  - CRUD:
    - `GET /api/applications/:id/tasks`
    - `POST /api/applications/:id/tasks`
    - `PATCH /api/applications/:id/tasks/:taskId`
    - `DELETE /api/applications/:id/tasks/:taskId`
    - `POST /api/applications/:id/tasks/reorder`
  - `GET /api/applications` includes `taskProgress: { done, total }`.
  - `GET /api/applications/stats` includes `tasksDueSoon` and `overdueTasks`.
- **Frontend:**
  - Workspace `Checklist` section:
    - Task checkbox.
    - Due date input.
    - Category chip.
    - Add custom task.
    - Remove/reorder tasks.
  - Application cards show `Checklist 3/6` and overdue badge.
  - Dashboard shows `Due soon` list from tasks.
- **AI / prompt:** none yet; 2.3 adds AI suggestions.
- **Tests:**
  - Creating an application seeds tasks.
  - Toggle persists.
  - Due-soon stats calculate correctly.
  - Cascade delete removes tasks.
- **Acceptance:**
  - Every new application starts with a useful checklist.
  - Progress appears on cards and dashboard.
- **Commit:** `feat(apply): add per-application checklist`

---

## Unit 2.3 — AI apply plan and requirement extraction
- **Objective:** infer a job-specific application plan: required documents,
  expected form questions, risk flags, and recommended steps.
- **Depends on:** 1.5.2 orchestrator, 2.1 documents, 2.2 tasks.
- **Packages:** none.
- **Schema (migration):**
  ```sql
  CREATE TABLE apply_plans (
    application_id integer primary key,
    source text default 'template',      -- ai | template
    requirements text default '[]',      -- JSON: [{type,label,required,reason}]
    suggested_tasks text default '[]',   -- JSON: [{label,category,due_in_days}]
    likely_questions text default '[]',  -- JSON: strings
    warnings text default '[]',          -- JSON: strings
    created_at text default (datetime('now')),
    updated_at text default (datetime('now')),
    foreign key (application_id) references applications(id) on delete cascade
  );
  ```
- **Backend:**
  - Add `orchestrator.applyPlan({ application })`.
  - Structured output schema:
    ```js
    {
      requirements: [{ type, label, required, reason }],
      suggestedTasks: [{ label, category, due_in_days }],
      likelyQuestions: string[],
      warnings: string[]
    }
    ```
  - Endpoint:
    - `POST /api/applications/:id/apply-plan { refresh?: boolean, mergeTasks?: boolean }`
    - `GET /api/applications/:id/apply-plan`
  - If `mergeTasks` is true, insert missing AI tasks into `application_tasks`
    with `source='ai'`.
  - Template fallback:
    - Resume required.
    - Cover letter recommended if description mentions "cover letter".
    - Portfolio recommended if title/description mentions design, writing,
      GitHub, portfolio, samples, case studies, or code.
    - Follow-up task due in 7 days after submit.
- **Frontend:**
  - Workspace `Checklist` gets "Suggest apply plan".
  - Apply plan panel shows:
    - Required materials.
    - Likely questions.
    - Warnings, e.g. "salary range missing", "portfolio likely required".
    - "Add suggested tasks" button.
  - Document picker can filter by required role.
- **AI / prompt:**
  - System: "You are a careful application operations assistant. Infer only
    requirements supported by the job text. Do not claim submission is complete."
  - User: candidate context, application record, job description, attached docs.
  - Low temperature; tool-use JSON; fallback on parse error.
- **Tests:**
  - Template fallback identifies cover-letter/portfolio language.
  - AI JSON parse with stubbed fetch.
  - `mergeTasks` inserts non-duplicate tasks.
  - Cache avoids repeated identical AI plan calls.
- **Acceptance:**
  - A job with "include portfolio" creates a portfolio requirement and suggested
    task.
  - Works without an API key.
- **Commit:** `feat(apply): generate AI apply plans`

---

## Unit 2.4 — Application packet API
- **Objective:** provide one canonical API payload that the extension, assistant,
  and UI can use to fill forms and copy answers.
- **Depends on:** 2.1, 2.3.
- **Packages:** none.
- **Schema:** none.
- **Backend:**
  - New endpoint:
    `GET /api/applications/:id/packet`
  - Response:
    ```js
    {
      application,
      candidate: {
        fields: [{ label, value, aliases, sensitivity }],
        profile,
        experiences,
        education,
        skills
      },
      documents: [{ role, filename, downloadUrl, textStatus }],
      answers: [{ question, answer, source }],
      applyPlan,
      extensionPolicy: {
        canAutofill: true,
        canSubmit: false,
        redactedFields: ['ssn', 'date_of_birth']
      }
    }
    ```
  - Keep `/api/assistant/autofill` for generic use, but internally build from
    the packet serializer.
  - Add sensitivity tagging for values:
    - public: name, website.
    - contact: email, phone.
    - sensitive: authorization, salary, custom fields.
- **Frontend:**
  - Workspace `Apply packet` section:
    - Copy grouped fields.
    - Copy answer.
    - Download attached docs.
    - Open external apply URL.
  - Show "Never auto-submits" policy text.
- **AI / prompt:** none.
- **Tests:**
  - Packet includes profile fields and attached documents.
  - Sensitive fields are tagged.
  - Packet never includes raw uploaded document text unless explicitly requested.
- **Acceptance:**
  - One endpoint powers portal copy UI and extension autofill.
- **Commit:** `feat(apply): add application packet API`

---

## Unit 2.5 — Production browser extension shell
- **Objective:** replace the scaffold with a buildable Chrome/Safari extension.
- **Depends on:** 2.4.
- **Packages:**
  - `esbuild` in the extension workspace.
  - Optional later: `webextension-polyfill` if cross-browser API differences grow.
- **Extension structure:**
  ```text
  extension-safari/
    package.json
    build.js
    manifest.json
    src/
      content.js
      popup.html
      popup.js
      options.html
      options.js
      fieldMaps/
        index.js
        generic.js
        greenhouse.js
        lever.js
        ashby.js
        workday.js
        smartrecruiters.js
        icims.js
      shared/
        portalClient.js
        domFields.js
        safety.js
    test/
      fixtures/
      fieldMaps.test.js
    dist/
  ```
- **Browser APIs / technology:**
  - Manifest V3 for Chrome.
  - Safari Web Extension conversion via
    `xcrun safari-web-extension-converter ./dist`.
  - `chrome.storage.sync` for portal URL and selected application id.
  - `chrome.scripting` / content script messages for active-tab autofill.
  - Optional Chrome Side Panel API in a later unit for richer in-page review.
- **Backend:** no new backend, uses packet API.
- **Frontend / extension UX:**
  - Options page:
    - Portal URL.
    - Test connection button.
    - Privacy reminder.
  - Popup:
    - Current hostname.
    - Application search/select by title/company.
    - "Preview fields".
    - "Autofill empty fields".
    - "Copy packet".
    - Last run summary.
- **Safety behavior:**
  - Fill empty fields by default.
  - Never click submit.
  - Never fill fields matching SSN, government ID, bank, race, disability,
    veteran status, gender, or EEO questions unless explicitly enabled later.
  - Dispatch `input` and `change` events after filling.
- **Tests:**
  - Extension build command succeeds.
  - Popup client handles portal unavailable.
  - Content script does not export ESM top-level symbols.
- **Acceptance:**
  - Extension loads unpacked in Chrome.
  - Safari conversion command is documented and reproducible.
- **Commit:** `feat(extension): buildable autofill extension shell`

---

## Unit 2.6 — ATS field maps and fixture lab
- **Objective:** make autofill reliable on common ATS forms, with regression
  fixtures for each selector strategy.
- **Depends on:** 2.5.
- **Packages:** extension test deps may use `jsdom` if not already available.
- **Schema:** none.
- **Supported maps:**
  - Greenhouse (`greenhouse.io`, `boards.greenhouse.io`)
  - Lever (`jobs.lever.co`)
  - Ashby (`jobs.ashbyhq.com`)
  - Workday (`myworkdayjobs.com`)
  - SmartRecruiters (`smartrecruiters.com`)
  - iCIMS (`icims.com`)
  - BambooHR (`bamboohr.com`)
  - Generic fallback by label, placeholder, `name`, `id`, `aria-label`,
    `autocomplete`, nearby text, and fieldset legend.
- **Backend:** none.
- **Extension logic:**
  - `detectAts(hostname, document)` returns map id and confidence.
  - `extractFields(document)` returns normalized form fields:
    `{ element, label, type, required, currentValue, confidence }`.
  - `matchPacketField(field, packet.fields)` returns best candidate and reason.
  - Fill only if confidence exceeds threshold.
  - Report skipped fields with reasons.
- **Innovative idea: local "field map trainer":**
  - Add a developer-only page under extension tests where a fixture can be
    loaded, mapped visually, and exported as JSON.
  - This makes new ATS support additive instead of hand-tuned in content script.
- **Tests:**
  - One HTML fixture per ATS.
  - Assert first name, last name, email, phone, location, LinkedIn, website,
    work authorization, and sponsorship fields match where present.
  - Assert EEO/sensitive fields are skipped.
  - Assert unknown form uses generic fallback.
- **Acceptance:**
  - Known ATS fixtures fill correctly.
  - Sensitive fields are skipped.
  - Test suite prevents selector regressions.
- **Commit:** `feat(extension): add ATS field maps and fixtures`

---

## Unit 2.7 — Apply session logging and work tracking
- **Objective:** track the work done during an application without storing
  sensitive external form values.
- **Depends on:** 2.4, 2.5.
- **Packages:** none.
- **Schema (migration):**
  ```sql
  CREATE TABLE application_events (
    id integer primary key autoincrement,
    application_id integer,
    kind text not null,                 -- created | packet_opened | autofill_run | task_done | submitted | note
    source text default 'portal',       -- portal | extension | ai | import
    summary text default '',
    metadata text default '{}',
    created_at text default (datetime('now')),
    foreign key (application_id) references applications(id) on delete cascade
  );
  CREATE INDEX idx_app_events_app ON application_events(application_id, created_at);
  ```
- **Backend:**
  - `POST /api/applications/:id/events`.
  - `GET /api/applications/:id/events`.
  - Extension posts an `autofill_run` event:
    `{ hostname, filledCount, skippedCount, ats, fieldLabels }`.
  - Portal posts task/document events.
- **Frontend:**
  - Workspace `Activity` timeline:
    - Saved job.
    - Attached document.
    - Generated apply plan.
    - Autofilled external form.
    - Marked submitted.
  - Add "Mark submitted" action that:
    - Updates status to `applied`.
    - Marks "Submit application" task done.
    - Creates event.
- **AI / prompt:** none.
- **Tests:**
  - Event create/list/cascade.
  - "Mark submitted" updates status, task, and event atomically.
- **Acceptance:**
  - The tracker records when autofill ran and when the user marked submit.
- **Commit:** `feat(apply): track application activity events`

---

## Unit 2.8 — Apply safety, privacy, and compliance hardening
- **Objective:** make the apply assistant trustworthy before relying on it.
- **Depends on:** 2.5, 2.6, 2.7.
- **Packages:** none.
- **Schema:** optional `settings` table if not already introduced:
  ```sql
  CREATE TABLE settings (
    key text primary key,
    value text default '',
    updated_at text default (datetime('now'))
  );
  ```
- **Backend:**
  - Add safety policy endpoint:
    `GET /api/assistant/apply-policy`.
  - Policy includes:
    - no auto-submit.
    - sensitive field denylist.
    - extension version.
    - allowed host permissions.
  - Add audit events for policy version used by extension.
- **Extension:**
  - Show a prefill review screen before writing fields.
  - Require explicit click for sensitive categories if future support is added.
  - Add "undo last autofill" while page stays open by remembering previous
    values in memory only.
- **Frontend:**
  - Settings panel for:
    - Allow filling existing values? default false.
    - Allow custom answer fields? default true.
    - Extension host permissions instructions.
- **Tests:**
  - Sensitive labels are denied by safety tests.
  - Undo restores previous values in fixture.
  - Policy endpoint returns `canSubmit:false`.
- **Acceptance:**
  - A reviewer can verify the extension cannot submit or fill blocked sensitive
    fields by default.
- **Commit:** `fix(apply): harden extension safety policy`

---

## Phase exit criteria
- [ ] Application workspace exists and remains stable across all apply features.
- [ ] Documents attach to applications and answer "what did I send?".
- [ ] Every application has a deadline-aware checklist and visible progress.
- [ ] AI apply plan identifies job-specific required materials, likely questions,
      warnings, and suggested tasks with a fallback path.
- [ ] Packet API powers portal copy UI and extension autofill.
- [ ] Extension builds, loads in Chrome, can be converted to Safari, and uses a
      configurable portal URL.
- [ ] Greenhouse, Lever, Ashby, Workday, SmartRecruiters, iCIMS, BambooHR, and
      generic field maps are fixture-tested.
- [ ] Extension never auto-submits and skips sensitive fields by default.
- [ ] Apply sessions are logged as activity events without storing external form
      sensitive values.

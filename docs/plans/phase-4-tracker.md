# Phase 4 — Tracker Intelligence & Document Variants

**Status:** planned.

**Goal:** grow the tracker from a basic CRM into an intelligent job-search
operating system: next actions, interview prep, tailored document variants,
contacts, reminders, analytics, offer comparison, and learning from outcomes.

**Strategic principle:** Phase 4 should not just add more fields. It should help
the candidate decide what to do next, prepare better, and learn which job-search
inputs produce better outcomes.

**Depends on:**
- Phase 1.5: documents as AI context and orchestrator contract.
- Phase 2.1: document ↔ application links.
- Phase 2.2: application tasks.
- Phase 2.7: activity events.
- Phase 3: fit scoring, preferences, query planning, and recommendations.

**Units:** 4.0 → 4.1 → 4.2 → 4.3 → 4.4 → 4.5 → 4.6 → 4.7 → 4.8 → 4.9

---

## Unit 4.0 — Tracker event model and timeline baseline
- **Objective:** make the tracker timeline-first so later intelligence has a
  reliable history to reason over.
- **Depends on:** 2.7 if implemented; otherwise this unit introduces the same
  table.
- **Packages:** none.
- **Schema (migration):**
  ```sql
  CREATE TABLE IF NOT EXISTS application_events (
    id integer primary key autoincrement,
    application_id integer,
    kind text not null,                 -- created | status_changed | task_done | note | email | interview | offer | ai
    source text default 'portal',       -- portal | extension | ai | import | calendar | email
    summary text default '',
    metadata text default '{}',
    created_at text default (datetime('now')),
    foreign key (application_id) references applications(id) on delete cascade
  );
  CREATE INDEX IF NOT EXISTS idx_app_events_app_created
    ON application_events(application_id, created_at);
  ```
- **Backend:**
  - If Phase 2 already created `application_events`, append missing columns only.
  - Add helper:
    `logApplicationEvent(db, { application_id, kind, source, summary, metadata })`.
  - Route:
    - `GET /api/applications/:id/events`
    - `POST /api/applications/:id/events`
  - Existing mutations begin logging:
    - create application.
    - status change.
    - notes update.
    - cover letter save.
    - answer save.
    - document attach/detach.
- **Frontend:**
  - Workspace `Activity` tab shows a timeline grouped by day.
  - Event cards have icons and concise summaries.
  - Manual note event: "Add timeline note".
- **AI / prompt:** none.
- **Tests:**
  - Helper writes valid JSON metadata.
  - Status update logs `status_changed`.
  - Events cascade on application delete.
- **Acceptance:**
  - Every major tracker action leaves a visible event.
  - Later AI coaching can read event history.
- **Commit:** `feat(tracker): add application activity timeline`

---

## Unit 4.1 — AI next actions and follow-up coaching
- **Objective:** recommend what to do next for each application based on status,
  age, tasks, notes, job description, score, and activity history.
- **Depends on:** 1.5.2, 2.2, 4.0.
- **Packages:** none.
- **Schema (migration):**
  ```sql
  CREATE TABLE tracker_coaching (
    application_id integer primary key,
    source text default 'template',      -- ai | template
    status_assessment text default '',
    next_actions text default '[]',      -- JSON [{label, category, due_in_days, reason}]
    follow_up text default '{}',         -- JSON {when, draftEmail, subject}
    risks text default '[]',             -- JSON strings
    created_at text default (datetime('now')),
    updated_at text default (datetime('now')),
    foreign key (application_id) references applications(id) on delete cascade
  );
  ```
- **Backend:**
  - Add `orchestrator.coachApplication({ application })`.
  - Structured output:
    ```js
    {
      statusAssessment: string,
      nextActions: [{ label, category, due_in_days, reason }],
      followUp: { when, subject, draftEmail },
      risks: string[]
    }
    ```
  - Endpoint:
    - `POST /api/applications/:id/coach { refresh?: boolean, addTasks?: boolean }`
    - `GET /api/applications/:id/coach`
  - Fallback rules:
    - `saved`: suggest applying within 48 hours if fit score >= 70.
    - `applied` older than 7 days: draft follow-up.
    - `interviewing`: suggest prep packet and contact update.
    - `offer`: suggest offer comparison.
    - `rejected`: suggest capture learning and archive.
  - If `addTasks` true, insert non-duplicate `application_tasks`.
- **Frontend:**
  - "Coach me" button in workspace.
  - Coaching card:
    - status assessment.
    - next actions with "Add to checklist".
    - follow-up email draft with copy button.
    - risks/warnings.
  - Dashboard "Needs attention" widget uses stale applications and overdue tasks.
- **AI / prompt:**
  - System: "You are a pragmatic job-search operations coach. Recommend actions
    the candidate can do; do not invent conversations or outcomes."
  - User: candidate context, application, tasks, events, documents, fit score.
  - Tool-use JSON; low temperature; fallback on failure.
- **Tests:**
  - Fallback by status and date.
  - Stubbed AI parses structured output.
  - `addTasks` inserts unique actions.
  - Follow-up draft mentions company/role and stays concise.
- **Acceptance:**
  - An applied job older than seven days gets a useful follow-up draft and task.
- **Commit:** `feat(tracker): AI next actions and follow-up coaching`

---

## Unit 4.2 — Interview prep workspace
- **Objective:** turn an interviewing application into a prep packet with likely
  questions, STAR stories, role-specific talking points, and questions to ask.
- **Depends on:** 1.5.2, 4.0, 4.1.
- **Packages:** none.
- **Schema (migration):**
  ```sql
  CREATE TABLE interview_prep (
    id integer primary key autoincrement,
    application_id integer not null,
    source text default 'template',      -- ai | template | manual
    stage text default '',               -- recruiter | hiring_manager | technical | onsite | final
    likely_questions text default '[]',
    talking_points text default '[]',
    star_stories text default '[]',
    questions_to_ask text default '[]',
    prep_notes text default '',
    created_at text default (datetime('now')),
    updated_at text default (datetime('now')),
    foreign key (application_id) references applications(id) on delete cascade
  );
  ```
- **Backend:**
  - `orchestrator.interviewPrep({ application, stage })`.
  - Endpoint:
    - `POST /api/applications/:id/interview-prep { stage, refresh? }`
    - `GET /api/applications/:id/interview-prep`
    - `PATCH /api/applications/:id/interview-prep/:prepId`
  - Fallback:
    - role/skills-based questions.
    - profile-derived talking points.
    - generic questions to ask.
- **Frontend:**
  - Workspace tab `Interview Prep`, visible always but highlighted when status is
    `interviewing`.
  - Stage selector.
  - "Generate prep".
  - Editable sections:
    - likely questions.
    - my talking points.
    - STAR stories.
    - questions to ask.
    - notes.
  - "Copy prep packet" button.
- **Innovative idea: STAR story bank:**
  - Add saved reusable stories later:
    `stories(id, title, situation, task, action, result, skills_json)`.
  - Interview prep can recommend stories matching job requirements.
- **AI / prompt:**
  - Ask for grounded prep using only candidate context, job description, attached
    documents, and previous answers.
  - Do not fabricate accomplishments; phrase missing specifics as prompts for
    the user to fill in.
- **Tests:**
  - Template prep non-empty.
  - AI JSON parse.
  - Prep persists and can be edited.
- **Acceptance:**
  - Interviewing applications get a saved, editable prep packet.
- **Commit:** `feat(tracker): add interview prep workspace`

---

## Unit 4.3 — Contacts and relationship CRM
- **Objective:** track people connected to each opportunity and make follow-up
  context available.
- **Depends on:** 4.0.
- **Packages:** none.
- **Schema (migration):**
  ```sql
  CREATE TABLE contacts (
    id integer primary key autoincrement,
    application_id integer,
    name text default '',
    role text default '',
    company text default '',
    email text default '',
    phone text default '',
    linkedin text default '',
    relationship text default '',        -- recruiter | hiring_manager | referral | interviewer | other
    notes text default '',
    last_contacted_at text,
    created_at text default (datetime('now')),
    updated_at text default (datetime('now')),
    foreign key (application_id) references applications(id) on delete cascade
  );
  CREATE INDEX idx_contacts_application ON contacts(application_id);
  ```
- **Backend:**
  - CRUD:
    - `GET /api/applications/:id/contacts`
    - `POST /api/applications/:id/contacts`
    - `PATCH /api/applications/:id/contacts/:contactId`
    - `DELETE /api/applications/:id/contacts/:contactId`
  - `POST /api/applications/:id/contacts/:contactId/contacted`
    stamps `last_contacted_at` and logs an event.
- **Frontend:**
  - Workspace `Contacts` tab:
    - contact list.
    - quick add.
    - "Mark contacted".
    - copy email.
  - Dashboard "People to follow up with" widget.
- **Innovative API ideas:**
  - Optional email deep links:
    - `mailto:` for zero-config.
    - Gmail compose URL for browser users.
  - Future optional integrations:
    - Gmail API or Microsoft Graph to detect replies and update
      `last_contacted_at` after explicit OAuth.
    - LinkedIn URL stored only as user-provided metadata; no scraping.
- **AI / prompt:** none required; coaching consumes contacts in Unit 4.1.
- **Tests:**
  - Contacts CRUD.
  - Mark contacted logs event.
  - Cascade on application delete.
- **Acceptance:**
  - Contacts persist per application and appear in follow-up context.
- **Commit:** `feat(tracker): add contacts CRM`

---

## Unit 4.4 — Reminders, upcoming work, and calendar export
- **Objective:** make due dates actionable inside and outside the portal.
- **Depends on:** 2.2 tasks, 4.0.
- **Packages:** none for baseline `.ics`; optional later packages for provider
  APIs if selected.
- **Schema (migration):**
  ```sql
  CREATE TABLE reminders (
    id integer primary key autoincrement,
    application_id integer,
    task_id integer,
    title text not null,
    due_at text not null,
    channel text default 'in_app',       -- in_app | calendar | email | sms
    sent_at text,
    dismissed_at text,
    created_at text default (datetime('now')),
    foreign key (application_id) references applications(id) on delete cascade,
    foreign key (task_id) references application_tasks(id) on delete cascade
  );
  CREATE INDEX idx_reminders_due ON reminders(due_at, dismissed_at, sent_at);
  ```
- **Backend:**
  - `GET /api/reminders/upcoming?days=14`.
  - `POST /api/applications/:id/reminders`.
  - `PATCH /api/reminders/:id`.
  - `GET /api/calendar.ics`:
    - VEVENTs for due tasks, reminders, interviews, offer deadlines.
    - Stable UID based on local row id.
  - Optional adapter interface:
    ```js
    sendReminder({ channel, to, title, body, dueAt })
    ```
- **Frontend:**
  - Dashboard `Upcoming` widget.
  - Reminder chips in application workspace.
  - "Subscribe calendar" link to `.ics`.
  - "Dismiss" and "Snooze" actions.
- **Innovative integrations (optional, behind settings):**
  - Google Calendar API: create calendar events after OAuth.
  - Microsoft Graph Calendar API: same for Outlook users.
  - SendGrid or SMTP: email reminders.
  - Twilio Programmable Messaging: SMS reminders for urgent deadlines.
  - Web Push API: browser notifications for local-first installs.
- **AI / prompt:** none; AI coaching can create reminder suggestions.
- **Tests:**
  - `.ics` includes valid VEVENT for a seeded due task.
  - Upcoming endpoint filters by date window.
  - Snooze changes due date.
- **Acceptance:**
  - User can see upcoming tasks and import them into a calendar app.
- **Commit:** `feat(tracker): reminders and calendar export`

---

## Unit 4.5 — Per-job document variants
- **Objective:** create tailored resume and cover-letter variants tied to a
  specific application, with the original document preserved.
- **Depends on:** 1.5.1, 2.1, 4.0.
- **Packages:**
  - Baseline: none; store Markdown/TXT variants.
  - Optional: `docx` for DOCX export, or HTML-to-PDF via a headless renderer if
    the project accepts the added weight.
- **Schema (migration):**
  ```sql
  ALTER TABLE documents ADD COLUMN derived_from integer;
  ALTER TABLE documents ADD COLUMN application_id integer;
  ALTER TABLE documents ADD COLUMN variant_notes text default '';
  ALTER TABLE documents ADD COLUMN version integer default 1;

  CREATE TABLE document_variants (
    id integer primary key autoincrement,
    document_id integer not null,
    application_id integer not null,
    base_document_id integer,
    variant_type text default 'resume',  -- resume | cover_letter | portfolio | other
    change_summary text default '',
    keyword_coverage text default '{}',
    created_at text default (datetime('now')),
    foreign key (document_id) references documents(id) on delete cascade,
    foreign key (application_id) references applications(id) on delete cascade,
    foreign key (base_document_id) references documents(id) on delete set null
  );
  ```
- **Backend:**
  - `orchestrator.tailorResume({ application, baseDocumentId })`.
  - `orchestrator.tailorCoverLetter({ application, baseDocumentId? })`
    may reuse existing cover-letter generation but save as a document.
  - Endpoints:
    - `POST /api/applications/:id/document-variants`
      body: `{ baseDocumentId, variantType, refresh? }`
    - `GET /api/applications/:id/document-variants`
    - `PATCH /api/documents/:id/variant`
    - `POST /api/documents/:id/export`
  - Variant text is saved as a `documents` row with `stored_name` generated as a
    local `.md` or `.txt` file.
  - Auto-link the variant through `application_documents`.
- **Frontend:**
  - Workspace `Documents` section:
    - "Tailor resume for this job".
    - Preview/edit generated variant.
    - Save variant.
    - Attach automatically.
  - Document vault groups variants under base document and application.
  - Show keyword coverage from the job description.
- **AI / prompt:**
  - Rewrite only within candidate facts.
  - Preserve truthfulness.
  - Emphasize requirements from job description.
  - Return:
    `{ markdown, changeSummary, keywordCoverage: { matched[], missing[] } }`.
- **Tests:**
  - No-key fallback creates a variant with base text and note.
  - Stubbed AI variant is saved as a document and attached.
  - Keyword coverage renders matched/missing terms.
- **Acceptance:**
  - "Resume for <Company>" exists as a saved, editable, attached variant.
- **Commit:** `feat(documents): add per-job document variants`

---

## Unit 4.6 — Application search, filters, and analytics
- **Objective:** reveal job-search performance, not just status counts.
- **Depends on:** 4.0 events; Phase 3 scores improve analytics but are not
  required.
- **Packages:**
  - Baseline: hand-rolled SVG charts.
  - Optional: `recharts` if chart complexity grows.
- **Schema:** none required if fields/events already exist.
- **Backend:**
  - Enhance list endpoint:
    `GET /api/applications?q=&status=&source=&remote=&company=&minFit=&from=&to=`.
  - Add:
    `GET /api/applications/analytics`.
  - Response:
    ```js
    {
      funnel: { saved, applied, interviewing, offer, rejected },
      conversionRates: { savedToApplied, appliedToInterview, interviewToOffer },
      weeklyVolume: [{ week, saved, applied }],
      sourcePerformance: [{ source, count, interviewRate, offerRate }],
      averageDaysToApply,
      averageDaysToResponse,
      staleApplications,
      topKeywordsByOutcome
    }
    ```
  - `GET /api/applications/export.csv`.
  - `GET /api/applications/export.json`.
- **Frontend:**
  - Applications page:
    - full-text search.
    - filters by status/source/remote/fit/date.
    - saved filter presets.
  - Dashboard analytics:
    - funnel chart.
    - weekly application volume.
    - source performance.
    - stale applications.
  - Export buttons.
- **Innovative idea: outcome intelligence:**
  - Correlate fit score, source, keywords, document variant usage, and response
    outcomes.
  - Suggest "double down on X" or "reduce Y" in Unit 4.9.
- **Tests:**
  - Analytics math on seeded data.
  - Search filters combine correctly.
  - CSV contains expected headers and escaped values.
- **Acceptance:**
  - User can answer: "Which sources and role types are producing interviews?"
- **Commit:** `feat(tracker): search filters analytics and export`

---

## Unit 4.7 — Offer comparison and negotiation workspace
- **Objective:** make offer-stage applications comparable and actionable.
- **Depends on:** 4.0.
- **Packages:** none.
- **Schema (migration):**
  ```sql
  CREATE TABLE offers (
    id integer primary key autoincrement,
    application_id integer not null,
    base_salary text default '',
    bonus text default '',
    equity text default '',
    benefits text default '',
    location_policy text default '',
    start_date text,
    deadline text,
    notes text default '',
    score integer default 0,
    created_at text default (datetime('now')),
    updated_at text default (datetime('now')),
    foreign key (application_id) references applications(id) on delete cascade
  );
  ```
- **Backend:**
  - CRUD under `/api/applications/:id/offers`.
  - `orchestrator.offerCoach({ application, offer })`.
  - Structured output:
    `{ strengths[], concerns[], negotiationPoints[], emailDraft }`.
  - Fallback: template negotiation checklist.
- **Frontend:**
  - Offer workspace appears when status is `offer`.
  - Comparison table across offers.
  - Scorecard:
    - compensation.
    - growth.
    - mission.
    - location.
    - risk.
  - Negotiation email draft.
- **AI / prompt:**
  - Avoid legal/financial guarantees.
  - Help frame negotiation professionally.
  - Ask user to verify numbers.
- **Tests:**
  - Offer CRUD.
  - Fallback coach non-empty.
  - Comparison handles missing compensation values.
- **Acceptance:**
  - Two offers can be compared side-by-side and copied into a negotiation plan.
- **Commit:** `feat(tracker): add offer comparison workspace`

---

## Unit 4.8 — Email/reply import and status suggestions (optional advanced)
- **Objective:** reduce manual tracker upkeep by importing user-approved email
  signals and suggesting status updates.
- **Depends on:** 4.0, 5.1 if OAuth/auth exists; can also be local-only manual
  paste/import.
- **Packages:** none for manual paste; provider SDKs optional later.
- **Schema (migration):**
  ```sql
  CREATE TABLE message_imports (
    id integer primary key autoincrement,
    application_id integer,
    provider text default 'manual',      -- manual | gmail | graph
    external_id text,
    subject text default '',
    from_email text default '',
    snippet text default '',
    received_at text,
    suggested_status text default '',
    confidence integer default 0,
    created_at text default (datetime('now')),
    foreign key (application_id) references applications(id) on delete set null
  );
  CREATE UNIQUE INDEX idx_message_import_provider_ext
    ON message_imports(provider, external_id)
    WHERE external_id IS NOT NULL;
  ```
- **Backend:**
  - Baseline:
    - `POST /api/applications/:id/messages/analyze`
      body: `{ subject, from, bodySnippet }`.
  - Optional provider adapters:
    - Gmail API after explicit OAuth.
    - Microsoft Graph Mail API after explicit OAuth.
  - `orchestrator.classifyReply({ application, message })` returns:
    `{ suggestedStatus, confidence, rationale, suggestedTasks[] }`.
- **Frontend:**
  - "Analyze email reply" paste box.
  - Suggestion card:
    - "Looks like interview request".
    - "Update status to interviewing".
    - "Add prep task".
  - Nothing updates automatically without user confirmation.
- **Privacy:** store snippets, not full email bodies, unless user opts in.
- **Tests:**
  - Manual message classification fallback.
  - Deduping by provider/external id.
  - Confirming suggestion updates status and logs event.
- **Acceptance:**
  - Pasted interview email can suggest `interviewing` and prep tasks.
- **Commit:** `feat(tracker): classify replies into status suggestions`

---

## Unit 4.9 — Outcome learning loop
- **Objective:** learn from the user's own outcomes to improve future discovery,
  apply plans, and positioning.
- **Depends on:** Phase 3, 4.0, 4.6.
- **Packages:** none initially.
- **Schema (migration):**
  ```sql
  CREATE TABLE outcome_insights (
    id integer primary key autoincrement,
    insight_type text not null,          -- source | keyword | title | document | timing
    title text not null,
    body text default '',
    evidence text default '{}',
    dismissed_at text,
    created_at text default (datetime('now'))
  );
  ```
- **Backend:**
  - `GET /api/insights/outcomes`.
  - `POST /api/insights/outcomes/recompute`.
  - Rule-based baseline:
    - sources with above-average interview rate.
    - keywords common in interviewed/offered jobs.
    - average days between save and apply for successful outcomes.
    - document variants correlated with interviews.
  - Optional `orchestrator.outcomeInsights({ analytics })` summarizes insights
    into plain-English recommendations.
- **Frontend:**
  - Dashboard `What is working` panel:
    - "Remotive roles mentioning React are producing interviews."
    - "Applications sent within 2 days get better response rate."
    - "Resume variants are attached to 80% of interviewing jobs."
  - Action buttons:
    - update preferences.
    - improve search.
    - create task.
- **AI / prompt:** summarize only computed evidence; never overclaim causality.
- **Tests:**
  - Seeded outcomes produce deterministic rule insights.
  - Dismissed insights do not reappear unless recomputed with new evidence.
- **Acceptance:**
  - The app can recommend concrete strategy changes from tracker history.
- **Commit:** `feat(tracker): add outcome learning insights`

---

## Phase exit criteria
- [ ] Application events provide a complete timeline of tracker activity.
- [ ] Applications get AI/rule next actions, follow-up drafts, and task insertion.
- [ ] Interviewing applications get saved prep packets.
- [ ] Contacts persist and feed coaching context.
- [ ] Reminders and `.ics` calendar export work.
- [ ] Per-job document variants can be generated, edited, saved, and attached.
- [ ] Analytics show funnel, weekly volume, source performance, stale apps, and
      searchable/exportable tracker data.
- [ ] Offer comparison and negotiation coaching work.
- [ ] Optional email/reply analysis suggests status updates without automatic
      mutation.
- [ ] Outcome insights help improve future discovery and applying strategy.

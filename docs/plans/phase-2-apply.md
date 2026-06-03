# Phase 2 — Real Apply Assistance (bulletproof plan)

**Status:** ⬜ planned · **next after** Phase 3 / 3.5 discovery track  
**Goal:** turn applying from “open a tab and copy-paste” into a **guided, trustworthy application workspace** plus a **production browser extension** that fills real ATS forms — with you always reviewing and clicking Submit.

**Hard constraint (non-negotiable):** never auto-submit on Indeed, LinkedIn, or major ATS sites. The portal and extension may **prepare, prefill, copy, validate, and track**; the human submits.

**North star for this phase:** every saved job becomes an **application packet** — the right documents, a deadline-aware checklist, a job-specific plan, one API the extension trusts, and a field-fill engine that works on Greenhouse/Lever/Ashby/Workday-class forms without guessing SSN or EEO answers.

**Relationship to Phase 6:** Phase 2 is the **execution substrate** for autonomous apply. Phase 6.3 (autopilot) extends Phase 2.4–2.6 field maps and `/api/extension/*` routes — do not duplicate Phase 6 here; **design hooks only**.

See [shared conventions](./README.md) (work-unit template, migrations, orchestrator contract, testing/CI).

---

## 1. What you have today (baseline)

| Capability | Status | Gap Phase 2 closes |
|------------|--------|---------------------|
| Profile + resume extraction (1.5) | ✅ | Extension still uses flat `/api/assistant/autofill`, not per-job packet |
| In-app copy autofill panel | ✅ | No in-page fill on external sites |
| Application tracker (list, status, notes, cover letter) | ✅ | No checklist, no doc↔app link, no apply workspace |
| AI cover letters & Q&A | ✅ | Not tied to “what this job needs” |
| `extension-safari/` scaffold | 🟡 | ESM `export` in content script, hardcoded `localhost:4000`, heuristic-only maps, no Xcode project |
| Discovery (fit, recommended, positioning) | ✅ | Helps pick jobs; does not guide apply execution |

---

## 2. Prerequisites

| Prerequisite | Why |
|--------------|-----|
| **Phase 1.5** complete | Migrations, orchestrator, document extraction, persisted answers |
| **Phase 3** complete | Save-from-search flow, job description on applications, preferences |
| **Cross-cutting CI** | Extension field-map tests and route tests must run in CI |
| **Phase 3.5** (recommended before **2.6+**) | RAG-narrowed context for screening questions in extension bridge; can ship 2.0–2.5 in parallel with 3.5.2+ |

**Parallel track (allowed):** portal units **2.0 → 2.4** do not require the extension. Extension units **2.5 → 2.8** can start once **2.4** (packet API) exists.

---

## 3. Known bottlenecks and how this plan addresses them

| Bottleneck | Why it hurts | Mitigation in this plan |
|------------|--------------|-------------------------|
| **ATS diversity** | Every board uses different DOM, shadow DOM, multi-step wizards | Per-host **field maps** + HTML **fixtures** (2.6); generic fallback last; map trainer for additive support |
| **Wrong-field fills** | Bad match → embarrassing data in wrong box | **Confidence threshold**; fill **empty only** by default; preview before fill (2.8); skipped-field report |
| **React/SPA re-renders** | Values disappear after fill | Dispatch `input`/`change`; optional re-apply pass (document in 2.6); defer “wait for stable DOM” to 2.6 acceptance tests |
| **Sensitive / EEO questions** | Legal and trust risk | Denylist (SSN, EEO, bank, etc.); never fill unless explicit future opt-in (2.8) |
| **Indeed / LinkedIn ToS** | No reliable autofill API; automation banned | **Assist-only** on aggregators; real maps target **employer ATS** pages; denylist in policy endpoint |
| **Extension packaging** | Safari needs Xcode; MV3 ESM breaks content scripts | **esbuild** IIFE bundle (2.5); documented `safari-web-extension-converter` step |
| **Portal URL / CORS** | Hardcoded localhost; any local process could call extension APIs | Options page + `chrome.storage` (2.5); **origin-locked CORS** on `/api/extension/*` (2.7) |
| **“What did I send?”** | User loses track of resume version | **application_documents** (2.1) + packet API (2.4) |
| **Overwhelming apply steps** | User forgets cover letter, portfolio, follow-up | Default checklist (2.2) + AI apply plan (2.3) with template fallback |
| **Phase 6 scope creep** | Building autopilot too early | 2.7 logs events and stubs `/extension/context` shape; full resolver stays in Phase 6.1 |

---

## 4. Architecture (end state of Phase 2)

```
┌─────────────────────────────────────────────────────────────────┐
│  Applications UI — Apply Workspace (2.0)                         │
│  Overview | Documents | Checklist | Apply plan | Packet | Activity│
└───────────────┬───────────────────────────────┬─────────────────┘
                │                               │
        ┌───────▼────────┐              ┌───────▼────────┐
        │  Portal APIs    │              │ Browser extension│
        │  /applications/*│              │ (Chrome + Safari)│
        │  /packet        │◄─────────────│ popup + content  │
        │  /extension/*   │   packet     │ fieldMaps/*      │
        └───────┬────────┘              └──────────────────┘
                │
        ┌───────▼──────────────────────────────────┐
        │ orchestrator.applyPlan (2.3)              │
        │ existing: coverLetter, answerQuestion     │
        │ Phase 3.5: retrieval for question match   │
        └──────────────────────────────────────────┘
```

---

## 5. Work units (strict order)

**Units:** `2.0 → 2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 2.6 → 2.7 → 2.8`  
One unit ≈ one PR. Do not skip **2.0** — it prevents UI/API sprawl.

---

### Unit 2.0 — Apply workspace foundation

> **Objective:** one stable “apply workspace” per application so later features do not bolt onto cards ad hoc.

- **Depends on:** Phase 1.5, Phase 3 save-from-search.
- **Packages:** none.
- **Schema:** none.
- **Backend:**
  - `GET /api/applications/:id` — single application with nested arrays (tolerant empties until migrations land):
    - `documents` (2.1), `tasks` (2.2), `answers` (exists), `events` (2.7), `applyPlan` (2.3).
  - `serializeApplication(row)` helper in `routes/applications.js`.
- **Frontend:** split `Applications.jsx` into `ApplicationsList`, `ApplicationCard`, `ApplicationWorkspace`, `ApplicationDetailsPanel`. Sections (always visible): **Overview**, **Documents**, **Checklist**, **Apply plan**, **Packet**, **Assistant**, **Activity**.
- **Tests:** `GET /:id` returns normalized shape with empty nested arrays; smoke test — open workspace.
- **Acceptance:** click application → workspace; list view unchanged.
- **Commit:** `refactor(applications): introduce apply workspace`

---

### Unit 2.1 — Link documents ↔ applications

> **Objective:** record exactly which resume, cover letter, portfolio, etc. belong to each application.

- **Depends on:** 1.5.1, 2.0.
- **Schema (migration):**
  ```sql
  CREATE TABLE application_documents (
    application_id integer not null,
    document_id integer not null,
    role text default 'resume',     -- resume | cover_letter | portfolio | references | transcript | other
    label text default '',
    attached_at text default (datetime('now')),
    primary key (application_id, document_id, role),
    foreign key (application_id) references applications(id) on delete cascade,
    foreign key (document_id) references documents(id) on delete cascade
  );
  CREATE INDEX idx_app_docs_document ON application_documents(document_id);
  ```
- **Backend:** `POST/PATCH/DELETE /api/applications/:id/documents[...]`; include in `GET /:id`.
- **Frontend:** Documents section — role dropdown, picker, “Attach default resume”, chips with extraction status + download + detach.
- **Tests:** attach/list/detach; cascade on app/document delete.
- **Acceptance:** “Which resume did I send?” is answerable from the workspace.
- **Commit:** `feat(apply): link documents to applications`

---

### Unit 2.2 — Per-application apply checklist

> **Objective:** every application is actionable with tasks, deadlines, and visible progress.

- **Depends on:** 2.0.
- **Schema (migration):**
  ```sql
  CREATE TABLE application_tasks (
    id integer primary key autoincrement,
    application_id integer not null,
    label text not null,
    done integer default 0,
    due_date text,
    category text default 'apply',    -- apply | document | form | follow_up | interview | custom
    source text default 'template',   -- template | ai | manual | extension
    sort_order integer default 0,
    created_at text default (datetime('now')),
    updated_at text default (datetime('now')),
    foreign key (application_id) references applications(id) on delete cascade
  );
  ```
- **Backend:** CRUD `/api/applications/:id/tasks`; **seed on create** — Review requirements · Select resume · Tailor materials · Complete form · Submit · Follow up (1 week). List endpoint adds `taskProgress: { done, total }`; stats add `tasksDueSoon` / `overdueTasks`.
- **Frontend:** Checklist UI; cards show `3/6`; Dashboard “Due soon”.
- **Tests:** seed on create; toggle; due-soon stats; cascade.
- **Acceptance:** new apps get checklist; progress visible everywhere.
- **Commit:** `feat(apply): per-application apply checklist`

---

### Unit 2.3 — AI apply plan & requirement extraction

> **Objective:** infer job-specific requirements (documents, likely questions, warnings) and merge suggested tasks.

- **Depends on:** 1.5.2, 2.1, 2.2.
- **Schema (migration):**
  ```sql
  CREATE TABLE apply_plans (
    application_id integer primary key,
    source text default 'template',
    requirements text default '[]',
    suggested_tasks text default '[]',
    likely_questions text default '[]',
    warnings text default '[]',
    created_at text default (datetime('now')),
    updated_at text default (datetime('now')),
    foreign key (application_id) references applications(id) on delete cascade
  );
  ```
- **Backend:** `orchestrator.applyPlan({ application })` — tool-use JSON; **template fallback** (cover letter if JD mentions it, portfolio if design/dev keywords, follow-up in 7 days). `POST/GET /api/applications/:id/apply-plan`; optional `mergeTasks` inserts AI tasks with `source='ai'`.
- **Frontend:** “Suggest apply plan” in Checklist; panel for requirements / likely questions / warnings; “Add suggested tasks”.
- **Prompt:** “Infer only what the job text supports. Never claim submission is complete.”
- **Tests:** template detects portfolio/cover-letter language; AI parse stubbed; mergeTasks dedupes; works without API key.
- **Acceptance:** JD with “include portfolio” → portfolio requirement + task.
- **Commit:** `feat(apply): AI apply plan and requirement extraction`

---

### Unit 2.4 — Application packet API

> **Objective:** one canonical payload for portal copy UI **and** the extension.

- **Depends on:** 2.1, 2.3.
- **Backend:** `GET /api/applications/:id/packet`:
  ```js
  {
    application,
    candidate: { fields: [{ label, value, aliases, sensitivity }], profile, experiences, education, skills },
    documents: [{ role, filename, downloadUrl, extractionStatus }],
    answers: [{ question, answer, source }],
    applyPlan,
    extensionPolicy: { canAutofill: true, canSubmit: false, redactedFields: [...] }
  }
  ```
  - Refactor `/api/assistant/autofill` to use packet serializer for generic case.
  - Sensitivity tags: `public` | `contact` | `sensitive`.
- **Frontend:** Packet section — copy grouped fields, copy answers, download attachments, open posting URL, “Never auto-submits” notice.
- **Tests:** packet includes attachments; sensitive tags; no raw resume blob unless requested.
- **Acceptance:** one endpoint powers portal + extension.
- **Commit:** `feat(apply): application packet API`

---

### Unit 2.5 — Production extension shell (buildable MV3)

> **Objective:** replace the scaffold with a bundled, configurable Chrome/Safari extension.

- **Depends on:** 2.4.
- **Packages:** `esbuild` in `extension-safari/` workspace.
- **Structure:**
  ```text
  extension-safari/
    package.json, build.js, manifest.json
    src/content.js, popup.*, options.*
    src/fieldMaps/{index,generic,greenhouse,lever,ashby,workday,...}.js
    src/shared/{portalClient,domFields,safety}.js
    test/fixtures/, dist/
  ```
- **Behaviour:** options (portal URL, test connection); popup (hostname, pick application, preview, autofill empty, copy packet); **never submit**; `input`/`change` after fill.
- **Safari:** document `xcrun safari-web-extension-converter ./dist` → commit `extension-safari/safari-app/` or document reproducible CI step.
- **Tests:** build succeeds; no top-level ESM `export` in content bundle; popup handles portal down.
- **Acceptance:** loads unpacked in Chrome; Safari conversion documented.
- **Commit:** `feat(extension): buildable autofill extension shell`

---

### Unit 2.6 — ATS field maps & fixture lab

> **Objective:** reliable autofill on common ATS pages; regressions caught in CI.

- **Depends on:** 2.5.
- **Maps (minimum):** Greenhouse, Lever, Ashby, Workday, SmartRecruiters, iCIMS, BambooHR, **generic** fallback (label, name, id, placeholder, `aria-label`, `autocomplete`, fieldset legend).
- **Logic:** `detectAts(hostname)` → map id; `extractFields(document)` → normalized fields; `matchPacketField(field, packet)` → value + confidence; fill only above threshold; return skipped reasons.
- **Innovation:** fixture HTML per ATS under `extension-safari/test/fixtures/`; optional “map trainer” dev page to export JSON for new hosts.
- **Tests:** each fixture fills name/email/phone/LinkedIn where present; **skips** EEO/SSN; generic fallback on unknown HTML.
- **Acceptance:** known ATS fixtures green in CI; sensitive fields never filled.
- **Commit:** `feat(extension): ATS field maps and fixture lab`

---

### Unit 2.7 — Apply session logging & extension bridge (Phase 6 hooks)

> **Objective:** track apply work without storing external form secrets; stub bi-directional bridge.

- **Depends on:** 2.4, 2.5.
- **Schema (migration):**
  ```sql
  CREATE TABLE application_events (
    id integer primary key autoincrement,
    application_id integer,
    kind text not null,       -- created | packet_opened | autofill_run | task_done | submitted | note
    source text default 'portal',
    summary text default '',
    metadata text default '{}',
    created_at text default (datetime('now')),
    foreign key (application_id) references applications(id) on delete cascade
  );
  ```
- **Backend:**
  - `POST/GET /api/applications/:id/events`
  - `POST /api/extension/context` — accepts scraped `{ fields, jobContext }`; returns field→answer map (use `answerQuestion` / retrieval when 3.5.2+ ready). **CORS: extension origin only.**
  - `POST /api/extension/save-job` — push listing into tracker from content script.
  - Extension posts `autofill_run` events: `{ hostname, filledCount, skippedCount, ats }` — **no field values**.
- **Frontend:** Activity timeline; **Mark submitted** → status `applied`, complete submit task, event.
- **Tests:** events CRUD; CORS rejects non-extension origins; mark submitted atomic.
- **Acceptance:** autofill runs and submits are auditable in the portal.
- **Commit:** `feat(apply): application events and extension bridge`

---

### Unit 2.8 — Safety, privacy & compliance hardening

> **Objective:** make the assistant trustworthy before daily use.

- **Depends on:** 2.5, 2.6, 2.7.
- **Backend:** `GET /api/assistant/apply-policy` — `{ canSubmit: false, sensitiveDenylist, extensionVersion }`.
- **Extension:** prefill **preview** before write; **undo last autofill** (in-memory previous values); optional “fill existing fields” default **off**.
- **Frontend:** Settings — fill-existing toggle, custom-field toggle, extension install instructions.
- **Tests:** denylist labels blocked; undo restores fixture values; policy always `canSubmit: false`.
- **Acceptance:** reviewer can confirm no submit and no sensitive fill by default.
- **Commit:** `fix(apply): harden extension safety policy`

---

## 6. Phase exit criteria (definition of done)

- [ ] **2.0** Application workspace is the single home for apply features.
- [ ] **2.1** Documents attach to applications; “what did I send?” is clear.
- [ ] **2.2** Checklist with deadlines; progress on cards and dashboard.
- [ ] **2.3** Apply plan works with and without `ANTHROPIC_API_KEY`.
- [ ] **2.4** Packet API powers portal copy and extension.
- [ ] **2.5–2.6** Extension builds, loads in Chrome, Safari path documented; **≥4 ATS fixtures** green; generic fallback works.
- [ ] **2.7** Activity log records autofill and submit; extension routes origin-locked.
- [ ] **2.8** No auto-submit; sensitive fields skipped; preview + undo available.
- [ ] All server + extension unit tests pass; `npm run lint` clean; manual walkthrough on one real Greenhouse or Lever posting.

---

## 7. Explicitly out of scope (Phase 6+)

- Auto-submit or autonomy levels L3
- Full field resolver (`resolveFields`) for arbitrary unseen fields
- Playwright runner
- Per-job resume **variants** (Phase 4.3) — Phase 2 links existing documents only
- Batch “apply to top N” queue

---

## 8. Suggested milestones (for planning, not calendar estimates)

| Milestone | Units | User-visible outcome |
|-----------|-------|----------------------|
| **M1 — Workspace** | 2.0–2.2 | Checklist + doc attachments in portal |
| **M2 — Intelligence** | 2.3–2.4 | Job-specific plan + one-click packet |
| **M3 — Extension core** | 2.5–2.6 | Real autofill on major ATS in Chrome |
| **M4 — Trust & audit** | 2.7–2.8 | Activity log, safety policy, Safari path |

---

## 9. Manual validation script (before calling Phase 2 done)

1. Save a job from Search → open workspace → attach default resume.
2. Run “Suggest apply plan” → add tasks → complete “Select resume”.
3. Install unpacked extension → set portal URL → open a **Greenhouse** application URL.
4. Select the application in popup → preview fields → autofill empty fields.
5. Confirm sensitive dropdowns untouched → mark submitted in portal → see activity event.
6. Repeat with API key off — template plan and heuristic autofill still work.

---

## 10. References

- Master plan (Phase 6 hooks): [`master-plan-autonomous-apply.md`](./master-plan-autonomous-apply.md)
- Expanded draft (archived): [`supplements/cursor-phase-3-discovery-23c7/phase-2-apply.md`](./supplements/cursor-phase-3-discovery-23c7/phase-2-apply.md)
- Current scaffold: [`extension-safari/README.md`](../../extension-safari/README.md)

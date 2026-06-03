# Phase 2 — Real Apply Assistance (bulletproof plan)

**Status:** ⬜ planned · **next after** Phase 3 / 3.5 discovery track  
**Goal:** turn applying from “open a tab and copy-paste” into a **guided, trustworthy application workspace** plus **production browser extensions (Safari + Chrome)** that fill real ATS forms — **Safari on iPad is a first-class target** because mobile Chrome does not support extensions — with you always reviewing and clicking Submit.

**Hard constraint (non-negotiable):** never auto-submit on Indeed, LinkedIn, or major ATS sites. The portal and extension may **prepare, prefill, copy, validate, and track**; the human submits.

**North star for this phase:** every saved job becomes an **application packet** — the right documents, a deadline-aware checklist, a job-specific plan, one API the extension trusts, and a field-fill engine that works on Greenhouse/Lever/Ashby/Workday-class forms without guessing SSN or EEO answers.

**Relationship to Phase 6:** Phase 2 is the **execution substrate** for autonomous apply. Phase 6.3 (autopilot) extends Phase 2.4–2.6 field maps and `/api/extension/*` routes — do not duplicate Phase 6 here; **design hooks only**.

See [shared conventions](./README.md) (work-unit template, migrations, orchestrator contract, testing/CI).

**Architecture validation:** Express backend + **CORS-locked** `/api/extension/*` bridge to a browser extension is the right security/state pattern for Phase 2. The extension is a dumb, trusted **executor**; the portal owns data, policy, RAG, and audit. Complex contextual answers flow through `POST /api/extension/context`, not ad-hoc prompt stuffing in the content script.

---

## 0. Phase 3.5 RAG ↔ Phase 2 (how personal data is chunked today & what Phase 2 adds)

**Today (`services/ai/indexer.js`):** knowledge is embedded as separate, labeled chunks:

| `source_type` | Granularity | Example |
|---------------|-------------|---------|
| `experience` | **One chunk per DB row** | `"Analyst at Blackstone: evaluated residential units…"` |
| `education` | One per row | `"MBA in Finance, Columbia"` |
| `answer` | One per Q&A (higher weight if edited) | `"Q: Why PE?\nA: …"` |
| `skill` / `custom` | Aggregated profile fields | `"Skills: Python, R, Stata"` |
| `resume_chunk` | **512-char windows** on the **default** resume only | Sliding text; may split mid-paragraph |

Retrieval (`retrieve(query, k)`) runs cosine similarity over these chunks; `buildCandidateContext({ query, useRetrieval: true })` replaces the bulky experience dump with **top-k evidence** plus a small identity core.

**Gap Phase 2 must close:** attaching a **non-default resume variant** (PE vs analytics) does not yet scope retrieval — only the default resume is chunked. **Unit 2.1 `variant_tag` + indexer extension (below)** ensures the extension and `/extension/context` pull evidence from the **attached** narrative, not another variant.

**Phase 2.7 requirement (with 3.5):** when resolving extension fields, pass `applicationId` → load attached `application_documents` → `retrieve(query, k, { resumeDocumentIds: [...] })` filters/boosts `resume_chunk` rows for those document IDs. Experiences remain global (each job is already its own chunk — Milan vs residential underwriting stay separated by `source_id`).

**Categorical precision (licenses, visa, proficiency):** store exact allowed values in `custom_fields` or profile (`drivers_license_class: G2`, `italian_proficiency: Professional`). Extension sends `<select>` options to the server; prompts for `/extension/context` must say: *output only a value from the provided options; never generalize* (see Unit 2.7).

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

## 2a. Browser & device strategy (Safari + Chrome, **iPad-first**)

Phase 2 ships **one shared extension core** with **two browser targets**. They are equally specified in exit criteria — not “Chrome first, Safari later.”

| Target | Role | Why |
|--------|------|-----|
| **Safari on iPadOS** | **Primary mobile** apply device | iOS/iPadOS allows Web Extensions in Safari; **Chrome on iOS does not support extensions** (Apple WebKit-only engine). |
| **Safari on macOS** | Same extension binary as iPad | Build/test Safari Web Extension via Xcode; App Store or ad-hoc install. |
| **Chrome / Arc / Edge (desktop)** | Fast dev loop + many users | Unpacked MV3 load; same `src/` bundled to `dist/`. |

**Repository layout (rename is optional; keep `extension-safari/` as the workspace name):**

```text
extension-safari/          # shared extension monorepo (historical name)
  src/                     # browser-agnostic core
  dist/chrome/             # MV3 manifest + bundle for Chromium
  dist/safari/             # MV3 manifest + bundle for Safari converter
  safari-app/              # Xcode project from safari-web-extension-converter (committed)
  test/fixtures/
```

**iPad networking (critical):** on iPad, `http://localhost:4000` is the **iPad itself**, not your Mac. For local-first dev:

1. Run the portal on a machine on the same network with `HOST=0.0.0.0` (document in server README / `.env.example`).
2. In extension **Options**, set portal URL to `http://<lan-ip>:4000` (e.g. `http://192.168.1.42:4000`).
3. **Test connection** button must succeed from Safari on iPad before autofill is enabled.

Production path for iPad-only users without a desktop: Phase 5 (hosted sync) or a simple tunnel — **out of Phase 2 scope**, but the extension must not hardcode `localhost`.

**iPad UX constraints to design for in 2.5–2.8:**

- Toolbar popup may be cramped → support **Safari Web Extension action + optional content-script “Autofill” chip** on apply pages.
- Touch targets ≥ 44pt in popup/options.
- `file` inputs on ATS pages: extension fills text fields only; **upload resume** stays manual on iPad (portal documents list + user picks file in Safari).
- Split-screen: portal web app in one Safari window/tab, application form in another — both work; packet API is the link.

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
| **Wrong resume narrative in RAG** | PE vs analytics variant confusion | `variant_tag` (2.1) + index all resume docs + scoped `retrieve` (2.7) |
| **Workday / Taleo / nested iframes** | `querySelectorAll` misses fields | Shadow-root recursion (2.6); gnarly Workday fixture; iframe-aware extract when same-origin |
| **`<select>` / dropdown questions** | Text fill breaks on visa, language, license | Field shape includes `options[]`; server maps RAG answer → nearest allowed `value` (2.7) |
| **Chrome vs Safari extension IDs** | CORS lock breaks one browser | `EXTENSION_ALLOWED_ORIGINS` in `.env` — both IDs (2.7) |
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
        │  /applications/*│              │ Safari iPad/mac +  │
        │ Chrome desktop     │
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

**Units:** `2.0 → 2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 2.5b → 2.6 → 2.7 → 2.8`  
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
    variant_tag text default '',    -- e.g. quant | underwriting | pe | ib | european-format
    label text default '',          -- human label: "Resume — analytics (Python/R/Stata)"
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
- **Frontend:** variant tag + label on attach (dropdown presets + free text); filter document picker by tag when switching pipelines (PE vs data analytics).
- **Indexer bridge (3.5):** index **every** resume document’s `extracted_text` as `resume_chunk` with `source_id = document.id` (not only default). Packet + `/extension/context` scope retrieval to attached document IDs.
- **Tests:** attach with variant_tag; packet lists tag; retrieval test — query about Python skills ranks analytics resume chunks above an unattached PE resume doc.
- **Acceptance:** “Which resume **variant** did I send?” is answerable; RAG for this application does not pull text from a different attached narrative.
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
- **Backend:** CRUD `/api/applications/:id/tasks`; **seed on create** — default template:
  1. Review job requirements · 2. Select resume **variant** · 3. Tailor materials ·
  4. Complete application form · 5. Submit · 6. Follow up (1 week).
  **Industry template packs** (optional seed via `template_pack` on create or apply-plan):
  - `finance` / `pe` / `ib`: add *Identify 1 contact to reach out on LinkedIn* · *Draft deal/transaction talking points* · *Confirm compliance/disclosure attachments*.
  - `real_estate` / `development`: add *Prepare project/portfolio summary* · *Verify license/cert uploads*.
  - `analytics` / `quant`: add *Align technical stack narrative (Python/R/SQL)* · *Prepare case-study or take-home if mentioned*. List endpoint adds `taskProgress: { done, total }`; stats add `tasksDueSoon` / `overdueTasks`.
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
- **Prompt:** “Infer only what the job text supports. Never claim submission is complete.” For high-stakes roles, prefer **networking and narrative** tasks over generic filler.
- **Orchestrator upgrade:** `applyPlan({ application })` detects **firm/sector signals** in the JD (boutique IB, PE, real estate development, large-cap, quant/analytics) and appends checklist items, e.g.:
  - *Cold-email / LinkedIn outreach to one associate or VP* (category `networking`)
  - *Prepare deal sheet / transaction experience narrative* (category `document`)
  - *Research recent firm deals or portfolio companies* (category `apply`)
  Template fallback mirrors keyword rules (no API key required).
- **Likely questions:** extract compliance/certification prompts (visa sponsorship, driver's license class, language proficiency) into `likely_questions` so `/extension/context` can answer with **exact categorical** values from profile/custom_fields.
- **Tests:** template detects portfolio/cover-letter language; AI parse stubbed; mergeTasks dedupes; works without API key.
- **Acceptance:** JD with “include portfolio” → portfolio requirement + task.
- **Commit:** `feat(apply): AI apply plan and requirement extraction`

---

### Unit 2.4 — Stagehand autonomous apply service (CDP bridge) & application packet API

> **Objective:** deliver **fully autonomous, high-quality auto-submission** via a backend **Stagehand** service that connects to the user's active Chrome tab over the Chrome DevTools Protocol (CDP), while keeping the application **packet API** as the canonical data contract for the portal workspace.

> **Architectural pivot (supersedes legacy assist-only constraint for execution):** Phase 2 now targets **L3-style auto-submit** on eligible employer/ATS pages. The browser extension **no longer scrapes or fills the DOM** — it is a lightweight **Trigger UI** only. All form intelligence and submission happen server-side through Stagehand.

> **Preserved upstream work (do not regress):** Units **2.1**, **2.2**, and **2.3** remain as specified — document attachments (`application_documents` + `variant_tag`), per-application checklist (`application_tasks`), and AI apply plan (`apply_plans` + `orchestrator.applyPlan`). This unit **consumes** their outputs; it does not replace or invalidate them.

> **`ats_field_mappings` table — retained and repurposed (Task 2):** the SQLite table created in Task 2 **stays in the schema**. It is **not** dropped or superseded by a new table. It becomes the backend Stagehand service's **internal semantic memory**: cached resolutions keyed by `(host, field_label, field_type, options_hash)` → `{ vault_key, answer, strategy, confidence, updated_at }`. Stagehand's `extract()` supplies live field semantics from the page; `ats_field_mappings` stores what the resolver learned so repeat fills on the same ATS host are faster, cheaper, and more consistent. This replaces brittle CSS-selector field maps — the cache is **semantic**, not DOM-selector-based.

- **Depends on:** 2.1 (document attachments + `variant_tag`), 2.2 (checklist), 2.3 (apply plan + `likely_questions`).
- **Packages:** `@browserbasehq/stagehand` in `server/` (backend-only). **Prerequisite on the user's machine:** Chrome launched with remote debugging, e.g. `google-chrome --remote-debugging-port=9222` (document in README / server `.env.example` as `CHROME_CDP_URL=http://localhost:9222`).
- **Schema:** **no migration that drops or renames `ats_field_mappings`.** Optional additive columns on `ats_field_mappings` only if needed for confidence/strategy metadata; the Task 2 table is the source of truth for field-resolution cache.
- **Backend — application packet (portal contract, unchanged purpose):**
  - `GET /api/applications/:id/packet`:
    ```js
    {
      application,
      candidate: { fields: [{ label, value, aliases, sensitivity }], profile, experiences, education, skills },
      documents: [{ role, variantTag, label, filename, downloadUrl, extractionStatus, documentId }],
      answers: [{ question, answer, source }],
      applyPlan,
      tasks,                    // from 2.2
      retrievalScope: { resumeDocumentIds: number[], variantTags: string[] },
      applyPolicy: { canAutofill: true, canAutoSubmit: true, redactedFields: [...], requiresCdp: true }
    }
    ```
  - Refactor `/api/assistant/autofill` to use the packet serializer for the generic case.
  - Sensitivity tags: `public` | `contact` | `sensitive`.
  - **`retrievalScope`** derived from 2.1 attachments — passed to `buildCandidateContext` / orchestrator RAG during field resolution.
- **Backend — Stagehand apply service (`services/apply/stagehandRunner.js`):**
  - **`POST /api/extension/trigger-apply`** — body:
    ```js
    { applicationId: number, url: string }   // url = current tab location from extension Trigger UI
    ```
  - **Execution pipeline** (async job or awaited run, logged to `application_events` when 2.7 lands):
    1. **Connect:** instantiate Stagehand with `cdpUrl: process.env.CHROME_CDP_URL || 'http://localhost:9222'` and attach to the tab whose URL matches `url`.
    2. **Extract:** `stagehand.extract(...)` — read the live application form into normalized fields `{ label, type, options?, required, currentValue }` (handles dynamic React/Workday-class DOM without extension-side maps).
    3. **Resolve:** for each extracted field, resolve the answer in order:
       - **`ats_field_mappings`** cache lookup (host + semantic field key)
       - **application packet** (profile, experiences, education, skills, attached documents, persisted Q&A from 2.1)
       - **`orchestrator.js` RAG memory** — `buildCandidateContext({ query, useRetrieval: true, resumeDocumentIds })` scoped by packet `retrievalScope`
       - **`applyPlan.likely_questions`** (2.3) for categorical/screening prompts (visa, license class, language proficiency — exact option match only)
    4. **Learn:** upsert successful resolutions into **`ats_field_mappings`** (semantic memory grows per host).
    5. **Fill:** `stagehand.act(...)` per field — set text, select valid `<option>` values, toggle checkboxes/radios.
    6. **Submit:** `stagehand.act('click the submit application button')` (or host-specific submit instruction from cache) when policy allows.
    7. **Audit:** record run summary `{ hostname, filledCount, skippedCount, submitted: boolean }` — **never** persist raw field values or SSN/EEO answers in logs.
  - **CORS:** origin-locked to extension IDs (same pattern as 2.7); route is extension-triggered only.
- **Extension (API contract in 2.4; thin Trigger UI shipped in 2.5+):**
  - On a detected apply page: user selects saved application → clicks **Apply for me** → extension sends `POST /api/extension/trigger-apply` with `{ applicationId, url: location.href }`.
  - **No** content-script DOM scraping, `fieldMaps/*`, `domFields.js`, or in-browser fill logic — those responsibilities move entirely to the backend Stagehand service (2.5–2.6 units refocus on Trigger UI + CDP setup docs, not DOM maps).
- **Frontend:** Packet section — copy grouped fields, copy answers, download attachments, open posting URL; **Apply for me** CTA with Chrome CDP setup instructions; run status from Activity/events when available.
- **Tests:** packet includes attachments + `retrievalScope`; sensitive tags; trigger-apply with **mocked Stagehand** (extract → resolve → act → submit sequence); `ats_field_mappings` cache hit on second resolve for same host/label; no raw resume blob in packet unless requested; resolver never fabricates factual/EEO fields without vault data.
- **Acceptance:**
  - Portal packet API works standalone (Units 2.1–2.3 data visible and copyable).
  - With Chrome on `:9222` and a Greenhouse/Lever apply tab active, trigger-apply **extracts, fills, and submits** end-to-end.
  - Second apply to the same host reuses **`ats_field_mappings`** without redundant LLM calls for known fields.
  - Units 2.1, 2.2, 2.3 behaviour unchanged; attached resume variant scopes RAG correctly.
- **Commit:** `feat(apply): Stagehand CDP auto-submit service, packet API, and trigger-apply route`

---

### Unit 2.5 — Shared extension core + dual browser builds (Chrome + Safari)

> **Objective:** one bundled codebase, **two shippable targets** (Chromium MV3 + Safari Web Extension).

- **Depends on:** 2.4.
- **Packages:** `esbuild` in `extension-safari/`; `webextension-polyfill` only if `browser.*` vs `chrome.*` divergence grows.
- **Build outputs:**
  - `npm run build` → `dist/chrome/` and `dist/safari/` (same JS; manifest/icons differ where required).
  - Safari converter input is always `dist/safari/`.
- **Shared `src/`:**
  - `content.js`, `popup.*`, `options.*`
  - `shared/portalClient.js` — fetch packet; **no hardcoded host**; reads from `browser.storage.sync`
  - `shared/storage.js` — abstracts `chrome.storage` / `browser.storage`
  - `fieldMaps/*`, `shared/domFields.js`, `shared/safety.js`
- **Behaviour (both browsers):** options (portal URL, **Test connection**, privacy copy); popup (hostname, select application, preview, autofill empty, copy packet); **never submit**; `input`/`change` after fill.
- **API surface:** use `browser.*` namespace in source; thin adapter or polyfill for Chromium.
- **Tests:** build both targets; no top-level ESM `export` in content bundle; popup handles portal unreachable; storage round-trip.
- **Acceptance:**
  - **Chrome:** loads unpacked from `dist/chrome/`; autofill hits packet API on desktop.
  - **Safari:** `xcrun safari-web-extension-converter dist/safari --project-location safari-app` produces a reproducible Xcode project (committed or CI-artifact).
- **Build scripts:**
  - `npm run build` → esbuild → `dist/chrome/` + `dist/safari/`
  - `scripts/build-safari.sh` — wraps `xcrun safari-web-extension-converter`, Xcode project cleanup, iOS+macOS targets; **kept separate from esbuild** (converter is brittle in CI; script documents manual/CI steps)
- **Commit:** `feat(extension): dual Chrome + Safari builds from shared core`

---

### Unit 2.5b — Safari on iPadOS (primary mobile ship path)

> **Objective:** prove the extension works on **Safari for iPad** — the main mobile apply surface.

- **Depends on:** 2.5, 2.5b (maps validated on Safari iPad before Phase 2 sign-off).
- **Server / portal (document + minimal config):**
  - `.env.example`: `HOST=0.0.0.0` so LAN devices can reach the API.
  - README: “Using the extension on iPad” — find Mac/LAN IP, allow local network if prompted, set URL in extension options.
  - Optional dev-only: mDNS hint `http://<hostname>.local:4000` if reliable on your network.
- **Safari / Xcode:**
  - Enable extension in **Settings → Apps → Safari → Extensions** on iPad.
  - Distribution path documented: **development** (Xcode run to device), **Ad Hoc**, or **TestFlight** — pick one and document steps in `extension-safari/README.md`.
  - `safari-app/` target supports **iOS + macOS** (or separate targets from same `dist/safari`).
- **iPad-specific UX:**
  - Popup layout responsive (min width, scroll, 44pt controls).
  - If popup is too small for review, add optional **content-script banner** on detected apply pages: “Review autofill” → opens popup or inline preview list.
  - **Connection test** shows clear errors: unreachable host, CORS, HTTP not HTTPS (local HTTP is OK on LAN).
- **CORS / security:** `/api/extension/*` allows Safari extension origins from **both** macOS and iPad builds (may differ extension IDs — register both or use a shared app group during dev).
- **Tests:** automated — viewport fixtures at iPad width for popup HTML; manual — required in acceptance.
- **Acceptance (manual, on physical iPad):**
  1. Portal running on LAN; extension options → Test connection **green**.
  2. Open a Greenhouse (or Lever) apply URL in Safari.
  3. Select saved application → preview → autofill empty fields → user submits manually.
  4. Activity shows `autofill_run` in portal (from iPad).
- **Commit:** `feat(extension): Safari on iPad install path and LAN portal docs`

---

### Unit 2.6 — ATS field maps, shadow DOM, & fixture lab

> **Objective:** reliable autofill on **modern ATS (Greenhouse/Lever/Ashby)** *and* **legacy enterprise** flows (Workday, Taleo, boutique custom portals).

- **Depends on:** 2.5, 2.5b.
- **Maps (minimum):** Greenhouse, Lever, Ashby, **Workday** (priority), SmartRecruiters, iCIMS, BambooHR, Taleo/custom — plus **generic** semantic fallback.
- **DOM extraction (`shared/domFields.js`):**
  - **Shadow DOM bridge:** recursive `deepQueryAll(selector, root)` walks `shadowRoot` trees — enterprise forms often hide inputs inside shadow roots.
  - **Iframes:** when same-origin, traverse into `contentDocument`; when cross-origin, skip with reason `cross_origin_iframe` (user fills manually).
  - Normalized field: `{ label, name, id, type, required, tagName, options?, shadowPath?, confidence }`.
- **Categorical controls:** for `<select>` / combobox / radio groups, capture `options: [{ value, label }]`. Filling uses **value match**, not free text — critical for visa sponsorship, language proficiency, license class.
- **Logic:** `detectAts(hostname)` → map; `extractFields` → `matchPacketField` → fill only above threshold; report skips with reasons.
- **Fixture diversity (`extension-safari/test/fixtures/`):**
  - Modern: `greenhouse.html`, `lever.html`, `ashby.html`
  - **Gnarly:** `workday-multipage.html` — nested divs, shadow roots, obfuscated IDs, multi-step sections (required regression target)
  - Optional: `taleo-fragment.html`, boutique custom form
- **Innovation:** optional “field map trainer” dev page to export JSON selectors for new hosts.
- **Tests:** per-fixture fill assertions; EEO/SSN skipped; Workday fixture must find fields inside shadow DOM; select fields choose valid `option.value`.
- **Acceptance:** fixtures green in CI; **Workday fixture** passes; **≥1 real apply URL on Safari iPad** (manual).
- **Commit:** `feat(extension): ATS maps, shadow DOM traversal, Workday fixtures`

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
  - `POST /api/extension/context` — body:
    ```js
    {
      applicationId,           // required for scoped RAG + packet
      jobContext: { title, company, description, url },
      fields: [{
        label, name, type,           // text | select | radio | checkbox | textarea
        required, options?,          // for select/radio: [{ value, label }]
        currentValue
      }]
    }
    ```
    Server: load packet + `applyPlan.likely_questions`; for each field call retrieval with `query = label + options labels`; **`resolveSelectAnswer(value, options)`** picks closest allowed option (no hallucinated enum values). Prompt rule: *for licenses, visas, languages — output exact tier from profile/custom_fields only*.
    **CORS:** `EXTENSION_ALLOWED_ORIGINS` in `server/.env` — comma-separated list of extension origins (Chrome extension ID **and** Safari macOS/iPad origins differ). Reject all others.
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
- **Frontend:** Settings — fill-existing toggle, custom-field toggle, extension install instructions (**Safari on iPad** and Chrome desktop).
- **Tests:** denylist labels blocked; undo restores fixture values; policy always `canSubmit: false`.
- **Acceptance:** reviewer can confirm no submit and no sensitive fill by default.
- **Commit:** `fix(apply): harden extension safety policy`

---

## 6. Phase exit criteria (definition of done)

- [ ] **2.0** Application workspace is the single home for apply features.
- [ ] **2.1** Documents attach to applications; “what did I send?” is clear.
- [ ] **2.2** Checklist with deadlines; progress on cards and dashboard.
- [ ] **2.3** Apply plan works with and without `ANTHROPIC_API_KEY`.
- [ ] **2.4** Packet API powers portal workspace; Stagehand CDP service + `POST /api/extension/trigger-apply` auto-submits on eligible ATS pages; **`ats_field_mappings`** semantic cache retained and populated.
- [ ] **2.5–2.5b** Shared core builds **Chrome + Safari**; Safari Web Extension runs on **iPad** with LAN portal URL; connection test works.
- [ ] **2.1** `variant_tag` scopes document attachment; multi-resume indexing supports RAG.
- [ ] **2.3** Apply plan can append finance/networking tasks from template or AI.
- [ ] **2.6** Includes **Workday gnarly fixture** + shadow DOM; select/radio filling tested.
- [ ] **2.7** `/extension/context` handles `select` options; CORS allows Chrome + Safari origins from `.env`.
- [ ] **2.7** Activity log records autofill and submit; extension routes origin-locked.
- [ ] **2.8** No auto-submit; sensitive fields skipped; preview + undo available.
- [ ] All server + extension unit tests pass; `npm run lint` clean; manual walkthrough on one real Greenhouse or Lever posting.

---

## 7. Explicitly out of scope (Phase 6+)

- Multi-page wizard orchestration beyond single-page submit (Phase 6.3 extends 2.4 Stagehand runner)
- Full field resolver (`resolveFields`) for arbitrary unseen fields without cache warm-up (Phase 6.1)
- Playwright headless runner without an open Chrome tab (Phase 6.7)
- Full **AI-generated** resume variants per job (Phase 4.3) — Phase 2 links existing uploaded docs + `variant_tag`; user uploads separate files per narrative
- Batch “apply to top N” queue (Phase 6.5)
- In-extension DOM scraping / per-ATS CSS field maps (superseded by Stagehand `extract()` in 2.4)

---

## 8. Suggested milestones (for planning, not calendar estimates)

| Milestone | Units | User-visible outcome |
|-----------|-------|----------------------|
| **M1 — Workspace** | 2.0–2.2 | Checklist + doc attachments in portal |
| **M2 — Intelligence** | 2.3–2.4 | Job-specific plan + one-click packet |
| **M3 — Extension core** | 2.5–2.5b–2.6 | Autofill on major ATS in **Safari (iPad)** and Chrome desktop |
| **M4 — Trust & audit** | 2.7–2.8 | Activity log, safety policy, iPad-friendly preview/undo |

---

## 9. Manual validation script (before calling Phase 2 done)

### A. Portal (any browser)

1. Save a job from Search → open workspace → attach default resume.
2. Run “Suggest apply plan” → add tasks → complete “Select resume”.

### B. Chrome desktop (dev smoke)

3. Load unpacked `dist/chrome/` → set portal URL (`http://localhost:4000` or LAN IP).
4. Open a **Greenhouse** apply URL → select application → preview → autofill empty fields.

### C. Safari on iPad (**required** — primary mobile)

5. On Mac: run portal with `HOST=0.0.0.0`; note LAN IP.
6. Install Safari extension to iPad (Xcode → device, or TestFlight).
7. Extension options → portal URL `http://<lan-ip>:4000` → **Test connection** succeeds.
8. On iPad Safari, open the same Greenhouse apply URL → autofill → verify a **dropdown** (e.g. work authorization) maps to a valid option → **you** tap Submit.
9. Confirm sensitive/EEO fields untouched; portal Activity shows `autofill_run` from extension.

### D. Fallback paths

10. Repeat C with API key off — template plan and heuristic autofill still work.
11. Confirm mobile **Chrome on iPad does not ship this extension** (documented limitation; Safari only).

---

## 10. References

- Master plan (Phase 6 hooks): [`master-plan-autonomous-apply.md`](./master-plan-autonomous-apply.md)
- Expanded draft (archived): [`supplements/cursor-phase-3-discovery-23c7/phase-2-apply.md`](./supplements/cursor-phase-3-discovery-23c7/phase-2-apply.md)
- Current scaffold: [`extension-safari/README.md`](../../extension-safari/README.md)

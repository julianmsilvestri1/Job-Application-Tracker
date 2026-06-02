# Master Plan — Autonomous Application System ("Apply For Me")

This is the umbrella plan that ties the six phase specs together toward one
north star: **you fill in your information once, and the AI applies for you.**
It does not replace the phase docs — it sequences them, names the capability
gaps between "today" and "autonomous", and adds the one phase the current six
do not yet cover: the **Autonomous Apply Engine (Phase 6)**.

Read alongside [`ROADMAP.md`](../../ROADMAP.md) (what/why), the per-phase specs
in this folder (how), and the [shared conventions](./README.md) (work-unit
template, migrations, AI orchestration contract, testing/CI). Phase 6 below uses
the same one-PR work-unit format so each piece is build-ready.

> Status legend: ✅ shipped · 🟡 in progress · ⬜ not started

---

## 1. The promise (and the honest version of it)

**The promise:** enter everything about yourself in the personal section once.
For any job, the AI tailors your materials, fills **every field** in the
application, and submits — and tracks it all.

**The honest version (read this first).** "Apply for me" cannot mean a silent
bot that mass-submits on LinkedIn/Indeed/major ATS. That violates their Terms of
Service and is actively blocked (bot detection, CAPTCHAs, auth walls, rate
limits). Pretending otherwise produces a brittle, bannable, dishonest product.

So this plan reframes autonomy as a **spectrum**, and engineers the system to
push as far up that spectrum as is **safe, permitted, and reliable** — with a
human approval gate as the default, and true hands-off submit only where it is
explicitly allowed and the user opts in.

### Autonomy levels
| Level | Name | What happens | Default? |
|-------|------|--------------|----------|
| **L0** | Manual | Copy/paste helper (today's autofill panel). | — |
| **L1** | Assisted fill | Extension fills empty fields on the open form on one click; user submits. | — |
| **L2** | Prefill + review | The whole application (all pages, attachments, screening answers) is auto-filled from your knowledge base; you review a summary and click submit. | **Yes** |
| **L3** | Auto-submit (opt-in, eligible sites only) | On a per-site allowlist the user enables (typically direct employer/ATS pages, never LinkedIn/Indeed), the engine submits after passing its safety checks. CAPTCHA/auth always hands back to you. | Off |

The engineering goal is to make **L2 effortless and complete** for essentially
any application, and to make **L3 available** wherever it is defensible. Most of
the user-perceived "it applies for me" magic lives at L2/L3.

---

## 2. The autonomy capability stack

For the AI to fill any application autonomously, six things must be true. Each
maps to existing phase work plus the new Phase 6.

```
┌─────────────────────────────────────────────────────────────────────┐
│ 6. Trust & control: approval gate, autonomy policy, audit, dry-run    │  Phase 6.4
├─────────────────────────────────────────────────────────────────────┤
│ 5. Execution: extension fills every field across multi-page ATS flows │  Phase 2.4 + 6.3
├─────────────────────────────────────────────────────────────────────┤
│ 4. Plan: per-job application plan (docs + field→answer map + gaps)    │  Phase 6.2
├─────────────────────────────────────────────────────────────────────┤
│ 3. Resolver: map ANY field {label,type,options} → your best answer    │  Phase 6.1
├─────────────────────────────────────────────────────────────────────┤
│ 2. Materials: tailored resume/cover variants per job                  │  Phase 4.3 (+1.5, 3)
├─────────────────────────────────────────────────────────────────────┤
│ 1. Knowledge: a complete, structured "answer vault" about you         │  Phase 1.5 + 6.0
└─────────────────────────────────────────────────────────────────────┘
```

The two genuinely new ideas the current six phases do **not** yet contain are
the **Answer Vault** (layer 1, completed) and the **Field Resolver + Apply
Plan + Autopilot** (layers 3–6). Those are Phase 6.

---

## 2.5 Technology pillars — what makes this innovative, not just functional

The plan below is sound, but "sound" is the floor. These seven engineering
decisions turn the capability stack from *a CRUD app that calls an LLM* into a
**private, self-improving, trustworthy autonomy engine**. Each is **local-first**,
**degrades gracefully** (keeps today's heuristic when the new capability is
unavailable), and is **reused across phases** rather than bolted onto one.

> Design rule: an innovation only earns its place if it (a) makes a task cheaper
> *or* more reliable *or* more private, and (b) has a deterministic fallback so
> the product never hard-depends on it. Every pillar below meets that bar.

### P1 — A unified local semantic layer *(the highest-leverage idea)*
Today's fit scoring, dedupe, and field matching each use ad-hoc string
heuristics. Replace them with **one** in-process embedding model + vector index
that powers four features at once:

| Consumer | Today | With the semantic layer |
|----------|-------|-------------------------|
| Fit scoring (3.1) | keyword overlap | cosine(résumé⃗, JD⃗) — true semantic match; AI explains on top |
| Field resolution (6.1) | synonym table | nearest-neighbour of field-label⃗ vs vault-key⃗ — instant, offline |
| Cross-board dedupe (correctness) | URL/title key | catch reworded near-duplicate postings |
| Answer reuse (6.1) | — | "answered something like this before?" → retrieve closest past answer |

- **Tech:** [`@xenova/transformers`](https://github.com/xenova/transformers.js)
  (Transformers.js — ONNX runtime, runs **in-process, no API, no network**) with
  a small sentence model (`all-MiniLM-L6-v2`, ~25 MB, 384-d) + **`sqlite-vec`**
  for kNN search *inside the existing SQLite file*. A `vectors(content_hash,
  embedding)` table embeds each string once.
- **Why it's innovative:** the résumé never leaves the machine to be embedded,
  it works with **zero API key**, and the same subsystem unifies four features
  that would otherwise be four different hacks.
- **Honest trade-off:** ~25 MB model + cold-start; gated behind a capability
  flag with the current heuristic as fallback.

### P2 — Accessibility-tree-first element targeting *(resilient autopilot)*
ATS forms churn class names and DOM structure constantly, so CSS-selector field
maps rot. The autopilot (6.3) locates fields the way a screen reader (and
Playwright's locators) do: **ARIA role + accessible name + associated
`<label>`**, then `name`/`autocomplete`/placeholder, and only *then* per-ATS CSS.
Paired with a **`MutationObserver` fill loop** for dynamic React/Workday forms
(wait for render → fill → re-apply after re-renders) and **shadow-DOM-aware**
traversal (open roots; closed roots documented as a limit). More drift-resistant,
and accessibility-correct as a side effect.

### P3 — Field maps as versioned data + a self-healing loop
Per-ATS maps live in the **database, not code** (versioned rows). Every fill
records `(host, field_key, strategy, success)` telemetry; when a host's fill-rate
drops (layout drift) the engine auto-falls back to the AX-tree/embedding resolver,
flags the stale map, and **proposes an updated map from the successful
resolutions**. The result is a *learned field-map cache* that gets cheaper and
more accurate over time and can be corrected **without shipping a new extension
build**.

### P4 — Event-sourced apply runs + tamper-evident audit
An `apply_run` is the **fold of its event log** (event sourcing): run state,
audit trail, time-travel, and resumability all derive from one source of truth.
Each event stores `hash = sha256(prev_hash + payload)` — a **hash chain** that
makes "what did the bot do on my behalf?" verifiable and tamper-evident. This is
what turns *"autonomy you can trust"* from a slogan into a property you can check.

### P5 — A durable, idempotent apply queue *(never double-apply)*
The batch queue (6.5) is a **SQLite-backed durable job queue** (no external
broker) with a per-job **idempotency key = `job_key`**, exponential backoff, and
a resumable state machine. It dedupes against the tracker and enforces a
per-employer rate limit — so "apply to my top matches" can never silently submit
twice or spam one company. A real autonomy hazard, solved at the data layer.

### P6 — Privacy-first encrypted vault
The Answer Vault holds sensitive PII (address, DOB, work authorization,
demographics). Sensitive categories are **encrypted at rest** with a key from the
OS keychain (or an app passphrase via `scrypt`), and a **redaction layer** scrubs
PII from logs and audit detail. Local-first **and** encrypted is a real
differentiator over cloud autofill tools that store your identity on their
servers.

### P7 — Smarter, cheaper AI orchestration
The orchestrator already centralizes Claude with fallbacks. Phase 6 adds:
- **Prompt caching** of the large, reused candidate-context block (résumé +
  vault) via Anthropic `cache_control` → big cost/latency cut across the dozens
  of field/essay calls per application.
- **Deterministic-first, AI-last** resolution (P1) so most fields never hit the
  model at all.
- **Schema-validated tool-use with a one-shot repair loop** — invalid JSON is
  re-asked against the schema before falling back.
- **Calibrated confidence → routing:** sub-threshold answers (and *all* factual
  categories) route to the human gate instead of being filled.
- **Progressive fill:** canonical fields fill instantly; AI-resolved fields
  stream in as they return, so the form visibly completes in real time.

> These pillars are introduced incrementally — P2/P3 land with Phase 2's
> extension, P1 retro-upgrades Phase 3's fit scoring and is required by 6.1,
> P4/P5 are the spine of 6.2/6.5, and P6/P7 harden 6.0/6.4. Each Phase 6 unit
> below names the pillar(s) it realizes.

---

## 3. How the existing phases ladder into autonomy

| Phase | Status | Role in "apply for me" |
|-------|--------|------------------------|
| **1.5 — Foundation** | ✅ | The knowledge base + single AI orchestrator. Resume text is already live AI context; Q&A persists. This is the substrate the vault and resolver build on. |
| **Correctness** | ✅ | Tests/CI/lint/dedupe. Autonomy that isn't trustworthy is worthless, so the quality bedrock is a prerequisite, not a nicety. |
| **3 — Discovery** | ✅ (PR #9) | Finds the *right* jobs (fit scoring), builds the recommended feed, and tailors positioning. The autonomous queue (6.5) applies to the feed's top-fit jobs. |
| **2 — Apply** | ⬜ | **The substrate for execution.** 2.1 doc↔app links, 2.2 checklist, and especially **2.4 the production extension with per-ATS field maps** (Greenhouse/Lever/Workday/Ashby). Phase 6's autopilot is built directly on 2.4's field maps. |
| **4 — Tracker** | ⬜ | **4.3 per-job document variants** is required so the engine has a tailored resume to attach. 4.1 coaching, 4.4 analytics, and 4.5 contacts/.ics make the post-apply loop autonomous too. |
| **5 — Scale** | ⬜ (gated) | Only needed for cloud/multi-device or headless autonomy. Local L2/L3 via the browser extension does **not** require it. Pull just the `user_id` seam (5.0) early **only if** cloud autonomy is desired. |
| **6 — Autonomous Apply** | ⬜ (new) | The actual "apply for me": resolver → plan → autopilot → approval/audit → batch queue. |

**Revised build order for the autonomy goal:**
`1.5 ✅ → correctness ✅ → 3 ✅ → 2 → 4.3 (+4.1) → 6 → (5 only if cloud) → rest of 4`.

Rationale: Phase 2 gives the extension + field maps the autopilot needs; 4.3
gives tailored resumes to attach; then Phase 6 assembles them into autonomous
applying. The rest of Phase 4 (analytics, contacts) and Phase 5 (scale) are
parallelizable and not on the critical path to first autonomous apply.

---

## 4. Phase 6 — Autonomous Apply Engine

**Goal:** given a job and a complete profile, autonomously produce and execute a
full application — every field filled, the right documents attached — with a
human approval gate by default and opt-in auto-submit where eligible.

**Hard constraints (inherited + extended from Phase 2):**
- Never auto-submit on LinkedIn/Indeed/known ToS-restricted hosts. Ever.
- Never fabricate a factual answer (work authorization, degrees, employment
  dates, certifications). Unknown factual fields are surfaced to the user, not
  invented.
- Every automated action is logged and reversible up to the submit gate.
- CAPTCHAs, logins, and identity checks always hand control back to the human.

**Units:** 6.0 → 6.1 → 6.2 → 6.3 → 6.4 → 6.5 (→ 6.6 hardening)

---

### Unit 6.0 — Answer Vault & profile completeness
- **Objective:** turn scattered profile data into one queryable knowledge base,
  and tell the user exactly what's missing to apply autonomously.
- **Innovation (P6, P1):** the vault is a typed, **versioned facts ledger** with
  per-fact provenance + confidence + a resume **source span** (which line a fact
  came from) for one-click verification; sensitive categories are **encrypted at
  rest**; canonical export/import uses the **JSON Resume** open schema for
  portability. Vault keys are embedded (P1) so the resolver can match by meaning.
- **Depends on:** 1.5.x.
- **Schema (migration):**
  ```sql
  CREATE TABLE answer_vault (
    id integer primary key autoincrement,
    category text not null,        -- identity|contact|work_auth|comp|logistics|eeo|links|screening|custom
    key text not null,             -- canonical key, e.g. 'desired_salary', 'notice_period', 'willing_to_relocate'
    label text default '',         -- human label as commonly seen on forms
    value text default '',
    source text default 'user',    -- user|profile|resume|inferred
    confidence integer default 100,
    updated_at text default (datetime('now')),
    unique(key)
  );
  ```
  Seed canonical keys from the profile (name, email, phone, location, links,
  work auth, sponsorship, desired salary, years experience) plus the common
  screening set (notice period, relocation, remote preference, start date,
  pronouns/EEO **optional**, security clearance, references available).
- **Backend:** `services/vault.js` — read/write canonical answers; a
  `completeness()` function returning per-category coverage + a 0–100 score +
  the ordered list of missing high-frequency fields. Endpoints
  `GET/PUT /api/vault`, `GET /api/vault/completeness`. The autofill endpoint
  (`/api/assistant/autofill`) is refactored to read from the vault.
- **Frontend:** Profile gets a "Application readiness" card: completeness meter +
  a guided "Fill the gaps" form that only asks for missing buckets. EEO/
  demographic fields are clearly optional and default to "Decline to answer".
- **Prompt:** none required (structured). Optional: infer a few keys from resume
  text via the orchestrator (source=`inferred`, confidence<100, user confirms).
- **Tests:** completeness math on a seeded DB; vault upsert by canonical key;
  EEO fields default to decline; autofill reads vault.
- **Acceptance:** the user sees a readiness score and a short, finite list of
  fields to complete; once complete, the vault can answer the common
  application questions by canonical key.
- **Commit:** `feat(apply): answer vault + profile completeness`

---

### Unit 6.1 — Field resolver service
- **Objective:** map **any** application form field to your best answer, with a
  confidence and provenance, and never fabricate facts.
- **Innovation (P1, P7):** resolution is **deterministic-first, AI-last** — an
  embedding nearest-neighbour against vault keys (P1) resolves most fields with
  no model call; the LLM only handles genuinely novel labels, behind a
  **schema-validated tool-use + repair loop** with **calibrated confidence
  routing** (low-confidence and all factual categories → the human gate).
  Resolved `(host, label) → key` mappings are cached, so each ATS field is only
  ever AI-resolved once and the system gets cheaper over time.
- **Depends on:** 6.0, 1.5.2 (orchestrator), 3.x (Q&A/positioning for free-text).
- **Backend:** `services/apply/resolveField.js` + orchestrator task
  `resolveFields({ fields })`. Input field shape (normalized by the extension or
  caller): `{ id, label, name, type, options?, required, maxLength?, group? }`.
  Resolution pipeline per field:
  1. **Canonical map** — label/name → vault key via a curated synonym table
     (e.g. "Phone", "Mobile", "Contact number" → `phone`).
  2. **Semantic map (AI, tool-use JSON)** — for unmatched fields, ask the model
     to map `label`→ a vault key **or** mark `needsUser`; for `select/radio`,
     choose the best of `options`. Strict schema; defensive parse.
  3. **Derivations** — split full name, format dates, boolean→"Yes"/"No",
     compose mailing address.
  4. **Generative free-text** — for essay/"why us"/cover-style prompts, route to
     `answerQuestion`/`coverLetter` (Phase 1.5) tailored to the job (Phase 3).
  5. **Fallback** — `needsUser:true` with a reason. **Factual** categories
     (work_auth, education, employment dates, certifications) skip steps 2/4 and
     go straight to `needsUser` if not in the vault — never invented.
  Output: `[{ id, value, confidence, source, needsUser, reason? }]`.
  Endpoint `POST /api/apply/resolve { fields, job? }`.
- **Frontend:** none yet (consumed by 6.2/6.3); a debug view is optional.
- **Prompt:** "Map each form field to the candidate's known answer or mark it
  unknown. Never invent factual data. For choice fields pick exactly one of the
  given options." Tool-use schema:
  `{ results:[{ id, key?, value?, optionIndex?, needsUser, reason }] }`.
- **Tests:** each field type (text/select/checkbox/radio/date/file); synonym
  matches; never-fabricate on an unknown factual field (returns `needsUser`);
  select-option matching; free-text routes to the generator; heuristic path with
  no API key still resolves canonical fields.
- **Acceptance:** given a realistic field list, factual fields are filled only
  from the vault, choice fields pick a valid option, essays are drafted, and
  genuinely unknown fields are flagged — not guessed.
- **Commit:** `feat(apply): field resolver (vault + AI mapping, no fabrication)`

---

### Unit 6.2 — Application plan & apply runs
- **Objective:** compose and persist a complete, auditable plan for applying to
  one job — documents + resolved fields + the list of gaps.
- **Innovation (P4):** an `apply_run` is an **event-sourced aggregate** — its
  state is the fold of an append-only event log, giving audit, time-travel, and
  crash-resumability for free. Each event is **hash-chained**
  (`sha256(prev_hash + payload)`) so the record of what was done on the user's
  behalf is tamper-evident.
- **Depends on:** 6.1, 2.1 (doc↔app links), 4.3 (resume variants), 1.5 (cover).
- **Schema (migration):**
  ```sql
  CREATE TABLE apply_runs (
    id integer primary key autoincrement,
    application_id integer,         -- links into the tracker
    job_key text,                   -- source:externalId
    status text default 'draft',    -- draft|ready|needs_input|submitted|failed|cancelled
    autonomy_level text default 'L2',
    plan text default '{}',         -- JSON: { documents:[], fields:[], gaps:[] }
    created_at text default (datetime('now')),
    updated_at text default (datetime('now')),
    foreign key (application_id) references applications(id) on delete cascade
  );
  CREATE TABLE apply_run_events (
    id integer primary key autoincrement,
    run_id integer not null,
    kind text not null,             -- planned|field_filled|doc_attached|needs_input|submitted|error
    detail text default '',         -- JSON
    created_at text default (datetime('now')),
    foreign key (run_id) references apply_runs(id) on delete cascade
  );
  ```
- **Backend:** `services/apply/buildPlan.js`: for a job, (a) pick or auto-tailor a
  resume variant (4.3) + generate a cover letter (1.5), (b) resolve the known/
  expected fields (6.1), (c) compute `gaps` (needsUser + low-confidence). Persist
  an `apply_run` and seed/link an `applications` row. Endpoints
  `POST /api/apply/plan { job|applicationId }`, `GET /api/apply/runs`,
  `GET /api/apply/runs/:id`.
- **Frontend:** a "Prepare application" action (from Search/Recommended/an
  application) → shows the plan: attachments, answered fields, and the gap list
  to fill before applying.
- **Tests:** plan composes docs + fields + gaps; run persists with events;
  cascade with the application.
- **Acceptance:** preparing a job yields a saved, inspectable plan with the right
  documents, the resolved answers, and an explicit gap list.
- **Commit:** `feat(apply): application plan and apply runs`

---

### Unit 6.3 — Extension autopilot (in-page execution)
- **Objective:** the literal "fills in each application bucket" — the extension
  fills every resolvable field across a multi-page ATS form from a plan.
- **Innovation (P2, P3, P7):** **accessibility-tree-first targeting** (ARIA
  role + accessible name) instead of brittle CSS selectors, a
  **`MutationObserver` fill loop** for dynamic React/Workday flows, and
  **progressive fill** — canonical fields fill instantly while AI-resolved ones
  stream in. Fill outcomes feed the **self-healing field-map telemetry** (P3).
- **Depends on:** 2.4 (production extension + per-ATS field maps), 6.1, 6.2.
- **Extension:** extend the Phase 2.4 content script:
  - **Extract:** read the live form into normalized fields (reusing the per-ATS
    field maps + the generic label/name/autocomplete heuristic).
  - **Resolve:** POST the extracted fields (+ job context) to `/api/apply/resolve`
    (or load a prebuilt plan from 6.2).
  - **Fill:** set values for text/select/checkbox/radio/date; attach the chosen
    resume/cover file to file inputs where the browser allows; advance multi-page
    flows (Next/Continue) when configured.
  - **Highlight:** visibly mark low-confidence and `needsUser` fields and scroll
    the user to them; show a fill summary.
  - **Dry-run:** fill everything but never touch the submit button.
- **Backend:** the resolve endpoint (6.1) + a `POST /api/apply/runs/:id/events`
  to record what was filled.
- **Tests:** jsdom fixtures of Greenhouse/Lever/Workday/Ashby (incl. a multi-step
  form) filled from a plan; choice fields select the right option; unknown fields
  are highlighted not guessed; dry-run never clicks submit.
- **Acceptance:** on a sample ATS form, the extension fills all resolvable fields
  and attaches the resume, flags the rest, and submits nothing on its own.
- **Commit:** `feat(extension): autopilot form fill from an application plan`

---

### Unit 6.4 — Autonomy levels, approval gate & audit
- **Objective:** make autonomy controllable and accountable.
- **Innovation (P4):** the denylist + eligibility rules are **policy-as-code**
  with **property-based invariants** as tests (e.g. *no denylisted host can ever
  yield `auto_submit=1`*, checked over generated inputs with `fast-check`), so
  the safety guarantee is proven, not just asserted. The review screen shows a
  deterministic **submission diff** (exactly what values will be sent) sourced
  from the hash-chained event log.
- **Depends on:** 6.3.
- **Schema (migration):**
  ```sql
  CREATE TABLE autonomy_policies (
    host text primary key,          -- e.g. 'boards.greenhouse.io'
    level text default 'L2',        -- L0|L1|L2|L3
    auto_submit integer default 0,  -- only honored if host is eligible
    updated_at text default (datetime('now'))
  );
  ```
  A built-in **denylist** (linkedin.com, indeed.com, …) forces L≤2 and
  `auto_submit=0` regardless of policy.
- **Backend:** policy CRUD `GET/PUT /api/apply/policies`; the run executor checks
  policy + denylist before allowing submit; all actions append to
  `apply_run_events` (the audit trail). A "what will be submitted" summary
  endpoint for the review screen.
- **Frontend:** a **Review & approve** screen per run (edit any answer, see every
  field + attachment, then Approve→submit at L2, or auto at L3 if eligible); a
  per-site autonomy settings panel; an audit/history view (reuses
  `apply_run_events`).
- **Tests:** denylisted host can never reach L3/auto-submit; approval required at
  L2; events recorded for each action; editing an answer updates the plan.
- **Acceptance:** nothing is submitted without the configured gate; the denylist
  is unbypassable; every run has a complete, readable audit log.
- **Commit:** `feat(apply): autonomy levels, approval gate, and audit log`

---

### Unit 6.5 — Autonomous apply queue (batch over the recommended feed)
- **Objective:** the capstone — "apply to my best matches for me."
- **Innovation (P5, P1):** a **durable, idempotent** SQLite-backed queue —
  `job_key` idempotency keys + backoff + a resumable state machine guarantee
  **no double-applies**; it dedupes against the tracker (semantic near-dup via
  P1) and enforces a **per-employer rate limit** so a batch never spams one
  company.
- **Depends on:** 6.4, 3.1/3.2 (fit + recommended feed).
- **Backend:** an apply **queue**: enqueue jobs (e.g. recommended jobs with
  `fit ≥ threshold`), then for each generate a plan (6.2) and tailor docs; status
  per job (`queued→staged→needs_input→approved→submitted`). Rate-limited and
  resumable. Endpoints `POST /api/apply/queue { jobKeys[] }`,
  `GET /api/apply/queue`. Local execution still flows through the extension at the
  configured autonomy level (true headless submit requires Phase 5 cloud + is out
  of scope unless explicitly enabled per site).
- **Frontend:** on the Dashboard/Recommended feed, "Auto-prepare top matches" →
  a queue view: each job staged with its plan and gaps; bulk-approve the ready
  ones; jobs needing input are surfaced. Everything lands in the tracker.
- **Tests:** queue builds plans for N jobs (providers/AI stubbed); rate limit
  honored; needs-input jobs are not auto-advanced; tracker rows created.
- **Acceptance:** a batch of recommended jobs goes queued → staged plans →
  (approved) → tracked, with gaps surfaced and nothing submitted past the gate.
- **Commit:** `feat(apply): autonomous apply queue over the recommended feed`

---

### Unit 6.6 — Hardening & reliability (capstone, optional)
- **Objective:** make autonomy dependable over time.
- **Scope:** per-ATS fill-success telemetry; regression fixtures for new ATS
  layouts; "self-healing" field maps (flag drift when fill rate drops); an
  explicit "preview exactly what will be submitted" diff; PII redaction in logs.
- **Acceptance:** fill success is measured per ATS; map drift is detectable; the
  user can always preview the final submission.
- **Commit:** `feat(apply): autonomy telemetry and reliability hardening`

---

## 5. Cross-cutting data & API summary (end state)

**New tables:** `answer_vault`, `apply_runs`, `apply_run_events` (hash-chained),
`autonomy_policies`, `apply_queue` (durable/idempotent), plus the shared-tech
tables `vectors` (content-hash → embedding, P1) and `field_maps` +
`fill_telemetry` (versioned maps + self-healing, P3) — on top of Phase 2/4 tables
(`application_documents`, `application_tasks`, `contacts`, document variants).

**New orchestrator tasks (all with fallbacks, per the AI contract):**
`resolveFields` (6.1) joins the existing `coverLetter`, `answerQuestion`
(1.5), `scoreJobs`, `positioning`, `planQueries` (3), and the planned
`applyPlan` (2.3), `coachApplication`, `interviewPrep`, `tailorResume` (4).

**New API surface (Phase 6):** `GET/PUT /api/vault`,
`GET /api/vault/completeness`, `POST /api/apply/resolve`,
`POST /api/apply/plan`, `GET /api/apply/runs[/:id]`,
`POST /api/apply/runs/:id/events`, `GET/PUT /api/apply/policies`,
`POST /api/apply/queue`, `GET /api/apply/queue`.

---

## 6. End-state user journey (what "done" feels like)

1. **Onboard once:** import a resume, fill the personal section; the readiness
   meter (6.0) drives you to complete the handful of missing common fields.
2. **Discover:** the Recommended feed (Phase 3) surfaces high-fit roles.
3. **Auto-prepare:** "Auto-prepare top matches" (6.5) tailors a resume variant
   (4.3) and cover letter (1.5), resolves the application fields (6.1), and
   stages a plan (6.2) per job — flagging anything it shouldn't guess.
4. **Review:** you see a queue of ready applications; fix any flagged gaps once
   (which feed back into the vault), then bulk-approve (6.4).
5. **Apply:** on each job's page the extension autopilot (6.3) fills every field
   and attaches the right docs; you click submit (L2) or it submits where you've
   allowed it (L3, eligible sites only).
6. **Track & follow up:** each run lands in the tracker with a full audit log;
   coaching (4.1) schedules follow-ups; interview prep (4.2) and contacts/.ics
   (4.5) handle the rest of the funnel.

That is the realized promise: **enter your info once; the AI tailors, fills, and
applies — with you in control of the final click.**

---

## 7. Risks & honest limits
1. **ToS / anti-bot.** Full hands-off submit on LinkedIn/Indeed/major ATS is off
   the table; the denylist (6.4) enforces this. Coverage of true L3 depends on
   direct employer/ATS pages.
2. **ATS layout drift.** Field maps break when sites change; 6.6 telemetry +
   regression fixtures mitigate, but maintenance is ongoing.
3. **File attachment limits.** Browsers restrict programmatic file-input setting;
   where blocked, the engine stages the correct document and prompts the user to
   attach (still one click).
4. **Hallucination risk.** Mitigated by the never-fabricate rule for factual
   categories (6.1) and the review gate (6.4); essays are clearly AI drafts the
   user can edit.
5. **Scope of "autonomous".** Local autonomy runs through the user's browser
   (human present). Headless/cloud autonomy needs Phase 5 and is opt-in,
   site-eligible only.
6. **Compliance & honesty.** Generated answers must be truthful; the system
   assists the user's own truthful application — it does not impersonate or
   deceive employers.
7. **New-tech limits (kept honest).** Local embeddings (P1) add a ~25 MB model
   download + cold-start and are a capability flag, not a hard dependency —
   every consumer keeps its heuristic fallback. AX-tree targeting (P2) cannot
   reach **closed** shadow roots. At-rest encryption (P6) protects the data file,
   not a running process with the key loaded. None of these block the product;
   they bound it.

---

## 8. Technology choices & rationale

Concrete picks, why they win here, and the fallback if they're unavailable.

| Pillar | Technology | Why this one | Fallback |
|--------|-----------|--------------|----------|
| P1 semantic layer | **Transformers.js** (`all-MiniLM-L6-v2`) + **`sqlite-vec`** | In-process, key-free, private; one model serves fit/dedupe/resolve/reuse; vectors live in the existing SQLite file | Keyword/synonym heuristics (today's code) |
| P2 targeting | Browser **Accessibility API** (ARIA role + accessible name) + `MutationObserver` | Resilient to class/DOM churn; accessibility-correct; how Playwright locates | Per-ATS CSS field maps |
| P3 self-healing | **DB-stored versioned field maps** + fill telemetry | Update maps without an extension release; data-driven drift detection | Static maps shipped in the extension |
| P4 audit | **Event sourcing** + **SHA-256 hash chain** | One source of truth for state+audit; tamper-evident "what the bot did" | Plain event rows (no chain) |
| P5 queue | **SQLite durable queue** + idempotency keys | No external broker; local-first; provably no double-applies | Synchronous one-at-a-time apply |
| P6 privacy | **OS keychain / `scrypt`** at-rest encryption + redaction layer | Identity data never trusts a cloud; differentiator vs. SaaS autofill | Plaintext local SQLite (current) |
| P7 orchestration | Anthropic **prompt caching** + **tool-use JSON** + repair loop | Cuts cost/latency on the reused context; forces valid structured output | Existing template/heuristic fallbacks |
| Testing | **`fast-check`** property tests for safety invariants; **golden ATS DOM fixtures** | Proves the denylist/never-fabricate guarantees over generated inputs | Example-based unit tests |

**Adoption order (incremental, each shippable alone):** P7 prompt-caching is a
quick orchestrator win usable now; **P1 lands first in Phase 3's fit scoring**
(retro-upgrade) and is then required by 6.1; **P2/P3 ship with Phase 2's
extension**; **P4/P5** are the spine of Phase 6.2/6.5; **P6** guards 6.0.

---

## 9. Sequencing summary
```
done:   1.5 ✅  →  correctness ✅  →  3 (discovery) ✅
next:   2 (apply substrate: 2.1, 2.2, 2.4 field maps)
then:   4.3 (resume variants)  [+ 4.1 coaching in parallel]
then:   6 (autonomy: 6.0 → 6.1 → 6.2 → 6.3 → 6.4 → 6.5 → 6.6)
opt:    5 (scale/auth) only for cloud/multi-device; pull 5.0 seam early if cloud autonomy desired
later:  remainder of 4 (4.2, 4.4, 4.5) — parallelizable, off the critical path
```

Each Phase 6 unit is one PR, follows the [shared conventions](./README.md), ships
with tests + a deterministic fallback, and never adds a direct Anthropic call
outside the orchestrator or a schema change outside a migration.

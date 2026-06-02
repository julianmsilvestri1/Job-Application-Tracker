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

**New tables:** `answer_vault`, `apply_runs`, `apply_run_events`,
`autonomy_policies` (Phase 6) on top of Phase 2/4 tables
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

---

## 8. Sequencing summary
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

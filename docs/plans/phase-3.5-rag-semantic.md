# Phase 3.5 — Local Semantic Retrieval (RAG)

**Goal:** stop stuffing the entire profile into every prompt. Embed the
knowledge base once, and at generation time retrieve only the 3–5 most
semantically relevant chunks. This is the concrete realization of **pillar P1**
(unified local semantic layer) from the
[master plan](./master-plan-autonomous-apply.md).

**Why now / why first:** it improves *every* AI interaction immediately (cover
letters, answers, and the Phase 6 field resolver), keeps token cost flat as your
answer history grows, and makes the Phase 6 apply engine materially better by
feeding it high-precision evidence instead of generic context. It is also the
highest-leverage, lowest-cost addition given the existing SQLite + orchestrator.

**Local-first & key-free:** embeddings run in-process via Transformers.js — no
API key, no network at query time, the résumé never leaves the machine. Every
unit **degrades gracefully**: if the model can't load, retrieval returns nothing
and the orchestrator falls back to today's full-context behavior.

**Packages:** **none by default.** The default embedder is dependency-free
(feature hashing) — chosen after `@xenova/transformers` was found to pull a
**critical `protobufjs` RCE** (via `onnxruntime-web`) and a native
`onnxruntime-node` that our `omit=optional` policy skips. A neural provider
(MiniLM via Transformers.js, `Xenova/all-MiniLM-L6-v2`) is an **opt-in upgrade**
the user installs explicitly, documented with that security caveat. `sqlite-vec`
remains an optional scale upgrade; the default path needs no native extension.

**Units:** 3.5.0 ✅ → 3.5.1 → 3.5.2 → 3.5.3 → 3.5.4

---

## Unit 3.5.0 — Embedding service + vector store ✅
- **Objective:** one in-process embedder + a place to keep vectors, with a
  pure-JS similarity search that needs no native extension, no model download,
  and **zero added vulnerabilities**.
- **Depends on:** 1.5.0 (migrations).
- **Built:** `services/ai/embeddings.js` — default **dependency-free** embedder
  (signed feature hashing + sublinear TF, L2-normalized, 512-d); pure
  `cosineSimilarity`/`topK`/`toBlob`/`fromBlob`; `setEmbedder()` to plug in a
  neural provider or a test fake; `available()` always true (no model needed).
  Migration 6 adds the `embeddings` table. 6 unit tests (norm, cosine ordering,
  topK + weight, blob round-trip, DI swap) — no model, no network.
- **Schema (migration 6, as built):**
  ```sql
  CREATE TABLE embeddings (
    id           integer primary key autoincrement,
    source_type  text not null,     -- experience|education|skill|answer|custom|resume_chunk
    source_id    integer,           -- row id in the source table (nullable for resume chunks)
    content_hash text not null,     -- sha256(text) — embed each unique string once
    text_chunk   text not null,
    dim          integer not null,
    embedding    blob not null,     -- Float32Array bytes
    weight       real default 1.0,  -- retrieval boost (user-authored answers > AI drafts)
    updated_at   text default (datetime('now')),
    unique(source_type, source_id, content_hash)
  );
  ```
- **Backend:** `services/ai/embeddings.js`:
  - `embed(text) → Float32Array` — lazy-loads the model as a singleton; caches by
    `content_hash`; returns `null` if the model is unavailable (degrade signal).
  - `cosineSimilarity(a, b)`, `topK(queryVec, rows, k)` — **pure functions**
    (brute-force cosine; ample for a personal-scale corpus of hundreds–thousands
    of chunks). These are the unit-tested core.
  - `available()` — whether embeddings are usable (model loaded / flag on).
  - The embedder is **dependency-injectable** so tests pass a deterministic fake
    and never download the model.
  - **Scale option:** behind `EMBEDDINGS_BACKEND=sqlite-vec`, store/query via a
    `vec0` virtual table instead of JS brute force. Default `js` needs no native
    load and is fully portable.
- **Tests:** cosine identity = 1 and orthogonal = 0; `topK` ordering with
  synthetic vectors; `embed` caches by hash (fake embedder); `available()` false
  → callers degrade.
- **Acceptance:** given vectors in the table, `topK` returns the nearest chunks;
  nothing requires an API key or a native extension on the default path.
- **Commit:** `feat(ai): local embedding service + vector store (pure-JS cosine)`

---

## Unit 3.5.1 — Index the knowledge base
- **Objective:** keep `embeddings` in sync with the profile, answers, and résumé.
- **Depends on:** 3.5.0.
- **Backend:** `services/ai/indexer.js`:
  - On save of experience / education / skill / custom field / `application_answer`,
    enqueue an embedding upsert (reuse the `setImmediate` queue pattern from
    document extraction). Résumé text is chunked into ~512-char windows
    (`source_type='resume_chunk'`).
  - `reindexAll()` + a boot `backfillEmbeddings()` (mirrors
    `backfillPendingExtractions`) so existing data and upgrades are covered.
  - Deletes cascade (remove embeddings when the source row is deleted).
- **Frontend:** Profile "Application readiness" (6.0) can show an "AI memory:
  N items indexed" line; no other UI required.
- **Tests:** upsert dedupes by `content_hash`; deleting a source removes its
  embeddings; backfill indexes unindexed rows (fake embedder).
- **Acceptance:** saving an answer or experience makes it retrievable within the
  same session; a fresh DB backfills on boot.
- **Commit:** `feat(ai): index profile/answers/resume into the vector store`

---

## Unit 3.5.2 — Retrieval-augmented context in the orchestrator
- **Objective:** swap full-profile context stuffing for retrieved evidence.
- **Depends on:** 3.5.1, 1.5.2 (orchestrator).
- **Backend:** extend `buildCandidateContext` with a retrieval mode:
  `buildCandidateContext({ query, k = 5 })` embeds `query` (the job description or
  the specific question), runs `topK` over `embeddings`, and assembles a compact
  context = **always-on identity core** (name, contact, links, top skills) **+**
  the K retrieved chunks (highest `weight` first). Caps at a small token budget
  (~600 vs ~4000 for full profile). `coverLetter`, `answerQuestion`, and
  `resolveFields` (6.1) pass their query through. **Fallback:** when
  `embeddings.available()` is false, return today's full context.
- **Prompt:** unchanged contracts; only the candidate-context block shrinks and
  sharpens.
- **Tests:** with seeded embeddings + fake embedder, the relevant chunk is
  retrieved and present in the prompt; an irrelevant chunk is excluded; with
  embeddings unavailable, full context is used (no regression).
- **Acceptance:** a cover letter for a React role references the React bullet,
  not the unrelated history; measured prompt size drops substantially.
- **Commit:** `feat(ai): retrieval-augmented candidate context (RAG)`

---

## Unit 3.5.3 — Semantic fit & dedupe (retrofit Phase 3 + search)
- **Objective:** reuse the embedder to upgrade discovery quality.
- **Depends on:** 3.5.0; Phase 3.1 (fit scoring), search aggregator.
- **Backend:**
  - **Fit (3.1):** blend `cosine(résumé⃗, JD⃗)` into the heuristic/AI fit score
    (semantic, not keyword overlap); cache JD embeddings by `job_key`.
  - **Dedupe:** optional semantic near-duplicate pass after the existing URL/id
    key (catches reworded repostings across boards), behind a similarity
    threshold.
- **Tests:** blended score ranks a semantically-matched JD above a keyword-only
  match; near-dup pass collapses two reworded postings; both no-op cleanly when
  embeddings are unavailable.
- **Acceptance:** fit ranking improves on paraphrased descriptions; obvious
  cross-board near-dups merge.
- **Commit:** `feat(discovery): semantic fit blend + near-duplicate detection`

---

## Unit 3.5.4 — Answer memory & reinforcement
- **Objective:** make generations drift toward *your* voice by learning from your
  edits. **Not** model fine-tuning — few-shot reinforcement via retrieval.
- **Depends on:** 3.5.1, 1.5.3 (persisted answers).
- **Schema (migration):**
  ```sql
  CREATE TABLE answer_edits (
    id          integer primary key autoincrement,
    question    text not null,
    job_context text default '',
    ai_draft    text default '',
    final_text  text not null,
    created_at  text default (datetime('now'))
  );
  ```
- **Backend:** when a saved answer's `source='ai'` and the final text differs
  from the draft, log the pair. Index `final_text` as a **high-`weight`**
  `answer` embedding so retrieval (3.5.2) prefers your edited finals over generic
  drafts. Optionally surface the closest 1–2 past finals as few-shot exemplars in
  the answer prompt ("match this candidate's voice").
- **Frontend:** none required (capture is automatic on edit-then-save); optional
  "Voice memory" count on Profile.
- **Tests:** an edited answer is logged and indexed with `weight>1`; retrieval
  ranks the edited final above an AI draft for a similar question.
- **Acceptance:** after a few edits, drafts for similar questions echo the
  user's phrasing/framing measurably more than the cold-start template.
- **Commit:** `feat(ai): answer memory — reinforce voice from user edits`

---

## Phase exit criteria
- [ ] Prompts use retrieved evidence (~600 tokens) instead of the full profile,
      with a clean full-context fallback when embeddings are unavailable.
- [ ] Profile/answers/résumé are indexed on save + backfilled on boot.
- [ ] Fit scoring blends a semantic signal; near-dups optionally merge.
- [ ] Edited answers are remembered and reinforce future generations.
- [ ] Everything works **key-free** and **offline**; pure similarity functions
      are unit-tested without downloading the model.

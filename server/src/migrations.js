// Versioned SQLite migrations.
//
// `runMigrations` applies any migrations whose index is >= the database's
// current PRAGMA user_version, bumping the version as it goes. Rules:
//   - migrations are APPEND-ONLY: never edit or reorder a shipped migration.
//   - migration at index i moves user_version from i to i+1.
//   - keep them idempotent where practical (IF NOT EXISTS / guarded ALTERs).

// Adds a column only if it isn't already present (makes ALTERs idempotent).
function addColumn(db, table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export const migrations = [
  // --- Migration 1: baseline schema (idempotent on existing databases) -----
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS profile (
        id              INTEGER PRIMARY KEY CHECK (id = 1),
        full_name       TEXT DEFAULT '',
        email           TEXT DEFAULT '',
        phone           TEXT DEFAULT '',
        location        TEXT DEFAULT '',
        headline        TEXT DEFAULT '',
        summary         TEXT DEFAULT '',
        linkedin        TEXT DEFAULT '',
        github          TEXT DEFAULT '',
        website         TEXT DEFAULT '',
        work_authorization TEXT DEFAULT '',
        needs_sponsorship  INTEGER DEFAULT 0,
        years_experience   TEXT DEFAULT '',
        desired_salary     TEXT DEFAULT '',
        skills          TEXT DEFAULT '[]',
        custom_fields   TEXT DEFAULT '{}',
        updated_at      TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS experiences (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        company     TEXT DEFAULT '',
        title       TEXT DEFAULT '',
        location    TEXT DEFAULT '',
        start_date  TEXT DEFAULT '',
        end_date    TEXT DEFAULT '',
        is_current  INTEGER DEFAULT 0,
        description TEXT DEFAULT '',
        sort_order  INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS education (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        school      TEXT DEFAULT '',
        degree      TEXT DEFAULT '',
        field       TEXT DEFAULT '',
        start_date  TEXT DEFAULT '',
        end_date    TEXT DEFAULT '',
        gpa         TEXT DEFAULT '',
        sort_order  INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS documents (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        type          TEXT DEFAULT 'resume',  -- resume | cover_letter | other
        label         TEXT DEFAULT '',
        original_name TEXT NOT NULL,
        stored_name   TEXT NOT NULL,
        mimetype      TEXT DEFAULT '',
        size          INTEGER DEFAULT 0,
        is_default    INTEGER DEFAULT 0,
        created_at    TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS applications (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        external_id   TEXT,
        source        TEXT DEFAULT '',  -- adzuna|jooble|usajobs|remotive|themuse|remoteok|arbeitnow|jobicy|manual
        title         TEXT DEFAULT '',
        company       TEXT DEFAULT '',
        location      TEXT DEFAULT '',
        url           TEXT DEFAULT '',
        salary        TEXT DEFAULT '',
        description   TEXT DEFAULT '',
        remote        INTEGER DEFAULT 0,
        status        TEXT DEFAULT 'saved',  -- saved|applied|interviewing|offer|rejected|archived
        notes         TEXT DEFAULT '',
        cover_letter  TEXT DEFAULT '',
        applied_at    TEXT,
        created_at    TEXT DEFAULT (datetime('now')),
        updated_at    TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_ext
        ON applications(source, external_id) WHERE external_id IS NOT NULL;
    `);
  },

  // --- Migration 2: document text extraction (Unit 1.5.1) ------------------
  (db) => {
    addColumn(db, 'documents', 'extracted_text', "TEXT DEFAULT ''");
    addColumn(db, 'documents', 'extraction_status', "TEXT DEFAULT 'pending'"); // pending|done|failed|unsupported
    addColumn(db, 'documents', 'extraction_error', "TEXT DEFAULT ''");
    addColumn(db, 'documents', 'text_chars', 'INTEGER DEFAULT 0');
  },

  // --- Migration 3: persisted application Q&A (Unit 1.5.3) -----------------
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS application_answers (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        application_id INTEGER,
        job_title      TEXT DEFAULT '',
        company        TEXT DEFAULT '',
        question       TEXT NOT NULL,
        answer         TEXT DEFAULT '',
        source         TEXT DEFAULT 'ai',  -- ai | template | manual
        created_at     TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_answers_app ON application_answers(application_id);
    `);
  },

  // --- Migration 4: AI job-fit score cache (Unit 3.1) ----------------------
  // Scoring is the priciest AI call, so results are cached by the posting and a
  // hash of the candidate context: changing the profile invalidates old scores.
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS job_scores (
        job_key      TEXT NOT NULL,       -- source:externalId
        profile_hash TEXT NOT NULL,       -- hash of the candidate context
        score        INTEGER DEFAULT 0,   -- 0..100
        reasons      TEXT DEFAULT '[]',   -- JSON array of strings
        gaps         TEXT DEFAULT '[]',   -- JSON array of strings
        method       TEXT DEFAULT 'ai',   -- ai | heuristic
        created_at   TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (job_key, profile_hash)
      );
    `);
  },

  // --- Migration 5: search preferences (Unit 3.2) --------------------------
  // Single-row table (id = 1) that drives the "Recommended for you" feed.
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS search_preferences (
        id          INTEGER PRIMARY KEY CHECK (id = 1),
        titles      TEXT DEFAULT '[]',    -- JSON array
        locations   TEXT DEFAULT '[]',    -- JSON array
        keywords    TEXT DEFAULT '[]',    -- JSON array
        remote_only INTEGER DEFAULT 0,
        min_salary  TEXT DEFAULT '',
        sources     TEXT DEFAULT '[]',    -- empty = all
        updated_at  TEXT DEFAULT (datetime('now'))
      );
      INSERT OR IGNORE INTO search_preferences (id) VALUES (1);
    `);
  },

  // --- Migration 6: embeddings / vector store (Unit 3.5.0) -----------------
  // Local semantic retrieval (RAG). Vectors are stored as Float32 blobs and
  // searched with brute-force cosine in JS (ample at personal scale). The
  // embedder is pluggable (dependency-free hashing by default; optional neural).
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS embeddings (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        source_type  TEXT NOT NULL,       -- experience|education|skill|answer|custom|resume_chunk
        source_id    INTEGER,             -- row id in the source table (nullable for resume chunks)
        content_hash TEXT NOT NULL,       -- sha256(text) — embed each unique string once
        text_chunk   TEXT NOT NULL,
        dim          INTEGER NOT NULL,
        embedding    BLOB NOT NULL,       -- Float32Array bytes
        weight       REAL DEFAULT 1.0,    -- retrieval boost (user-authored > AI draft)
        provider     TEXT DEFAULT 'hash', -- which embedder produced this vector
        updated_at   TEXT DEFAULT (datetime('now')),
        UNIQUE(source_type, source_id, content_hash)
      );
      CREATE INDEX IF NOT EXISTS idx_embeddings_source ON embeddings(source_type, source_id);
    `);
  },

  // --- Migration 7: answer memory / reinforcement (Unit 3.5.4) -------------
  // Logs when the user edits an AI-drafted answer before saving, and flags the
  // saved answer as edited so retrieval weights the user's own voice higher.
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS answer_edits (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        question    TEXT DEFAULT '',
        job_context TEXT DEFAULT '',
        ai_draft    TEXT DEFAULT '',
        final_text  TEXT NOT NULL,
        created_at  TEXT DEFAULT (datetime('now'))
      );
    `);
    addColumn(db, 'application_answers', 'edited', 'INTEGER DEFAULT 0');
  },

  // --- Migration 8: link documents to applications (Unit 2.1) --------------
  // Records exactly which resume / cover letter / portfolio variant belongs to
  // each application, so "what did I send?" is answerable and RAG can scope to
  // the attached narrative.
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS application_documents (
        application_id INTEGER NOT NULL,
        document_id    INTEGER NOT NULL,
        role           TEXT DEFAULT 'resume',   -- resume | cover_letter | portfolio | references | transcript | other
        variant_tag    TEXT DEFAULT '',         -- e.g. quant | underwriting | pe | ib | european-format
        label          TEXT DEFAULT '',         -- human label, e.g. "Resume — analytics (Python/R/Stata)"
        attached_at    TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (application_id, document_id, role),
        FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_app_docs_document ON application_documents(document_id);
    `);
  },

  // --- Migration 9: per-application apply checklist (Unit 2.2) --------------
  // Makes every application actionable with seeded tasks, deadlines, and
  // visible progress.
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS application_tasks (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        application_id INTEGER NOT NULL,
        label          TEXT NOT NULL,
        done           INTEGER DEFAULT 0,
        due_date       TEXT,
        category       TEXT DEFAULT 'apply',      -- apply | document | form | follow_up | interview | networking | custom
        source         TEXT DEFAULT 'template',   -- template | ai | manual | extension
        sort_order     INTEGER DEFAULT 0,
        created_at     TEXT DEFAULT (datetime('now')),
        updated_at     TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_app_tasks_application ON application_tasks(application_id);
    `);
  },

  // --- Migration 10: AI apply plan (Unit 2.3) ------------------------------
  // Caches the generated plan (required materials, suggested tasks, likely
  // questions, warnings) per application. One row per application.
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS apply_plans (
        application_id   INTEGER PRIMARY KEY,
        source           TEXT DEFAULT 'template',  -- ai | template
        requirements     TEXT DEFAULT '[]',        -- JSON array of strings
        suggested_tasks  TEXT DEFAULT '[]',        -- JSON array of { label, category }
        likely_questions TEXT DEFAULT '[]',        -- JSON array of strings
        warnings         TEXT DEFAULT '[]',        -- JSON array of strings
        created_at       TEXT DEFAULT (datetime('now')),
        updated_at       TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
      );
    `);
  },

  // --- Migration 11: ATS field-resolution semantic cache (Unit 2.4) --------
  // The Stagehand apply runner's memory: what the resolver learned for a given
  // (host, field, type, options) so repeat fills on the same ATS host are
  // faster/cheaper/consistent. Semantic — NOT brittle CSS-selector field maps.
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ats_field_mappings (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        host         TEXT NOT NULL,
        field_label  TEXT NOT NULL,
        field_type   TEXT DEFAULT 'text',
        options_hash TEXT DEFAULT '',
        vault_key    TEXT DEFAULT '',     -- which candidate field/source answered it
        answer       TEXT DEFAULT '',
        strategy     TEXT DEFAULT '',      -- cache | packet | answer | rag | plan
        confidence   REAL DEFAULT 0,
        updated_at   TEXT DEFAULT (datetime('now')),
        UNIQUE (host, field_label, field_type, options_hash)
      );
      CREATE INDEX IF NOT EXISTS idx_ats_host ON ats_field_mappings(host);
    `);
  },

  // --- Migration 12: apply session events (Unit 2.7) -----------------------
  // Auditable timeline of apply work (created/packet_opened/autofill_run/
  // task_done/submitted/note). Never stores external form field values.
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS application_events (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        application_id INTEGER,
        kind           TEXT NOT NULL,            -- created | packet_opened | autofill_run | task_done | submitted | note
        source         TEXT DEFAULT 'portal',    -- portal | extension | system
        summary        TEXT DEFAULT '',
        metadata       TEXT DEFAULT '{}',        -- JSON; counts/hostname only, never field values
        created_at     TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_app_events_application ON application_events(application_id);
    `);
  },

  // --- Migration 13: human-review flag for auto-apply (Unit 2.7+) ----------
  // When the autonomous apply runner can't fully complete OR can't verify its
  // own fills, it leaves the application flagged for human review instead of
  // submitting a wrong/partial form.
  (db) => {
    addColumn(db, 'applications', 'needs_review', 'INTEGER DEFAULT 0');
    addColumn(db, 'applications', 'review_summary', "TEXT DEFAULT ''");
  },

  // --- Migration 14: apply safety settings (Unit 2.8) ----------------------
  // Single-row policy controlling autonomous behaviour. Safe by default:
  // auto_submit OFF (assistant fills + verifies, the human submits) and
  // fill_existing OFF (never overwrite values already on the form).
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS apply_settings (
        id                    INTEGER PRIMARY KEY CHECK (id = 1),
        auto_submit           INTEGER DEFAULT 0,
        fill_existing         INTEGER DEFAULT 0,
        include_custom_fields INTEGER DEFAULT 1,
        updated_at            TEXT DEFAULT (datetime('now'))
      );
      INSERT OR IGNORE INTO apply_settings (id) VALUES (1);
    `);
  },

  // --- Migration 15: drop redundant index (review 4.1) ---------------------
  // The UNIQUE(host, field_label, field_type, options_hash) index on
  // ats_field_mappings already serves host-prefix lookups, so idx_ats_host is
  // redundant write/space overhead. (Cannot edit migration 11 in place.)
  (db) => {
    db.exec('DROP INDEX IF EXISTS idx_ats_host;');
  },
];

export function runMigrations(db) {
  const current = db.pragma('user_version', { simple: true });
  for (let v = current; v < migrations.length; v++) {
    db.transaction(() => {
      migrations[v](db);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
  return migrations.length;
}

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

  // --- Migration 4: personalized discovery (Phase 3) -----------------------
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS job_scores (
        job_key      TEXT NOT NULL,
        profile_hash TEXT NOT NULL,
        score        INTEGER,
        reasons      TEXT,
        gaps         TEXT,
        created_at   TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (job_key, profile_hash)
      );

      CREATE TABLE IF NOT EXISTS search_preferences (
        id          INTEGER PRIMARY KEY CHECK (id = 1),
        titles      TEXT DEFAULT '[]',
        locations   TEXT DEFAULT '[]',
        keywords    TEXT DEFAULT '[]',
        remote_only INTEGER DEFAULT 0,
        min_salary  TEXT DEFAULT '',
        sources     TEXT DEFAULT '[]',
        updated_at  TEXT DEFAULT (datetime('now'))
      );

      INSERT OR IGNORE INTO search_preferences (id) VALUES (1);
    `);
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

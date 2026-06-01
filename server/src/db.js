import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'app.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// --- Schema ---------------------------------------------------------------
// Single-user, local-first app: the profile is a single row (id = 1).
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
    skills          TEXT DEFAULT '[]',   -- JSON array of strings
    custom_fields   TEXT DEFAULT '{}',   -- JSON object for arbitrary answers
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
    external_id   TEXT,                    -- provider id, used to dedupe
    source        TEXT DEFAULT '',         -- adzuna | jooble | remotive | manual
    title         TEXT DEFAULT '',
    company       TEXT DEFAULT '',
    location      TEXT DEFAULT '',
    url           TEXT DEFAULT '',
    salary        TEXT DEFAULT '',
    description   TEXT DEFAULT '',
    remote        INTEGER DEFAULT 0,
    status        TEXT DEFAULT 'saved',    -- saved|applied|interviewing|offer|rejected|archived
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

// Ensure the single profile row exists.
db.prepare('INSERT OR IGNORE INTO profile (id) VALUES (1)').run();

export default db;

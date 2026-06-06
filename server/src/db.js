import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMigrations } from './migrations.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'app.db'));
db.pragma('journal_mode = WAL');
// Wait for the write lock instead of failing with SQLITE_BUSY. WAL allows only
// one writer at a time, so concurrent writers (parallel `node --test` processes
// running migrations at import, or concurrent requests in prod) would otherwise
// error immediately. Migrations are idempotent, so serialized runs are safe.
db.pragma('busy_timeout = 5000');
db.pragma('foreign_keys = ON');

// Schema lives in versioned migrations (see migrations.js).
runMigrations(db);

// Ensure the single profile row exists.
db.prepare('INSERT OR IGNORE INTO profile (id) VALUES (1)').run();

export default db;

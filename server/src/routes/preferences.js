import { Router } from 'express';
import db from '../db.js';

const router = Router();

const ARRAY_FIELDS = ['titles', 'locations', 'keywords', 'sources'];

function parseJson(s, fallback) {
  try { const v = JSON.parse(s); return v ?? fallback; } catch { return fallback; }
}

// The single preferences row (id = 1), with JSON columns parsed into arrays.
export function getPreferences() {
  db.prepare('INSERT OR IGNORE INTO search_preferences (id) VALUES (1)').run();
  const row = db.prepare('SELECT * FROM search_preferences WHERE id = 1').get();
  for (const f of ARRAY_FIELDS) row[f] = parseJson(row[f], []);
  row.remote_only = Boolean(row.remote_only);
  return row;
}

// Build de-duplicated search queries from saved preferences. Each title (and
// each free-form keyword) becomes a query; locations/remote ride along.
export function preferencesToQueries(prefs = {}) {
  const titles = Array.isArray(prefs.titles) ? prefs.titles : [];
  const keywords = Array.isArray(prefs.keywords) ? prefs.keywords : [];
  const locations = Array.isArray(prefs.locations) ? prefs.locations : [];
  const primaryLocation = locations[0] || '';

  const terms = [...titles, ...keywords].map((t) => String(t).trim()).filter(Boolean);
  const seen = new Set();
  const queries = [];
  for (const term of terms) {
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    queries.push({ query: term, location: primaryLocation || undefined, remote: Boolean(prefs.remote_only) });
  }
  return queries;
}

router.get('/', (req, res) => {
  res.json(getPreferences());
});

router.put('/', (req, res) => {
  const b = req.body || {};
  const updates = {};
  for (const f of ARRAY_FIELDS) {
    if (f in b) updates[f] = JSON.stringify(Array.isArray(b[f]) ? b[f] : []);
  }
  if ('remote_only' in b) updates.remote_only = b.remote_only ? 1 : 0;
  if ('min_salary' in b) updates.min_salary = String(b.min_salary || '');

  db.prepare('INSERT OR IGNORE INTO search_preferences (id) VALUES (1)').run();
  if (Object.keys(updates).length) {
    const set = Object.keys(updates).map((k) => `${k} = @${k}`).join(', ');
    db.prepare(`UPDATE search_preferences SET ${set}, updated_at = datetime('now') WHERE id = 1`).run(updates);
  }
  res.json(getPreferences());
});

export default router;

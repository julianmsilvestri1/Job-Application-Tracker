import { Router } from 'express';
import defaultDb from '../db.js';

function trimOrNull(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

function trimRequired(value, fieldName) {
  const s = value == null ? '' : String(value).trim();
  if (!s) throw new Error(`${fieldName} is required.`);
  return s;
}

export function normalizeDomain(raw) {
  const s = trimRequired(raw, 'domain');
  let host = s;
  try {
    if (/^https?:\/\//i.test(s)) host = new URL(s).hostname;
  } catch { /* fall through */ }
  return host.replace(/^www\./i, '').toLowerCase();
}

export function rowToJson(row) {
  if (!row) return null;
  return {
    id: row.id,
    domain: row.domain,
    field_selector: row.field_selector,
    field_label: row.field_label ?? null,
    mapped_profile_key: row.mapped_profile_key,
    normalized_intent: row.normalized_intent ?? null,
  };
}

export function createExtensionMappingsRouter(db = defaultDb) {
  const router = Router();

  const selectAll = db.prepare(`
    SELECT id, domain, field_selector, field_label, mapped_profile_key, normalized_intent
    FROM ats_field_mappings
    ORDER BY domain, field_selector
  `);

  const selectByDomain = db.prepare(`
    SELECT id, domain, field_selector, field_label, mapped_profile_key, normalized_intent
    FROM ats_field_mappings
    WHERE domain = ?
    ORDER BY field_selector
  `);

  const upsert = db.prepare(`
    INSERT INTO ats_field_mappings (domain, field_selector, field_label, mapped_profile_key, normalized_intent)
    VALUES (@domain, @field_selector, @field_label, @mapped_profile_key, @normalized_intent)
    ON CONFLICT(domain, field_selector) DO UPDATE SET
      field_label = excluded.field_label,
      mapped_profile_key = excluded.mapped_profile_key,
      normalized_intent = excluded.normalized_intent
  `);

  const selectOne = db.prepare(`
    SELECT id, domain, field_selector, field_label, mapped_profile_key, normalized_intent
    FROM ats_field_mappings
    WHERE domain = ? AND field_selector = ?
  `);

  router.get('/', (req, res) => {
    const domainRaw = trimOrNull(req.query.domain);
    try {
      const rows = domainRaw
        ? selectByDomain.all(normalizeDomain(domainRaw))
        : selectAll.all();
      res.json({ mappings: rows.map(rowToJson) });
    } catch (err) {
      res.status(400).json({ error: err.message || 'Invalid request' });
    }
  });

  router.post('/', (req, res) => {
    const b = req.body || {};
    try {
      const domain = normalizeDomain(b.domain);
      const field_selector = trimRequired(b.field_selector, 'field_selector');
      const mapped_profile_key = trimRequired(b.mapped_profile_key, 'mapped_profile_key');

      upsert.run({
        domain,
        field_selector,
        field_label: trimOrNull(b.field_label),
        mapped_profile_key,
        normalized_intent: trimOrNull(b.normalized_intent),
      });

      res.status(200).json({ mapping: rowToJson(selectOne.get(domain, field_selector)) });
    } catch (err) {
      res.status(400).json({ error: err.message || 'Invalid request' });
    }
  });

  return router;
}

export default createExtensionMappingsRouter();

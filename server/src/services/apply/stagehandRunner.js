// Stagehand autonomous apply service (Unit 2.4).
//
// Connects to the user's active Chrome tab over CDP, extracts the live form,
// resolves each field from cache → packet → persisted answers → apply plan,
// fills via Stagehand, and (when policy allows) submits. The Stagehand client
// is dependency-injected so the whole pipeline is unit-testable with a mock;
// the real client is dynamically imported only when actually running.
import crypto from 'node:crypto';
import defaultDb from '../../db.js';
import { buildPacket, REDACTED_FIELDS } from './packet.js';

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 16);
const norm = (s) => String(s || '').toLowerCase().trim();

function hostOf(url) {
  try { return new URL(url).hostname; } catch { return String(url || '').slice(0, 120); }
}

function optionsHash(options) {
  return Array.isArray(options) && options.length ? sha(options.map(norm).join('|')) : '';
}

// A field whose label touches a redacted category must never be fabricated.
export function isRedacted(label) {
  const l = norm(label);
  return REDACTED_FIELDS.some((r) => l.includes(norm(r)));
}

// Pick the closest allowed <option> for a free value — never invents a value.
export function resolveSelectAnswer(value, options) {
  if (!Array.isArray(options) || options.length === 0) return value || null;
  const v = norm(value);
  if (!v) return null;
  const exact = options.find((o) => norm(o) === v);
  if (exact) return exact;
  const contains = options.find((o) => norm(o).includes(v) || v.includes(norm(o)));
  return contains || null;
}

function jaccard(a, b) {
  const sa = new Set(norm(a).split(/\W+/).filter(Boolean));
  const sb = new Set(norm(b).split(/\W+/).filter(Boolean));
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter += 1;
  return inter / (sa.size + sb.size - inter);
}

function cacheLookup(db, host, field) {
  const row = db.prepare(
    'SELECT * FROM ats_field_mappings WHERE host = ? AND field_label = ? AND field_type = ? AND options_hash = ?',
  ).get(host, field.label, field.type || 'text', optionsHash(field.options));
  return row ? { answer: row.answer, strategy: 'cache', vault_key: row.vault_key, confidence: row.confidence } : null;
}

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// A single-word alias must equal the whole field label; a multi-word alias may
// match as a whole phrase inside it. This avoids filling compound labels like
// "Company name" / "School name" from the generic "name" alias.
function aliasHits(target, alias) {
  if (!alias) return false;
  if (target === alias) return true;
  if (alias.includes(' ')) return new RegExp(`\\b${escapeRegex(alias)}\\b`).test(target);
  return false;
}

function packetLookup(field, packet) {
  const target = norm(field.label);
  let best = null;
  let bestLen = 0;
  for (const f of packet.candidate.fields) {
    for (const alias of [f.label, ...(f.aliases || [])].map(norm).filter(Boolean)) {
      // Prefer the most specific (longest) matching alias.
      if (aliasHits(target, alias) && alias.length > bestLen) { best = f; bestLen = alias.length; }
    }
  }
  return best ? { answer: best.value, strategy: 'packet', vault_key: best.label, confidence: 0.9 } : null;
}

function answerLookup(field, packet) {
  const target = norm(field.label);
  for (const a of packet.answers || []) {
    if (!a.answer) continue;
    const q = norm(a.question);
    if (q.includes(target) || target.includes(q) || jaccard(q, target) >= 0.6) {
      return { answer: a.answer, strategy: 'answer', vault_key: 'answer', confidence: 0.7 };
    }
  }
  return null;
}

// Resolve one extracted field to an answer (or null to skip). Redacted/EEO and
// factual fields with no vault data are never fabricated.
export function resolveField(field, { packet, host, db = defaultDb }) {
  if (isRedacted(field.label)) return null;
  const resolved = cacheLookup(db, host, field) || packetLookup(field, packet) || answerLookup(field, packet);
  if (!resolved || !resolved.answer) return null;

  // For selects/radios, only accept an answer that maps to an allowed option.
  if (Array.isArray(field.options) && field.options.length) {
    const opt = resolveSelectAnswer(resolved.answer, field.options);
    if (!opt) return null;
    return { ...resolved, answer: opt };
  }
  return resolved;
}

function learnMapping(db, host, field, resolved) {
  db.prepare(`
    INSERT INTO ats_field_mappings (host, field_label, field_type, options_hash, vault_key, answer, strategy, confidence, updated_at)
    VALUES (@host, @field_label, @field_type, @options_hash, @vault_key, @answer, @strategy, @confidence, datetime('now'))
    ON CONFLICT(host, field_label, field_type, options_hash) DO UPDATE SET
      vault_key = excluded.vault_key, answer = excluded.answer, strategy = excluded.strategy,
      confidence = excluded.confidence, updated_at = datetime('now')
  `).run({
    host,
    field_label: field.label,
    field_type: field.type || 'text',
    options_hash: optionsHash(field.options),
    vault_key: resolved.vault_key || '',
    answer: resolved.answer,
    strategy: resolved.strategy,
    confidence: resolved.confidence || 0,
  });
}

// Lazily construct the real Stagehand client; only loaded when actually running.
async function defaultStagehandFactory({ cdpUrl, url }) {
  let Stagehand;
  try {
    ({ Stagehand } = await import('@browserbasehq/stagehand'));
  } catch {
    throw new Error('@browserbasehq/stagehand is not installed. Install it in server/ to enable auto-apply.');
  }
  const sh = new Stagehand({ env: 'LOCAL', localBrowserLaunchOptions: { cdpUrl } });
  await sh.init();
  const page = sh.page;
  await page.goto(url);
  return {
    async extract() {
      const res = await page.extract({
        instruction: 'List every input on the application form as fields with label, type, options, required, currentValue.',
      });
      return res?.fields || [];
    },
    async act({ field, answer, submit }) {
      if (submit) return page.act('click the submit application button');
      return page.act(`set the "${field.label}" field to "${answer}"`);
    },
    async close() { await sh.close(); },
  };
}

// Full apply pipeline. Returns an audit summary; never returns or logs raw
// field values. `stagehandFactory` is injected in tests.
export async function runApply({ applicationId, url, db = defaultDb, stagehandFactory = defaultStagehandFactory }) {
  const application = db.prepare('SELECT * FROM applications WHERE id = ?').get(applicationId);
  if (!application) throw new Error('Application not found');

  const packet = buildPacket(db, application);
  const host = hostOf(url);
  const sh = await stagehandFactory({ cdpUrl: process.env.CHROME_CDP_URL || 'http://localhost:9222', url });

  try {
    const fields = (await sh.extract()) || [];
    let filledCount = 0;
    let skippedCount = 0;
    for (const field of fields) {
      const resolved = resolveField(field, { packet, host, db });
      if (!resolved) { skippedCount += 1; continue; }
      await sh.act({ field, answer: resolved.answer });
      if (resolved.strategy !== 'cache') learnMapping(db, host, field, resolved);
      filledCount += 1;
    }

    let submitted = false;
    if (packet.applyPolicy.canAutoSubmit && filledCount > 0) {
      await sh.act({ submit: true });
      submitted = true;
    }
    return { hostname: host, filledCount, skippedCount, submitted };
  } finally {
    if (sh && typeof sh.close === 'function') await sh.close();
  }
}

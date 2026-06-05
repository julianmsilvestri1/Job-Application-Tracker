// Stagehand autonomous apply service (Units 2.4 / 2.6 / 2.7).
//
// Connects to the user's active Chrome tab over CDP, extracts the live form,
// resolves each field from cache → packet → persisted answers (EEO/redacted and
// no-data fields are never fabricated), fills via Stagehand, then RE-READS the
// form to verify each fill. It auto-submits ONLY a complete + verified form;
// otherwise it returns a reviewReason so the caller flags the application for a
// human. Successful, verified resolutions are learned into the semantic cache.
// The Stagehand client is dependency-injected so the whole pipeline is
// unit-testable with a mock; the real client is dynamically imported only when
// actually running.
import crypto from 'node:crypto';
import defaultDb from '../../db.js';
import { buildPacket, REDACTED_MATCH } from './packet.js';

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 16);
const norm = (s) => String(s || '').toLowerCase().trim();

// Minimum resolver confidence required to auto-fill a field (others are skipped
// for the user to handle). packet=0.9, answer=0.75, cache=as-learned.
const MIN_CONFIDENCE = 0.6;

function hostOf(url) {
  try { return new URL(url).hostname; } catch { return String(url || '').slice(0, 120); }
}

// Options may be plain strings or { value, label } objects (as a real ATS
// <select>/combobox exposes). Fill by VALUE; match against value or label.
const optionValue = (o) => (typeof o === 'string' ? o : (o?.value ?? o?.label ?? ''));
const optionLabel = (o) => (typeof o === 'string' ? o : (o?.label ?? o?.value ?? ''));

function optionsHash(options) {
  if (!Array.isArray(options) || options.length === 0) return '';
  // Sorted so the hash is stable regardless of the order extract() returns options.
  return sha(options.map((o) => `${norm(optionLabel(o))}=${norm(optionValue(o))}`).sort().join('|'));
}

// A stable identity for matching a field across two extract() passes. Prefer
// name/id (stable) over label (can shift / duplicate on dynamic forms).
const fieldKey = (f) => norm(f?.name || f?.id || f?.label);

// A field whose label touches a redacted/EEO category must never be fabricated.
// Whole-word matching catches varied phrasing without false positives.
export function isRedacted(label) {
  const l = norm(label);
  return REDACTED_MATCH.some((r) => new RegExp(`\\b${escapeRegex(r)}\\b`).test(l));
}

// Pick the allowed option for a free value and return its VALUE — never invents
// one. Exact (value or label) wins; otherwise require a WHOLE-WORD overlap so
// short values like "No" don't get mapped to "Norway".
export function resolveSelectAnswer(value, options) {
  if (!Array.isArray(options) || options.length === 0) return value || null;
  const v = norm(value);
  if (!v) return null;
  const matchesExact = (o) => norm(optionLabel(o)) === v || norm(optionValue(o)) === v;
  const exact = options.find(matchesExact);
  if (exact) return optionValue(exact);

  const word = (hay, needle) => new RegExp(`\\b${escapeRegex(needle)}\\b`).test(hay);
  // value as a whole word inside an option label/value ("Citizen" → "U.S. Citizen")
  const inOption = options.find((o) => word(norm(optionLabel(o)), v) || word(norm(optionValue(o)), v));
  if (inOption) return optionValue(inOption);
  // an option label as a whole word inside the value
  const optInValue = options.find((o) => { const ol = norm(optionLabel(o)); return ol && word(v, ol); });
  return optInValue ? optionValue(optInValue) : null;
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
  if (target.length < 4) return null; // too generic to match a saved Q&A safely
  for (const a of packet.answers || []) {
    if (!a.answer) continue;
    const q = norm(a.question);
    // Require containment (not fuzzy overlap): autonomous fill should not place
    // a stored answer into a loosely-matched field.
    if (q.includes(target) || target.includes(q)) {
      return { answer: a.answer, strategy: 'answer', vault_key: 'answer', confidence: 0.75 };
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
      // NOTE: this real-Stagehand adapter is not exercisable in CI (needs a live
      // Chrome+CDP) — validate it against the installed Stagehand version before
      // production use. Labels/answers are JSON-quoted so quotes/newlines in the
      // value don't break the instruction string.
      if (submit) return page.act('click the submit application button');
      return page.act(`Set the ${JSON.stringify(field.label)} field to ${JSON.stringify(String(answer))}.`);
    },
    async close() { await sh.close(); },
  };
}

// Strict post-fill verification: confirm a field's read-back value is exactly
// what we intended (normalized). For selects, the read-back must point to the
// SAME option (by value or label) we chose. Any doubt → unverified.
function verifyFill(field, intended, after) {
  const a = norm(after);
  if (!a) return false;
  const want = norm(intended);
  if (a === want) return true;
  if (Array.isArray(field.options) && field.options.length) {
    return field.options.some((o) => {
      const v = norm(optionValue(o));
      const l = norm(optionLabel(o));
      return (want === v || want === l) && (a === v || a === l);
    });
  }
  return false; // strict: text must match exactly (normalized)
}

// Full apply pipeline. Fills what it can, then re-reads the form and verifies
// every fill before submitting. Auto-submits ONLY a complete + verified form;
// otherwise returns a reviewReason so the caller flags it for a human. Returns
// an audit summary; never returns or logs raw field values. `stagehandFactory`
// is injected in tests.
export async function runApply({ applicationId, url, db = defaultDb, stagehandFactory = defaultStagehandFactory }) {
  const application = db.prepare('SELECT * FROM applications WHERE id = ?').get(applicationId);
  if (!application) throw new Error('Application not found');

  const packet = buildPacket(db, application);
  const host = hostOf(url);
  const sh = await stagehandFactory({ cdpUrl: process.env.CHROME_CDP_URL || 'http://localhost:9222', url });

  try {
    const fields = (await sh.extract()) || [];
    const details = []; // value-free audit: form labels + action/reason only
    const intendedFills = []; // { field, answer } for post-fill verification
    let filledCount = 0;
    let skippedCount = 0;
    let requiredUnmet = 0; // required fields left neither filled nor pre-filled
    const skip = (field, reason) => {
      skippedCount += 1;
      details.push({ label: field.label, action: 'skipped', reason });
      if (field.required && reason !== 'prefilled') requiredUnmet += 1;
    };

    const fillExisting = Boolean(packet.applyPolicy.fillExisting);
    for (const field of fields) {
      if (isRedacted(field.label)) { skip(field, 'redacted'); continue; }
      if (!fillExisting && String(field.currentValue ?? '').trim()) { skip(field, 'prefilled'); continue; }

      const resolved = resolveField(field, { packet, host, db });
      if (!resolved) { skip(field, 'unresolved'); continue; }
      if ((resolved.confidence || 0) < MIN_CONFIDENCE) { skip(field, 'low_confidence'); continue; }

      await sh.act({ field, answer: resolved.answer });
      filledCount += 1;
      intendedFills.push({ field, answer: resolved.answer, resolved });
      details.push({ label: field.label, action: 'filled', strategy: resolved.strategy });
    }

    // Double-check: re-read the form and verify each fill landed correctly,
    // matching by a stable key (name/id, then label). If the re-read itself
    // fails, treat every fill as unverified (→ flag) rather than throwing.
    // Only resolutions that VERIFY are learned into the semantic cache.
    let after;
    try { after = (await sh.extract()) || []; } catch { after = null; }
    const afterValue = new Map((after || []).map((f) => [fieldKey(f), f.currentValue]));
    let unverified = 0;
    for (const { field, answer, resolved } of intendedFills) {
      const ok = after !== null && verifyFill(field, answer, afterValue.get(fieldKey(field)));
      if (ok) {
        if (resolved.strategy !== 'cache') learnMapping(db, host, field, resolved);
      } else {
        unverified += 1;
        details.push({ label: field.label, action: 'unverified', reason: after === null ? 'verify_read_failed' : 'value_mismatch' });
      }
    }
    const verified = unverified === 0;

    // Auto-submit ONLY a complete AND verified form. Otherwise leave it for a
    // human and tell the caller why (so it can flag the application).
    let reviewReason = null;
    if (requiredUnmet > 0) reviewReason = `${requiredUnmet} required field(s) could not be filled`;
    else if (!verified) reviewReason = `${unverified} field(s) did not verify after fill`;

    let submitted = false;
    if (packet.applyPolicy.canAutoSubmit && filledCount > 0 && requiredUnmet === 0 && verified) {
      await sh.act({ submit: true });
      submitted = true;
    }
    return { hostname: host, filledCount, skippedCount, requiredUnmet, unverified, verified, submitted, reviewReason, details };
  } finally {
    if (sh && typeof sh.close === 'function') await sh.close();
  }
}

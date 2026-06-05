import { Router } from 'express';
import db from '../db.js';
import { runApply, resolveField, isRedacted } from '../services/apply/stagehandRunner.js';
import { buildPacket } from '../services/apply/packet.js';
import { logEvent, recordSubmitted, flagForReview } from '../services/apply/events.js';
import { seedTasks } from '../services/applyTaskTemplates.js';

// Extension bridge (Units 2.4 + 2.7). The extension is a thin Trigger UI; the
// backend owns extraction/resolution/submission. These endpoints are
// origin-locked to extension origins.
const router = Router();

// --- CORS + token gate: only extension origins may call /api/extension/*,
// and (when PORTAL_TOKEN is set) only callers presenting the token (Unit 2.7/2.8).
const ALLOWED = (process.env.EXTENSION_ALLOWED_ORIGINS || '')
  .split(',').map((s) => s.trim()).filter(Boolean);
const EXT_SCHEME = /^(chrome-extension|safari-web-extension|moz-extension):\/\//;
const isAllowedOrigin = (origin) => EXT_SCHEME.test(origin) || ALLOWED.includes(origin);

function presentedToken(req) {
  return req.get('x-portal-token') || (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
}

router.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    if (!isAllowedOrigin(origin)) return res.status(403).json({ error: 'Origin not allowed for the extension API.' });
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Portal-Token, Authorization');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  // When a token is configured, every call must present it — this also closes
  // the no-Origin bypass (curl / native clients) for LAN-exposed deployments.
  // Read at request time so it can be configured/tested at runtime.
  const portalToken = process.env.PORTAL_TOKEN || '';
  if (portalToken && presentedToken(req) !== portalToken) {
    return res.status(401).json({ error: 'Invalid or missing portal token.' });
  }
  return next();
});

const hostOf = (url) => { try { return new URL(url).hostname; } catch { return ''; } };

// POST /api/extension/trigger-apply  { applicationId, url }
router.post('/trigger-apply', async (req, res) => {
  const { applicationId, url } = req.body || {};
  if (!applicationId || !url) return res.status(400).json({ error: 'applicationId and url are required.' });
  const id = Number(applicationId);
  if (!db.prepare('SELECT id FROM applications WHERE id = ?').get(id)) {
    return res.status(404).json({ error: 'Application not found' });
  }
  try {
    const summary = await runApply({ applicationId: id, url: String(url) });
    // Audit (no field values — counts/host only).
    logEvent(db, id, {
      kind: 'autofill_run',
      source: 'extension',
      summary: `${summary.hostname}: filled ${summary.filledCount}, skipped ${summary.skippedCount}${summary.submitted ? ', submitted' : ''}`,
      metadata: {
        hostname: summary.hostname, ats: summary.hostname,
        filledCount: summary.filledCount, skippedCount: summary.skippedCount,
        requiredUnmet: summary.requiredUnmet, unverified: summary.unverified,
        verified: summary.verified, submitted: summary.submitted,
      },
    });
    if (summary.submitted) {
      recordSubmitted(db, id, { source: 'extension', summary: 'Auto-submitted via Stagehand', metadata: { hostname: summary.hostname } });
    } else if (summary.reviewReason) {
      // Couldn't complete/verify — flag for a human instead of submitting.
      flagForReview(db, id, { source: 'extension', summary: `Auto-apply paused: ${summary.reviewReason}.`, metadata: { hostname: summary.hostname } });
    }
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/extension/context — resolve form fields for an application using the
// packet + saved answers. Selects map to a valid option (never a hallucinated
// enum); redacted/EEO fields are reported, never fabricated. Returns the
// retrieval scope so a caller can do RAG-narrowed drafting via the assistant.
router.post('/context', (req, res) => {
  const { applicationId, jobContext = {}, fields = [] } = req.body || {};
  const application = db.prepare('SELECT * FROM applications WHERE id = ?').get(Number(applicationId));
  if (!application) return res.status(404).json({ error: 'Application not found' });

  const packet = buildPacket(db, application);
  const host = hostOf(jobContext.url || '');
  const resolved = (Array.isArray(fields) ? fields : []).map((f) => {
    if (isRedacted(f.label)) return { label: f.label, value: null, redacted: true, source: null };
    const r = resolveField(f, { packet, host, db });
    return { label: f.label, value: r?.answer ?? null, redacted: false, source: r?.strategy ?? null };
  });

  logEvent(db, Number(applicationId), {
    kind: 'packet_opened', source: 'extension',
    summary: `Resolved ${resolved.filter((r) => r.value != null).length}/${resolved.length} fields`,
    metadata: { hostname: host },
  });

  res.json({ fields: resolved, retrievalScope: packet.retrievalScope });
});

// POST /api/extension/save-job — push a listing into the tracker.
router.post('/save-job', (req, res) => {
  const b = req.body || {};
  if (!b.title && !b.url) return res.status(400).json({ error: 'A job title or url is required.' });

  if (b.externalId && b.source) {
    const existing = db.prepare('SELECT * FROM applications WHERE source = ? AND external_id = ?')
      .get(b.source, String(b.externalId));
    if (existing) return res.status(200).json({ ...existing, remote: Boolean(existing.remote) });
  }

  const info = db.prepare(`
    INSERT INTO applications (external_id, source, title, company, location, url, description, status)
    VALUES (@external_id, @source, @title, @company, @location, @url, @description, 'saved')
  `).run({
    external_id: b.externalId ? String(b.externalId) : null,
    source: b.source || 'extension',
    title: b.title || '', company: b.company || '', location: b.location || '',
    url: b.url || '', description: b.description || '',
  });
  const id = info.lastInsertRowid;
  seedTasks(db, id, b.template_pack);
  logEvent(db, id, { kind: 'created', source: 'extension', summary: `Saved from ${hostOf(b.url || '') || 'extension'}` });
  res.status(201).json({ ...db.prepare('SELECT * FROM applications WHERE id = ?').get(id), remote: false });
});

export default router;

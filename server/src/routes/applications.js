import { Router } from 'express';
import db from '../db.js';
import { recordEditIfAny } from '../services/answerMemory.js';

const router = Router();

const VALID_STATUS = ['saved', 'applied', 'interviewing', 'offer', 'rejected', 'archived'];

// --- Apply-workspace serializer (Unit 2.0) --------------------------------
// One normalized shape per application, with nested collections that later
// units fill in. The nested reads are tolerant of not-yet-migrated tables, so
// 2.1 (documents), 2.2 (tasks), 2.3 (apply plan), and 2.7 (events) light up
// automatically as their migrations land — no change needed here.

function tableExists(database, name) {
  return Boolean(
    database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name),
  );
}

function childRows(database, table, applicationId, orderBy = 'id') {
  if (!tableExists(database, table)) return [];
  return database.prepare(`SELECT * FROM ${table} WHERE application_id = ? ORDER BY ${orderBy}`)
    .all(applicationId);
}

// Attached documents, joined with the document record for the metadata the
// workspace needs (filename, extraction status, etc.). Unit 2.1.
function attachedDocuments(database, applicationId) {
  if (!tableExists(database, 'application_documents')) return [];
  return database.prepare(`
    SELECT ad.document_id, ad.role, ad.variant_tag, ad.label, ad.attached_at,
           d.original_name, d.mimetype, d.size, d.type AS document_type,
           d.extraction_status, d.text_chars, d.is_default
    FROM application_documents ad
    JOIN documents d ON d.id = ad.document_id
    WHERE ad.application_id = ?
    ORDER BY ad.attached_at DESC
  `).all(applicationId);
}

export function serializeApplication(database, row) {
  if (!row) return null;
  const applyPlan = tableExists(database, 'apply_plans')
    ? database.prepare('SELECT * FROM apply_plans WHERE application_id = ?').get(row.id) || null
    : null;
  return {
    ...row,
    remote: Boolean(row.remote),
    documents: attachedDocuments(database, row.id),
    tasks: childRows(database, 'application_tasks', row.id, 'sort_order, id'),
    answers: childRows(database, 'application_answers', row.id, 'created_at DESC'),
    events: childRows(database, 'application_events', row.id, 'created_at DESC'),
    applyPlan,
  };
}

// List, optionally filtered by status. GET /api/applications?status=applied
router.get('/', (req, res) => {
  const { status } = req.query;
  const rows = status
    ? db.prepare('SELECT * FROM applications WHERE status = ? ORDER BY updated_at DESC').all(status)
    : db.prepare('SELECT * FROM applications ORDER BY updated_at DESC').all();
  res.json(rows.map((r) => ({ ...r, remote: Boolean(r.remote) })));
});

// Counts per status for the dashboard.
router.get('/stats', (req, res) => {
  const rows = db.prepare('SELECT status, COUNT(*) AS count FROM applications GROUP BY status').all();
  const stats = Object.fromEntries(VALID_STATUS.map((s) => [s, 0]));
  rows.forEach((r) => { stats[r.status] = r.count; });
  stats.total = Object.values(stats).reduce((a, b) => a + b, 0);
  res.json(stats);
});

// Single application with nested workspace collections (Unit 2.0).
// Registered after /stats so the literal route is not captured by :id.
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(serializeApplication(db, row));
});

// Save a job (from search) or create a manual entry.
router.post('/', (req, res) => {
  const b = req.body || {};
  const status = VALID_STATUS.includes(b.status) ? b.status : 'saved';

  // Dedupe by (source, external_id) when present.
  if (b.externalId && b.source) {
    const existing = db.prepare(
      'SELECT * FROM applications WHERE source = ? AND external_id = ?',
    ).get(b.source, String(b.externalId));
    if (existing) return res.status(200).json({ ...existing, remote: Boolean(existing.remote) });
  }

  const info = db.prepare(`
    INSERT INTO applications
      (external_id, source, title, company, location, url, salary, description, remote, status, notes, applied_at)
    VALUES
      (@external_id, @source, @title, @company, @location, @url, @salary, @description, @remote, @status, @notes, @applied_at)
  `).run({
    external_id: b.externalId ? String(b.externalId) : null,
    source: b.source || 'manual',
    title: b.title || '', company: b.company || '', location: b.location || '',
    url: b.url || '', salary: b.salary || '', description: b.description || '',
    remote: b.remote ? 1 : 0, status, notes: b.notes || '',
    applied_at: status === 'applied' ? new Date().toISOString() : null,
  });
  res.status(201).json({ ...db.prepare('SELECT * FROM applications WHERE id = ?').get(info.lastInsertRowid), remote: Boolean(b.remote) });
});

// Update an application (status change, notes, cover letter, etc.).
router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const current = db.prepare('SELECT * FROM applications WHERE id = ?').get(id);
  if (!current) return res.status(404).json({ error: 'Not found' });

  const b = req.body || {};
  const fields = {};
  for (const f of ['title', 'company', 'location', 'url', 'salary', 'description', 'notes', 'cover_letter']) {
    if (f in b) fields[f] = b[f];
  }
  if ('status' in b && VALID_STATUS.includes(b.status)) {
    fields.status = b.status;
    // Stamp applied_at the first time it moves to "applied".
    if (b.status === 'applied' && !current.applied_at) fields.applied_at = new Date().toISOString();
  }
  if ('remote' in b) fields.remote = b.remote ? 1 : 0;

  if (Object.keys(fields).length) {
    const set = Object.keys(fields).map((k) => `${k} = @${k}`).join(', ');
    db.prepare(`UPDATE applications SET ${set}, updated_at = datetime('now') WHERE id = @id`)
      .run({ ...fields, id });
  }
  const updated = db.prepare('SELECT * FROM applications WHERE id = ?').get(id);
  res.json({ ...updated, remote: Boolean(updated.remote) });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM applications WHERE id = ?').run(Number(req.params.id));
  res.status(204).end();
});

// --- Saved application answers (Q&A) --------------------------------------
router.get('/:id/answers', (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM application_answers WHERE application_id = ? ORDER BY created_at DESC',
  ).all(Number(req.params.id));
  res.json(rows);
});

router.post('/:id/answers', (req, res) => {
  const id = Number(req.params.id);
  const app = db.prepare('SELECT id, title, company FROM applications WHERE id = ?').get(id);
  if (!app) return res.status(404).json({ error: 'Application not found' });
  const b = req.body || {};
  if (!b.question) return res.status(400).json({ error: 'A question is required.' });
  const info = db.prepare(`
    INSERT INTO application_answers (application_id, job_title, company, question, answer, source)
    VALUES (@application_id, @job_title, @company, @question, @answer, @source)
  `).run({
    application_id: id, job_title: app.title, company: app.company,
    question: b.question, answer: b.answer || '', source: b.source || 'manual',
  });
  recordEditIfAny(db, {
    id: info.lastInsertRowid, question: b.question, jobContext: `${app.title || ''} ${app.company || ''}`.trim(),
    aiDraft: b.ai_draft, finalText: b.answer, source: b.source || 'manual',
  });
  res.status(201).json(db.prepare('SELECT * FROM application_answers WHERE id = ?').get(info.lastInsertRowid));
});

// --- Linked documents (Unit 2.1) ------------------------------------------
const DOC_ROLES = ['resume', 'cover_letter', 'portfolio', 'references', 'transcript', 'other'];

// Return one application's attached documents (joined with their metadata).
function listAttachedDocuments(applicationId) {
  return attachedDocuments(db, applicationId);
}

router.get('/:id/documents', (req, res) => {
  res.json(listAttachedDocuments(Number(req.params.id)));
});

// Attach a document to an application. A document is attached once per
// application (single role/variant/label), so re-attaching replaces the prior
// link rather than accumulating duplicate rows.
router.post('/:id/documents', (req, res) => {
  const id = Number(req.params.id);
  const app = db.prepare('SELECT id FROM applications WHERE id = ?').get(id);
  if (!app) return res.status(404).json({ error: 'Application not found' });

  const b = req.body || {};
  const documentId = Number(b.documentId);
  if (!documentId) return res.status(400).json({ error: 'documentId is required.' });
  const doc = db.prepare('SELECT id FROM documents WHERE id = ?').get(documentId);
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  const role = DOC_ROLES.includes(b.role) ? b.role : 'resume';
  db.transaction(() => {
    db.prepare('DELETE FROM application_documents WHERE application_id = ? AND document_id = ?')
      .run(id, documentId);
    db.prepare(`
      INSERT INTO application_documents (application_id, document_id, role, variant_tag, label)
      VALUES (@application_id, @document_id, @role, @variant_tag, @label)
    `).run({
      application_id: id, document_id: documentId, role,
      variant_tag: b.variantTag || '', label: b.label || '',
    });
  })();

  const attached = listAttachedDocuments(id).find((d) => d.document_id === documentId);
  res.status(201).json(attached);
});

// Update an attachment's role / variant tag / label.
router.patch('/:id/documents/:documentId', (req, res) => {
  const id = Number(req.params.id);
  const documentId = Number(req.params.documentId);
  const existing = db.prepare(
    'SELECT * FROM application_documents WHERE application_id = ? AND document_id = ?',
  ).get(id, documentId);
  if (!existing) return res.status(404).json({ error: 'Attachment not found' });

  const b = req.body || {};
  const fields = {};
  if ('role' in b && DOC_ROLES.includes(b.role)) fields.role = b.role;
  if ('variantTag' in b) fields.variant_tag = b.variantTag || '';
  if ('label' in b) fields.label = b.label || '';
  if (Object.keys(fields).length) {
    const set = Object.keys(fields).map((k) => `${k} = @${k}`).join(', ');
    db.prepare(`UPDATE application_documents SET ${set} WHERE application_id = @id AND document_id = @documentId`)
      .run({ ...fields, id, documentId });
  }
  res.json(listAttachedDocuments(id).find((d) => d.document_id === documentId));
});

router.delete('/:id/documents/:documentId', (req, res) => {
  db.prepare('DELETE FROM application_documents WHERE application_id = ? AND document_id = ?')
    .run(Number(req.params.id), Number(req.params.documentId));
  res.status(204).end();
});

export default router;

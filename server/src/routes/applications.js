import { Router } from 'express';
import db from '../db.js';

const router = Router();

const VALID_STATUS = ['saved', 'applied', 'interviewing', 'offer', 'rejected', 'archived'];

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
  res.status(201).json(db.prepare('SELECT * FROM application_answers WHERE id = ?').get(info.lastInsertRowid));
});

export default router;

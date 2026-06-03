import { Router } from 'express';
import db from '../db.js';
import { recordEditIfAny } from '../services/answerMemory.js';

// Flat answer routes. App-scoped list/create live under /api/applications/:id/answers;
// these handle inline (search-context) answers and deletion.
const router = Router();

// Answers saved from search before a job is tracked (application_id IS NULL).
router.get('/orphaned', (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM application_answers
    WHERE application_id IS NULL
    ORDER BY created_at DESC
  `).all();
  res.json(rows);
});

// Save an answer not tied to a saved application (e.g. from search results).
router.post('/', (req, res) => {
  const b = req.body || {};
  if (!b.question) return res.status(400).json({ error: 'A question is required.' });
  const info = db.prepare(`
    INSERT INTO application_answers (application_id, job_title, company, question, answer, source)
    VALUES (@application_id, @job_title, @company, @question, @answer, @source)
  `).run({
    application_id: b.application_id || null,
    job_title: b.job_title || '', company: b.company || '',
    question: b.question, answer: b.answer || '', source: b.source || 'manual',
  });
  recordEditIfAny(db, {
    id: info.lastInsertRowid, question: b.question, jobContext: `${b.job_title || ''} ${b.company || ''}`.trim(),
    aiDraft: b.ai_draft, finalText: b.answer, source: b.source || 'manual',
  });
  res.status(201).json(db.prepare('SELECT * FROM application_answers WHERE id = ?').get(info.lastInsertRowid));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM application_answers WHERE id = ?').run(Number(req.params.id));
  res.status(204).end();
});

export default router;

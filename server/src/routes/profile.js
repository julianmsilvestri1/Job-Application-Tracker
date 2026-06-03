import { Router } from 'express';
import db from '../db.js';
import { clearAiCache } from '../services/ai/orchestrator.js';
import { clearRecommendedCache } from './jobs.js';

const router = Router();

// Profile, experience, and education edits all change the candidate context the
// AI builds from (see buildCandidateContext) and the fit scores embedded in the
// recommended-jobs feed, so flush both in-memory caches on any such mutation.
// (job_scores rows are keyed by a profile-context hash and self-invalidate on
// the next scoreJobs call, so no DB cleanup is needed here.)
function invalidateCandidateCaches() {
  clearAiCache();
  clearRecommendedCache();
}

const PROFILE_FIELDS = [
  'full_name', 'email', 'phone', 'location', 'headline', 'summary',
  'linkedin', 'github', 'website', 'work_authorization', 'needs_sponsorship',
  'years_experience', 'desired_salary', 'skills', 'custom_fields',
];

function getProfile() {
  const p = db.prepare('SELECT * FROM profile WHERE id = 1').get();
  p.skills = parseJson(p.skills, []);
  p.custom_fields = parseJson(p.custom_fields, {});
  p.needs_sponsorship = Boolean(p.needs_sponsorship);
  return p;
}

// GET full profile (personal info + experiences + education)
router.get('/', (req, res) => {
  const profile = getProfile();
  const experiences = db.prepare('SELECT * FROM experiences ORDER BY sort_order, id DESC').all();
  const education = db.prepare('SELECT * FROM education ORDER BY sort_order, id DESC').all();
  res.json({ profile, experiences, education });
});

// PUT update the personal-info fields
router.put('/', (req, res) => {
  const body = req.body || {};
  const updates = {};
  for (const f of PROFILE_FIELDS) {
    if (!(f in body)) continue;
    if (f === 'skills' || f === 'custom_fields') updates[f] = JSON.stringify(body[f]);
    else if (f === 'needs_sponsorship') updates[f] = body[f] ? 1 : 0;
    else updates[f] = body[f];
  }
  if (Object.keys(updates).length) {
    const set = Object.keys(updates).map((k) => `${k} = @${k}`).join(', ');
    db.prepare(`UPDATE profile SET ${set}, updated_at = datetime('now') WHERE id = 1`).run(updates);
    invalidateCandidateCaches();
  }
  res.json(getProfile());
});

// --- Experiences ----------------------------------------------------------
router.post('/experiences', (req, res) => {
  const b = req.body || {};
  const info = db.prepare(`
    INSERT INTO experiences (company, title, location, start_date, end_date, is_current, description, sort_order)
    VALUES (@company, @title, @location, @start_date, @end_date, @is_current, @description, @sort_order)
  `).run({
    company: b.company || '', title: b.title || '', location: b.location || '',
    start_date: b.start_date || '', end_date: b.end_date || '',
    is_current: b.is_current ? 1 : 0, description: b.description || '',
    sort_order: b.sort_order || 0,
  });
  invalidateCandidateCaches();
  res.status(201).json(db.prepare('SELECT * FROM experiences WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/experiences/:id', (req, res) => {
  const b = req.body || {};
  db.prepare(`
    UPDATE experiences SET company=@company, title=@title, location=@location,
      start_date=@start_date, end_date=@end_date, is_current=@is_current,
      description=@description, sort_order=@sort_order WHERE id=@id
  `).run({
    id: Number(req.params.id),
    company: b.company || '', title: b.title || '', location: b.location || '',
    start_date: b.start_date || '', end_date: b.end_date || '',
    is_current: b.is_current ? 1 : 0, description: b.description || '',
    sort_order: b.sort_order || 0,
  });
  invalidateCandidateCaches();
  res.json(db.prepare('SELECT * FROM experiences WHERE id = ?').get(Number(req.params.id)));
});

router.delete('/experiences/:id', (req, res) => {
  db.prepare('DELETE FROM experiences WHERE id = ?').run(Number(req.params.id));
  invalidateCandidateCaches();
  res.status(204).end();
});

// --- Education ------------------------------------------------------------
router.post('/education', (req, res) => {
  const b = req.body || {};
  const info = db.prepare(`
    INSERT INTO education (school, degree, field, start_date, end_date, gpa, sort_order)
    VALUES (@school, @degree, @field, @start_date, @end_date, @gpa, @sort_order)
  `).run({
    school: b.school || '', degree: b.degree || '', field: b.field || '',
    start_date: b.start_date || '', end_date: b.end_date || '',
    gpa: b.gpa || '', sort_order: b.sort_order || 0,
  });
  invalidateCandidateCaches();
  res.status(201).json(db.prepare('SELECT * FROM education WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/education/:id', (req, res) => {
  const b = req.body || {};
  db.prepare(`
    UPDATE education SET school=@school, degree=@degree, field=@field,
      start_date=@start_date, end_date=@end_date, gpa=@gpa, sort_order=@sort_order WHERE id=@id
  `).run({
    id: Number(req.params.id),
    school: b.school || '', degree: b.degree || '', field: b.field || '',
    start_date: b.start_date || '', end_date: b.end_date || '',
    gpa: b.gpa || '', sort_order: b.sort_order || 0,
  });
  invalidateCandidateCaches();
  res.json(db.prepare('SELECT * FROM education WHERE id = ?').get(Number(req.params.id)));
});

router.delete('/education/:id', (req, res) => {
  db.prepare('DELETE FROM education WHERE id = ?').run(Number(req.params.id));
  invalidateCandidateCaches();
  res.status(204).end();
});

function parseJson(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}

export { getProfile };
export default router;

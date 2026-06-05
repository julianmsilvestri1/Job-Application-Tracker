import { Router } from 'express';
import db from '../db.js';
import { getProfile } from './profile.js';
import { coverLetter, answerQuestion, positioning, planQueries, aiEnabled } from '../services/ai/orchestrator.js';
import { updateApplySettings } from '../services/apply/settings.js';
import { applyPolicySummary } from '../services/apply/policy.js';

const router = Router();

router.get('/status', (req, res) => {
  res.json({ aiEnabled: aiEnabled() });
});

// Apply safety policy (Unit 2.8). canSubmit is OFF by default — the assistant
// fills + verifies and the human submits, unless auto-submit is explicitly
// enabled. Sensitive/EEO labels are never auto-filled.
router.get('/apply-policy', (req, res) => {
  res.json(applyPolicySummary(db));
});

router.put('/apply-policy', (req, res) => {
  updateApplySettings(db, req.body || {});
  res.json(applyPolicySummary(db));
});

// Positioning / branding guidance derived from the profile (Unit 3.3).
router.get('/positioning', async (req, res) => {
  try {
    res.json(await positioning({ refresh: req.query.refresh === 'true' }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Expand a search intent into board-friendly queries (Unit 3.4).
router.get('/plan-queries', async (req, res) => {
  try {
    res.json(await planQueries({ intent: String(req.query.intent || '') }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Flat field map for autofilling application forms (copy-to-clipboard helper).
router.get('/autofill', (req, res) => {
  const p = getProfile();
  const [first = '', ...rest] = (p.full_name || '').split(' ');
  const fields = {
    'First name': first,
    'Last name': rest.join(' '),
    'Full name': p.full_name,
    Email: p.email,
    Phone: p.phone,
    Location: p.location,
    'LinkedIn URL': p.linkedin,
    'GitHub URL': p.github,
    Website: p.website,
    Headline: p.headline,
    'Years of experience': p.years_experience,
    'Work authorization': p.work_authorization,
    'Require sponsorship': p.needs_sponsorship ? 'Yes' : 'No',
    'Desired salary': p.desired_salary,
    Summary: p.summary,
    Skills: (p.skills || []).join(', '),
  };
  // Merge any custom Q&A pairs the user saved.
  Object.entries(p.custom_fields || {}).forEach(([k, v]) => { fields[k] = v; });

  res.json({
    fields: Object.entries(fields)
      .filter(([, v]) => v !== '' && v != null)
      .map(([label, value]) => ({ label, value: String(value) })),
  });
});

// Generate a tailored cover letter. Body: { jobId? , job?, refresh? }
router.post('/cover-letter', async (req, res) => {
  const job = resolveJob(req.body);
  if (!job) return res.status(400).json({ error: 'Provide a job or jobId.' });
  try {
    res.json(await coverLetter({ job, refresh: Boolean(req.body?.refresh) }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Answer an application question. Body: { question, jobId? , job?, refresh? }
router.post('/answer', async (req, res) => {
  const { question } = req.body || {};
  if (!question) return res.status(400).json({ error: 'A question is required.' });
  const job = resolveJob(req.body) || {};
  try {
    res.json(await answerQuestion({ job, question, refresh: Boolean(req.body?.refresh) }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Accept either an inline job object or a saved application id.
function resolveJob(body = {}) {
  if (body.job && body.job.title) return body.job;
  if (body.jobId) {
    return db.prepare('SELECT * FROM applications WHERE id = ?').get(Number(body.jobId)) || null;
  }
  return null;
}

export default router;

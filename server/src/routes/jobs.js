import { Router } from 'express';
import { searchAll, providerStatus } from '../services/jobProviders/index.js';
import db from '../db.js';

const router = Router();

// Which providers are available / configured.
router.get('/providers', (req, res) => {
  res.json(providerStatus());
});

// Search across all configured boards.
// GET /api/jobs/search?q=engineer&location=NYC&remote=true&sources=adzuna,remotive
router.get('/search', async (req, res) => {
  const { q = '', location = '', remote, sources, page = '1' } = req.query;
  try {
    const { jobs, errors, sourcesQueried } = await searchAll({
      query: String(q),
      location: String(location),
      remote: remote === 'true' || remote === '1',
      page: Number(page) || 1,
      sources: sources ? String(sources).split(',').filter(Boolean) : undefined,
    });

    // Annotate which jobs are already tracked so the UI can show status.
    const tracked = db.prepare(
      'SELECT source, external_id, status FROM applications WHERE external_id IS NOT NULL',
    ).all();
    const map = new Map(tracked.map((t) => [`${t.source}|${t.external_id}`, t.status]));
    const annotated = jobs.map((j) => ({
      ...j,
      trackedStatus: map.get(`${j.source}|${j.externalId}`) || null,
    }));

    res.json({ jobs: annotated, errors, sourcesQueried });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

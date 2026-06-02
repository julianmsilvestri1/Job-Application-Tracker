import { Router } from 'express';
import { searchAll, providerStatus } from '../services/jobProviders/index.js';
import { scoreJobs, planQueries } from '../services/ai/orchestrator.js';
import { getPreferences, preferencesToQueries } from './preferences.js';
import db from '../db.js';

const router = Router();

// Which providers are available / configured.
router.get('/providers', (req, res) => {
  res.json(providerStatus());
});

// Annotate jobs with the status of any matching tracked application.
function annotateTracked(jobs) {
  const tracked = db.prepare(
    'SELECT source, external_id, status FROM applications WHERE external_id IS NOT NULL',
  ).all();
  const map = new Map(tracked.map((t) => [`${t.source}|${t.external_id}`, t.status]));
  return jobs.map((j) => ({ ...j, trackedStatus: map.get(`${j.source}|${j.externalId}`) || null }));
}

// Attach a `fit` object ({score, reasons, gaps, source}) to each job.
async function attachFit(jobs) {
  const scores = await scoreJobs({ jobs });
  return jobs.map((j, i) => ({ ...j, fit: scores[i] || null }));
}

// Search across all configured boards.
// GET /api/jobs/search?q=engineer&location=NYC&remote=true&sources=adzuna,remotive&rank=true
router.get('/search', async (req, res) => {
  const { q = '', location = '', remote, sources, page = '1', rank } = req.query;
  try {
    const { jobs, errors, sourcesQueried } = await searchAll({
      query: String(q),
      location: String(location),
      remote: remote === 'true' || remote === '1',
      page: Number(page) || 1,
      sources: sources ? String(sources).split(',').filter(Boolean) : undefined,
    });

    let annotated = annotateTracked(jobs);
    if (rank === 'true' || rank === '1') {
      annotated = await attachFit(annotated);
      annotated.sort((a, b) => (b.fit?.score || 0) - (a.fit?.score || 0));
    }
    res.json({ jobs: annotated, errors, sourcesQueried });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Score a set of jobs the client already has (so it can merge + sort by fit).
// Body: { jobs: [...], refresh? } → { scores: [...] }
router.post('/score', async (req, res) => {
  const { jobs, refresh } = req.body || {};
  if (!Array.isArray(jobs) || jobs.length === 0) {
    return res.status(400).json({ error: 'Provide a non-empty jobs array.' });
  }
  try {
    const scores = await scoreJobs({ jobs, refresh: Boolean(refresh) });
    res.json({ scores });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Profile/preference-driven feed for the Dashboard. Builds queries from saved
// preferences (or, when empty, from the profile via planQueries), searches,
// scores, and returns the top N by fit. Cached briefly to stay API-friendly.
const recommendedCache = new Map();
const RECOMMENDED_TTL = 5 * 60 * 1000;

router.get('/recommended', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 12, 30);
  try {
    const prefs = getPreferences();
    let queries = preferencesToQueries(prefs);
    let derivedFrom = 'preferences';

    if (queries.length === 0) {
      const plan = await planQueries({ intent: '' });
      queries = plan.queries;
      derivedFrom = 'profile';
    }
    if (queries.length === 0) {
      return res.json({ jobs: [], queries: [], derivedFrom, note: 'Add job preferences or a profile headline to get recommendations.' });
    }

    const cacheKey = JSON.stringify({ queries, remote: prefs.remote_only, sources: prefs.sources, limit });
    const hit = recommendedCache.get(cacheKey);
    if (hit && Date.now() - hit.at < RECOMMENDED_TTL) return res.json(hit.value);

    const sources = prefs.sources?.length ? prefs.sources : undefined;
    const settled = await Promise.allSettled(queries.slice(0, 6).map((qq) =>
      searchAll({
        query: qq.query,
        location: qq.location || (prefs.locations?.[0] || ''),
        remote: Boolean(prefs.remote_only) || Boolean(qq.remote),
        sources,
      }),
    ));

    const errors = [];
    let pool = [];
    settled.forEach((r) => {
      if (r.status === 'fulfilled') { pool.push(...r.value.jobs); errors.push(...r.value.errors); }
      else errors.push({ source: 'app', message: r.reason?.message || String(r.reason) });
    });

    // Merge + de-dupe across the multiple queries.
    const seen = new Set();
    pool = pool.filter((j) => {
      const k = `${j.source}|${j.externalId}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    let jobs = annotateTracked(pool);
    if (jobs.length) {
      jobs = await attachFit(jobs);
      jobs.sort((a, b) => (b.fit?.score || 0) - (a.fit?.score || 0));
    }
    jobs = jobs.slice(0, limit);

    const value = { jobs, queries, derivedFrom, errors };
    recommendedCache.set(cacheKey, { at: Date.now(), value });
    res.json(value);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export function clearRecommendedCache() {
  recommendedCache.clear();
}

export default router;

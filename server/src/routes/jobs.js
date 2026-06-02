import { Router } from 'express';
import { searchAll, providerStatus, dedupe } from '../services/jobProviders/index.js';
import db from '../db.js';
import { scoreJobs, planQueries } from '../services/ai/orchestrator.js';
import { getSearchPreferences, preferenceQueries } from '../services/searchPreferences.js';

const router = Router();

// Which providers are available / configured.
router.get('/providers', (req, res) => {
  res.json(providerStatus());
});

// Search across all configured boards.
// GET /api/jobs/search?q=engineer&location=NYC&remote=true&sources=adzuna,remotive
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
    let scoring = null;
    if (rank === 'true' || rank === '1') {
      scoring = await scoreJobs({ jobs: annotated });
      annotated = mergeScores(annotated, scoring.results).sort(byFitThenRecent);
    }

    res.json({ jobs: annotated, errors, sourcesQueried, scoring });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/score', async (req, res) => {
  try {
    res.json(await scoreJobs({ jobs: req.body?.jobs || [], refresh: Boolean(req.body?.refresh) }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/recommended', async (req, res) => {
  try {
    const prefs = getSearchPreferences(db);
    let queries = preferenceQueries(prefs);
    let planning = null;
    if (queries.length === 0) {
      planning = await planQueries({ intent: 'Recommend jobs for this candidate based on their profile.' });
      queries = planning.queries;
    }

    const page = Number(req.query.page) || 1;
    const limit = Math.min(30, Math.max(1, Number(req.query.limit) || 12));
    const settled = await Promise.allSettled(queries.map((q) => searchAll({
      query: q.query,
      location: q.location || '',
      remote: prefs.remote_only || Boolean(q.remote),
      page,
      sources: prefs.sources?.length ? prefs.sources : undefined,
    })));

    const errors = [];
    let jobs = [];
    settled.forEach((result, index) => {
      if (result.status === 'fulfilled') jobs.push(...result.value.jobs);
      else errors.push({ source: `query:${index + 1}`, message: result.reason?.message || String(result.reason) });
    });

    jobs = annotateTracked(dedupe(jobs));
    const scoring = await scoreJobs({ jobs });
    const ranked = mergeScores(jobs, scoring.results).sort(byFitThenRecent).slice(0, limit);
    res.json({ jobs: ranked, errors, queries, preferences: prefs, planning, scoring });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function annotateTracked(jobs) {
  const tracked = db.prepare(
    'SELECT source, external_id, status FROM applications WHERE external_id IS NOT NULL',
  ).all();
  const map = new Map(tracked.map((t) => [`${t.source}|${t.external_id}`, t.status]));
  return jobs.map((j) => ({
    ...j,
    trackedStatus: map.get(`${j.source}|${j.externalId}`) || null,
  }));
}

function mergeScores(jobs, scores = []) {
  const byKey = new Map(scores.map((s) => [s.job_key, s]));
  return jobs.map((job) => {
    const score = byKey.get(`${job.source}:${job.externalId}`) || byKey.get(`${job.source}:${job.url}`);
    return score ? { ...job, fit: score } : job;
  });
}

function byFitThenRecent(a, b) {
  const fit = (b.fit?.score ?? -1) - (a.fit?.score ?? -1);
  if (fit !== 0) return fit;
  return (Date.parse(b.postedAt) || 0) - (Date.parse(a.postedAt) || 0);
}

export default router;

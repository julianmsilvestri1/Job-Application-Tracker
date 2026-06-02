// Single entry point for all Claude usage. No route or service calls the
// Anthropic API directly — they go through the task functions here, each of
// which has a deterministic fallback so the app works with no API key.
//
// DB access is dependency-injected (defaults to the app singleton) so the
// tasks can be unit-tested against an in-memory database.
import crypto from 'node:crypto';
import defaultDb from '../../db.js';
import {
  candidateKeywords,
  heuristicScore,
  heuristicPositioning,
  heuristicQueries,
} from './heuristics.js';

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const ANTHROPIC_VERSION = '2023-06-01';
const RESUME_BUDGET = 6000; // chars of resume text injected into context
const CACHE_TTL_MS = Number(process.env.AI_CACHE_TTL_MS) || 10 * 60 * 1000;

/** @type {Map<string, { value: object, expiresAt: number }>} */
const responseCache = new Map();

function cacheKey(task, parts) {
  const payload = parts.filter((p) => p != null).join('\0');
  const digest = crypto.createHash('sha256').update(payload).digest('hex').slice(0, 24);
  return `${task}:${digest}`;
}

function getCached(key) {
  const hit = responseCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    responseCache.delete(key);
    return null;
  }
  return hit.value;
}

function setCached(key, value) {
  responseCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function clearAiCache() {
  responseCache.clear();
}

export function aiEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// --- Context building ------------------------------------------------------

function parseJson(s, fallback) {
  try { const v = JSON.parse(s); return v ?? fallback; } catch { return fallback; }
}

function loadProfile(db) {
  const p = db.prepare('SELECT * FROM profile WHERE id = 1').get() || {};
  p.skills = parseJson(p.skills, []);
  return p;
}

function defaultResumeText(db) {
  const row = db.prepare(`
    SELECT extracted_text FROM documents
    WHERE type = 'resume' AND is_default = 1 AND extraction_status = 'done'
    ORDER BY created_at DESC LIMIT 1
  `).get();
  return row?.extracted_text || '';
}

// Pure formatter (unit-testable without a DB).
export function formatCandidateContext({ profile = {}, experiences = [], education = [], resumeText = '' }) {
  const skills = (Array.isArray(profile.skills) ? profile.skills : []).join(', ');
  const exp = experiences.slice(0, 5).map((e) =>
    `- ${e.title || ''} at ${e.company || ''}${e.is_current ? ' (current)' : ''}` +
    `${e.start_date ? ` [${e.start_date}–${e.is_current ? 'Present' : e.end_date || ''}]` : ''}` +
    `${e.description ? `: ${e.description}` : ''}`).join('\n');
  const edu = education.slice(0, 4).map((e) =>
    `- ${e.degree || ''}${e.field ? ` in ${e.field}` : ''}, ${e.school || ''}`).join('\n');

  return [
    `Name: ${profile.full_name || '(unknown)'}`,
    profile.headline && `Headline: ${profile.headline}`,
    profile.years_experience && `Years of experience: ${profile.years_experience}`,
    profile.location && `Location: ${profile.location}`,
    skills && `Skills: ${skills}`,
    profile.summary && `Summary: ${profile.summary}`,
    exp && `Work experience:\n${exp}`,
    edu && `Education:\n${edu}`,
    resumeText && `=== RESUME (verbatim) ===\n${resumeText.slice(0, RESUME_BUDGET)}`,
  ].filter(Boolean).join('\n');
}

// DB-bound context builder used by the task functions.
export async function buildCandidateContext({ includeResume = true, db = defaultDb } = {}) {
  const profile = loadProfile(db);
  const experiences = db.prepare('SELECT * FROM experiences ORDER BY sort_order, id DESC').all();
  const education = db.prepare('SELECT * FROM education ORDER BY sort_order, id DESC').all();
  const resumeText = includeResume ? defaultResumeText(db) : '';
  return {
    profile, experiences, education, resumeText,
    text: formatCandidateContext({ profile, experiences, education, resumeText }),
    hasResume: Boolean(resumeText),
  };
}

// --- Low-level Claude call -------------------------------------------------

// Returns text, or (when jsonSchema is given) the parsed tool input object.
async function complete({ system, user, maxTokens = 800, jsonSchema = null }) {
  const body = {
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  };
  if (jsonSchema) {
    body.tools = [{ name: 'respond', description: 'Return the structured result.', input_schema: jsonSchema }];
    body.tool_choice = { type: 'tool', name: 'respond' };
  }
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (jsonSchema) {
    const tool = (data.content || []).find((b) => b.type === 'tool_use');
    return tool?.input ?? null;
  }
  return (data.content || []).map((b) => b.text || '').join('').trim();
}

// --- Tasks -----------------------------------------------------------------

export async function coverLetter({ job, db = defaultDb, refresh = false }) {
  const ctx = await buildCandidateContext({ includeResume: true, db });
  if (!aiEnabled()) return { text: templateCoverLetter(ctx.profile, job), source: 'template' };

  const system =
    'You are an expert career writer. Write a concise, specific, professional ' +
    'cover letter in the first person (~250 words). No clichés or placeholders. ' +
    'Use only facts present in the candidate context (including their resume).';
  const user =
    `Write a tailored cover letter for this candidate and role.\n\n` +
    `=== CANDIDATE ===\n${ctx.text}\n\n` +
    `=== JOB ===\nTitle: ${job.title}\nCompany: ${job.company}\n` +
    `Location: ${job.location || 'n/a'}\nDescription: ${(job.description || '').slice(0, 2500)}`;

  // `refresh` (an explicit "Regenerate") bypasses the cache for a fresh result.
  const key = cacheKey('coverLetter', [ctx.text, job.title, job.company, job.location, job.description]);
  if (!refresh) {
    const cached = getCached(key);
    if (cached) return cached;
  }

  try {
    const result = { text: await complete({ system, user, maxTokens: 900 }), source: 'ai' };
    setCached(key, result);
    return result;
  } catch (err) {
    return { text: templateCoverLetter(ctx.profile, job), source: 'template', warning: err.message };
  }
}

export async function answerQuestion({ job = {}, question, db = defaultDb, refresh = false }) {
  const ctx = await buildCandidateContext({ includeResume: true, db });
  if (!aiEnabled()) {
    return { text: templateAnswer(ctx.profile, job, question), source: 'template' };
  }
  const system =
    'You help a job candidate answer application questions truthfully and ' +
    'concisely in the first person, using only facts in the candidate context. ' +
    'If a fact is unknown, give a sensible professional answer without inventing specifics.';
  const user =
    `=== CANDIDATE ===\n${ctx.text}\n` +
    (ctx.profile.work_authorization ? `Work authorization: ${ctx.profile.work_authorization}\n` : '') +
    `\n=== JOB ===\n${job.title || ''} at ${job.company || ''}\n\n` +
    `=== QUESTION ===\n${question}\n\nWrite the answer only.`;
  const key = cacheKey('answerQuestion', [ctx.text, question, job.title, job.company]);
  if (!refresh) {
    const cached = getCached(key);
    if (cached) return cached;
  }

  try {
    const result = { text: await complete({ system, user, maxTokens: 500 }), source: 'ai' };
    setCached(key, result);
    return result;
  } catch (err) {
    return {
      text: templateAnswer(ctx.profile, job, question),
      source: 'template',
      warning: err.message,
    };
  }
}

// --- Phase 3: personalized discovery ---------------------------------------

// Stable key for a posting (used as the job_scores cache key).
export function jobKey(job = {}) {
  if (job.source && job.externalId) return `${job.source}:${job.externalId}`;
  if (job.url) return `url:${job.url}`;
  return `ctl:${`${job.company || ''}|${job.title || ''}|${job.location || ''}`.toLowerCase().trim()}`;
}

// Hash of the candidate context — changing the profile/resume invalidates cache.
export function profileHash(contextText = '') {
  return crypto.createHash('sha256').update(contextText).digest('hex').slice(0, 24);
}

const SCORE_SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          job_key: { type: 'string' },
          score: { type: 'integer', minimum: 0, maximum: 100 },
          reasons: { type: 'array', items: { type: 'string' } },
          gaps: { type: 'array', items: { type: 'string' } },
        },
        required: ['job_key', 'score', 'reasons', 'gaps'],
      },
    },
  },
  required: ['results'],
};

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function clampScore(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

/**
 * Score how well each posting fits the candidate, with explainable reasons/gaps.
 * Cached per (job_key, profile_hash) in the job_scores table; only uncached jobs
 * reach the AI, and AI calls are batched. Every job always gets a score — the
 * heuristic backs the AI path (no key, API error, or a job the model omitted).
 *
 * Returns scores aligned to the input `jobs`:
 *   [{ job_key, score, reasons[], gaps[], source: 'cache'|'ai'|'heuristic' }]
 */
export async function scoreJobs({ jobs = [], db = defaultDb, refresh = false, batchSize = 8 } = {}) {
  if (!Array.isArray(jobs) || jobs.length === 0) return [];
  const ctx = await buildCandidateContext({ includeResume: true, db });
  const candidate = candidateKeywords(ctx);
  const phash = profileHash(ctx.text);

  const keyed = jobs.map((job) => ({ job, key: jobKey(job) }));
  const byKey = new Map();

  const readCached = db.prepare('SELECT * FROM job_scores WHERE job_key = ? AND profile_hash = ?');
  const writeCached = db.prepare(`
    INSERT INTO job_scores (job_key, profile_hash, score, reasons, gaps, method, created_at)
    VALUES (@job_key, @profile_hash, @score, @reasons, @gaps, @method, datetime('now'))
    ON CONFLICT(job_key, profile_hash) DO UPDATE SET
      score = excluded.score, reasons = excluded.reasons, gaps = excluded.gaps,
      method = excluded.method, created_at = excluded.created_at
  `);

  const persist = (key, result, method) => {
    try {
      writeCached.run({
        job_key: key, profile_hash: phash, score: result.score,
        reasons: JSON.stringify(result.reasons || []), gaps: JSON.stringify(result.gaps || []),
        method,
      });
    } catch { /* cache write is best-effort */ }
  };

  // 1. Serve from the DB cache where possible.
  const toScore = [];
  for (const { job, key } of keyed) {
    if (!refresh) {
      const hit = readCached.get(key, phash);
      if (hit) {
        byKey.set(key, {
          job_key: key, score: hit.score,
          reasons: parseJson(hit.reasons, []), gaps: parseJson(hit.gaps, []),
          source: 'cache',
        });
        continue;
      }
    }
    toScore.push({ job, key });
  }

  const heuristicFor = ({ job, key }) => {
    const r = heuristicScore(candidate, job);
    persist(key, r, 'heuristic');
    byKey.set(key, { job_key: key, ...r, source: 'heuristic' });
  };

  // 2. No key → heuristic for everything still needing a score.
  if (!aiEnabled()) {
    toScore.forEach(heuristicFor);
    return keyed.map(({ key }) => byKey.get(key));
  }

  // 3. AI path, batched. Any batch that fails (or omits a job) falls back.
  const system =
    'You are a precise technical recruiter. Score how well the candidate fits ' +
    'each job from 0 to 100. Base the score ONLY on the candidate context vs. the ' +
    'job. "reasons" must cite concrete candidate strengths that match; "gaps" must ' +
    'cite concrete requirements the candidate appears to be missing. Be calibrated ' +
    'and consistent: a strong match is 80+, a stretch is 40–60, a poor fit is <30.';

  for (const batch of chunk(toScore, batchSize)) {
    const jobsBlock = batch.map(({ job, key }) =>
      `--- job_key: ${key}\nTitle: ${job.title || ''}\nCompany: ${job.company || ''}\n` +
      `Location: ${job.location || 'n/a'}\nDescription: ${(job.description || '').slice(0, 1200)}`,
    ).join('\n\n');
    const user =
      `=== CANDIDATE ===\n${ctx.text}\n\n=== JOBS (${batch.length}) ===\n${jobsBlock}\n\n` +
      'Return one result per job_key, echoing the job_key exactly.';

    let parsed = null;
    try {
      parsed = await complete({ system, user, maxTokens: 1500, jsonSchema: SCORE_SCHEMA });
    } catch { parsed = null; }

    const results = new Map((parsed?.results || []).map((r) => [String(r.job_key), r]));
    for (const item of batch) {
      const r = results.get(item.key);
      if (r) {
        const norm = {
          score: clampScore(r.score),
          reasons: Array.isArray(r.reasons) ? r.reasons.filter(Boolean) : [],
          gaps: Array.isArray(r.gaps) ? r.gaps.filter(Boolean) : [],
        };
        persist(item.key, norm, 'ai');
        byKey.set(item.key, { job_key: item.key, ...norm, source: 'ai' });
      } else {
        heuristicFor(item); // model omitted this job → heuristic
      }
    }
  }

  return keyed.map(({ key }) => byKey.get(key));
}

const POSITIONING_SCHEMA = {
  type: 'object',
  properties: {
    headlines: { type: 'array', items: { type: 'string' } },
    targetTitles: { type: 'array', items: { type: 'string' } },
    keywordStrategy: { type: 'array', items: { type: 'string' } },
    summaryRewrite: { type: 'string' },
  },
  required: ['headlines', 'targetTitles', 'keywordStrategy', 'summaryRewrite'],
};

// Brand/positioning guidance for the candidate (headline variants, target titles,
// keyword strategy, an optional summary rewrite). Heuristic fallback always
// returns non-empty arrays so the Profile panel is never blank.
export async function positioning({ db = defaultDb, refresh = false } = {}) {
  const ctx = await buildCandidateContext({ includeResume: true, db });
  const fallback = () => ({ ...heuristicPositioning(ctx), source: 'heuristic' });
  if (!aiEnabled()) return fallback();

  const key = cacheKey('positioning', [ctx.text]);
  if (!refresh) {
    const cached = getCached(key);
    if (cached) return cached;
  }

  const system =
    'You are an expert career coach and resume strategist. From the candidate ' +
    'context, propose concrete, specific positioning. Headlines are punchy ' +
    '(<=12 words). targetTitles are real job titles to search for. ' +
    'keywordStrategy lists ATS keywords worth featuring. summaryRewrite is a ' +
    'tight 2–3 sentence professional summary in the first person. Use only facts ' +
    'present in the context.';
  const user = `=== CANDIDATE ===\n${ctx.text}\n\nProvide positioning suggestions.`;

  try {
    const out = await complete({ system, user, maxTokens: 800, jsonSchema: POSITIONING_SCHEMA });
    if (!out || !Array.isArray(out.headlines) || out.headlines.length === 0) return fallback();
    const result = {
      headlines: out.headlines.filter(Boolean).slice(0, 6),
      targetTitles: (out.targetTitles || []).filter(Boolean).slice(0, 8),
      keywordStrategy: (out.keywordStrategy || []).filter(Boolean).slice(0, 12),
      summaryRewrite: String(out.summaryRewrite || '').trim() || heuristicPositioning(ctx).summaryRewrite,
      source: 'ai',
    };
    setCached(key, result);
    return result;
  } catch (err) {
    return { ...fallback(), warning: err.message };
  }
}

const QUERIES_SCHEMA = {
  type: 'object',
  properties: {
    queries: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          location: { type: 'string' },
          remote: { type: 'boolean' },
        },
        required: ['query'],
      },
    },
    rationale: { type: 'string' },
  },
  required: ['queries'],
};

// Expand a (possibly vague) search intent into several board-appropriate queries.
export async function planQueries({ intent = '', db = defaultDb, refresh = false } = {}) {
  const ctx = await buildCandidateContext({ includeResume: false, db });
  const fallback = () => ({ ...heuristicQueries(ctx, intent), source: 'heuristic' });
  if (!aiEnabled()) return fallback();

  const key = cacheKey('planQueries', [ctx.text, intent]);
  if (!refresh) {
    const cached = getCached(key);
    if (cached) return cached;
  }

  const system =
    'You turn a job seeker\'s intent into 3–6 concrete search queries for job ' +
    'boards. Each query is a short keyword phrase (no boolean operators). Vary ' +
    'seniority and synonyms to widen coverage while staying relevant to the ' +
    'candidate. Set location/remote only when clearly implied.';
  const user =
    `=== CANDIDATE ===\n${ctx.text}\n\n=== INTENT ===\n${intent || '(none given — infer from the profile)'}\n\n` +
    'Return the queries and a one-line rationale.';

  try {
    const out = await complete({ system, user, maxTokens: 600, jsonSchema: QUERIES_SCHEMA });
    const queries = (out?.queries || [])
      .map((q) => ({
        query: String(q.query || '').trim(),
        location: q.location ? String(q.location).trim() : undefined,
        remote: typeof q.remote === 'boolean' ? q.remote : undefined,
      }))
      .filter((q) => q.query)
      .slice(0, 6);
    if (queries.length === 0) return fallback();
    const result = { queries, rationale: String(out.rationale || '').trim(), source: 'ai' };
    setCached(key, result);
    return result;
  } catch (err) {
    return { ...fallback(), warning: err.message };
  }
}

// --- Template fallbacks ----------------------------------------------------

function templateCoverLetter(profile = {}, job = {}) {
  const name = profile.full_name || 'Your Name';
  const skills = (Array.isArray(profile.skills) ? profile.skills : []).slice(0, 5).join(', ');
  return (
`Dear ${job.company || 'Hiring Manager'} Hiring Team,

I am excited to apply for the ${job.title || 'open'} position${job.company ? ` at ${job.company}` : ''}. ${
  profile.headline ? `${profile.headline}. ` : ''
}${profile.years_experience ? `With ${profile.years_experience} years of experience, ` : ''}I believe my background makes me a strong fit for this role.

${profile.summary || 'I bring a track record of delivering results and collaborating across teams to ship meaningful work.'}${
  skills ? ` My core strengths include ${skills}.` : ''
}

I would welcome the opportunity to discuss how I can contribute to your team. Thank you for your consideration.

Sincerely,
${name}${profile.email ? `\n${profile.email}` : ''}${profile.phone ? `\n${profile.phone}` : ''}`
  );
}

// Heuristic answer when no API key: classify the question and compose from
// profile facts. Always returns a usable, professional first-person draft.
function templateAnswer(profile = {}, job = {}, question = '') {
  const q = question.toLowerCase();
  const name = profile.full_name || '';
  const skills = (Array.isArray(profile.skills) ? profile.skills : []).slice(0, 6).join(', ');
  const years = profile.years_experience;
  const company = job.company || 'your team';
  const role = job.title || 'this role';
  const has = (...words) => words.some((w) => q.includes(w));

  if (has('why do you want', 'why are you interested', 'why this company', 'why us', 'why work', 'interested in this')) {
    return `I'm excited about ${role} at ${company} because it aligns with my background${
      profile.headline ? ` as ${profile.headline}` : ''}. ${
      profile.summary || 'I’m drawn to teams doing meaningful, high-quality work'} and I see a strong fit between ${
      skills ? `my strengths in ${skills}` : 'my experience'} and what this role requires.`;
  }
  if (has('greatest strength', 'your strength', 'strengths', 'best at', 'good at')) {
    return `My core strengths are ${skills || 'delivering results and collaborating across teams'}. ${
      profile.summary || 'I consistently turn ambiguous problems into shipped, reliable solutions.'}`;
  }
  if (has('weakness', 'improve on', 'area of growth', 'development area')) {
    return 'An area I actively work on is balancing depth with speed — I’ve learned to time-box exploration and ship iteratively, then refine based on feedback.';
  }
  if (has('why are you leaving', 'why leaving', 'why looking', 'leaving your current', 'reason for')) {
    return `I’m looking for a role where I can take on more ownership and impact${
      skills ? `, applying my strengths in ${skills}` : ''}. ${company} stood out as a place to do exactly that.`;
  }
  if (has('salary', 'compensation', 'expected pay', 'pay expectation', 'desired pay')) {
    return profile.desired_salary
      ? `My target compensation is around ${profile.desired_salary}, though I’m open to discussing the full package for the right opportunity.`
      : 'I’m flexible on compensation and open to a fair offer based on the role’s scope and market rate.';
  }
  if (has('start date', 'availability', 'notice period', 'when can you start', 'available to start')) {
    return 'I can typically start within two weeks of an offer, and I’m happy to align with your preferred timeline.';
  }
  if (has('sponsor', 'authorized to work', 'work authorization', 'visa', 'right to work')) {
    if (profile.work_authorization) {
      return `My work authorization status: ${profile.work_authorization}.${
        profile.needs_sponsorship ? ' I would require visa sponsorship.' : ' I do not require sponsorship.'}`;
    }
    return profile.needs_sponsorship
      ? 'I would require visa sponsorship for this role.'
      : 'I am authorized to work and do not require sponsorship.';
  }
  if (has('relocat')) {
    return `I’m open to relocation for the right opportunity${profile.location ? `; I’m currently based in ${profile.location}` : ''}.`;
  }
  if (has('tell me about yourself', 'about yourself', 'introduce yourself', 'who are you')) {
    return `${name ? `I’m ${name}, ` : ''}${profile.headline || 'a results-driven professional'}${
      years ? ` with ${years} years of experience` : ''}. ${
      profile.summary || ''}${skills ? ` I specialize in ${skills}.` : ''}`.trim();
  }
  // Generic, still grounded in the candidate's facts.
  return `${profile.summary || 'I bring a track record of delivering results and collaborating across teams.'}${
    skills ? ` My relevant strengths include ${skills}.` : ''}${
    years ? ` I have ${years} years of experience` : ''}${
    company !== 'your team' ? `, and I’m confident I can contribute meaningfully at ${company}.` : '.'}`;
}

// Exposed for testing / reuse by later phases.
export { complete, templateCoverLetter, templateAnswer };

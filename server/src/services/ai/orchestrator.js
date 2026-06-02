// Single entry point for all Claude usage. No route or service calls the
// Anthropic API directly — they go through the task functions here, each of
// which has a deterministic fallback so the app works with no API key.
//
// DB access is dependency-injected (defaults to the app singleton) so the
// tasks can be unit-tested against an in-memory database.
import crypto from 'node:crypto';
import defaultDb from '../../db.js';

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const ANTHROPIC_VERSION = '2023-06-01';
const RESUME_BUDGET = 6000; // chars of resume text injected into context
const CACHE_TTL_MS = Number(process.env.AI_CACHE_TTL_MS) || 10 * 60 * 1000;
const SCORE_BATCH_SIZE = 8;

/** @type {Map<string, { value: object, expiresAt: number }>} */
const responseCache = new Map();

function cacheKey(task, parts) {
  const payload = parts.filter((p) => p != null).join('\0');
  const digest = crypto.createHash('sha256').update(payload).digest('hex').slice(0, 24);
  return `${task}:${digest}`;
}

function hashText(text) {
  return crypto.createHash('sha256').update(text || '').digest('hex');
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
async function complete({ system, user, maxTokens = 800, jsonSchema = null, temperature }) {
  const body = {
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  };
  if (temperature != null) body.temperature = temperature;
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

export async function scoreJobs({ jobs = [], db = defaultDb, refresh = false } = {}) {
  const ctx = await buildCandidateContext({ includeResume: true, db });
  const profileHash = hashText(ctx.text);
  const normalized = jobs.map((job) => ({ job, job_key: jobKey(job) })).filter(({ job }) => job);
  if (normalized.length === 0) return { results: [], source: aiEnabled() ? 'ai' : 'template' };

  const results = new Map();
  const uncached = [];

  for (const item of normalized) {
    if (!item.job_key) {
      results.set(cacheResultKey(item), heuristicJobScore({ profile: ctx.profile, job: item.job, jobKey: null }));
      continue;
    }
    const cached = refresh ? null : readJobScore(db, item.job_key, profileHash);
    if (cached) {
      results.set(cacheResultKey(item), { ...cached, source: 'cache' });
    } else {
      uncached.push(item);
    }
  }

  if (uncached.length === 0) {
    return { results: normalized.map((item) => results.get(cacheResultKey(item))).filter(Boolean), source: 'cache' };
  }

  if (!aiEnabled()) {
    for (const item of uncached) {
      const scored = heuristicJobScore({ profile: ctx.profile, job: item.job, jobKey: item.job_key });
      results.set(cacheResultKey(item), scored);
      writeJobScore(db, scored, profileHash);
    }
    return { results: normalized.map((item) => results.get(cacheResultKey(item))).filter(Boolean), source: 'template' };
  }

  try {
    for (let i = 0; i < uncached.length; i += SCORE_BATCH_SIZE) {
      const batch = uncached.slice(i, i + SCORE_BATCH_SIZE);
      const aiResults = await scoreJobBatch({ ctx, batch });
      for (const item of batch) {
        const raw = aiResults.find((r) => r.job_key === item.job_key);
        const scored = raw
          ? cleanScoreResult(raw, item.job_key, 'ai')
          : heuristicJobScore({ profile: ctx.profile, job: item.job, jobKey: item.job_key, source: 'template' });
        results.set(cacheResultKey(item), scored);
        writeJobScore(db, scored, profileHash);
      }
    }
    return { results: normalized.map((item) => results.get(cacheResultKey(item))).filter(Boolean), source: 'ai' };
  } catch (err) {
    for (const item of uncached) {
      const scored = heuristicJobScore({ profile: ctx.profile, job: item.job, jobKey: item.job_key });
      results.set(cacheResultKey(item), scored);
      writeJobScore(db, scored, profileHash);
    }
    return {
      results: normalized.map((item) => results.get(cacheResultKey(item))).filter(Boolean),
      source: 'template',
      warning: err.message,
    };
  }
}

export async function positioning({ db = defaultDb, refresh = false } = {}) {
  const ctx = await buildCandidateContext({ includeResume: true, db });
  if (!aiEnabled()) return { ...templatePositioning(ctx), source: 'template' };

  const key = cacheKey('positioning', [ctx.text]);
  if (!refresh) {
    const cached = getCached(key);
    if (cached) return cached;
  }

  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      headlines: { type: 'array', items: { type: 'string' } },
      targetTitles: { type: 'array', items: { type: 'string' } },
      keywordStrategy: { type: 'array', items: { type: 'string' } },
      summaryRewrite: { type: 'string' },
    },
    required: ['headlines', 'targetTitles', 'keywordStrategy', 'summaryRewrite'],
  };
  const system = 'You are an expert career positioning strategist. Use only the candidate context. Return specific, truthful options.';
  const user = `Create positioning guidance for this candidate.\n\n=== CANDIDATE ===\n${ctx.text}`;

  try {
    const raw = await complete({ system, user, jsonSchema: schema, maxTokens: 900, temperature: 0.2 });
    const result = { ...cleanPositioning(raw, ctx), source: 'ai' };
    setCached(key, result);
    return result;
  } catch (err) {
    return { ...templatePositioning(ctx), source: 'template', warning: err.message };
  }
}

export async function planQueries({ intent = '', db = defaultDb, refresh = false } = {}) {
  const ctx = await buildCandidateContext({ includeResume: true, db });
  if (!aiEnabled()) return { ...templateQueryPlan(ctx, intent), source: 'template' };

  const key = cacheKey('planQueries', [ctx.text, intent]);
  if (!refresh) {
    const cached = getCached(key);
    if (cached) return cached;
  }

  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      queries: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
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
    required: ['queries', 'rationale'],
  };
  const system =
    'You expand job-search intent into 3 to 5 board-friendly searches. Prefer concise Boolean-free keyword strings.';
  const user =
    `=== CANDIDATE ===\n${ctx.text}\n\n` +
    `=== SEARCH INTENT ===\n${intent || 'Recommend suitable job searches for this candidate.'}`;

  try {
    const raw = await complete({ system, user, jsonSchema: schema, maxTokens: 700, temperature: 0.2 });
    const result = { ...cleanQueryPlan(raw, ctx, intent), source: 'ai' };
    setCached(key, result);
    return result;
  } catch (err) {
    return { ...templateQueryPlan(ctx, intent), source: 'template', warning: err.message };
  }
}

// --- Template fallbacks ----------------------------------------------------

export function jobKey(job = {}) {
  if (job.source && (job.externalId || job.external_id)) return `${job.source}:${job.externalId || job.external_id}`;
  if (job.source && job.url) return `${job.source}:${job.url}`;
  return '';
}

function cacheResultKey(item) {
  return item.job_key || JSON.stringify([item.job?.source, item.job?.title, item.job?.company, item.job?.url]);
}

function readJobScore(db, key, profileHash) {
  const row = db.prepare('SELECT * FROM job_scores WHERE job_key = ? AND profile_hash = ?').get(key, profileHash);
  if (!row) return null;
  return {
    job_key: row.job_key,
    score: clampScore(row.score),
    reasons: parseJson(row.reasons, []),
    gaps: parseJson(row.gaps, []),
  };
}

function writeJobScore(db, result, profileHash) {
  if (!result.job_key) return;
  db.prepare(`
    INSERT OR REPLACE INTO job_scores (job_key, profile_hash, score, reasons, gaps, created_at)
    VALUES (@job_key, @profile_hash, @score, @reasons, @gaps, datetime('now'))
  `).run({
    job_key: result.job_key,
    profile_hash: profileHash,
    score: clampScore(result.score),
    reasons: JSON.stringify(result.reasons || []),
    gaps: JSON.stringify(result.gaps || []),
  });
}

async function scoreJobBatch({ ctx, batch }) {
  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      results: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
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
  const system =
    'You score job fit for one candidate. Return 0-100 where 100 is an unusually strong fit. ' +
    'Reasons cite candidate strengths. Gaps cite missing or unclear requirements. Do not invent candidate facts.';
  const jobs = batch.map(({ job, job_key }) => ({
    job_key,
    title: job.title || '',
    company: job.company || '',
    location: job.location || '',
    remote: Boolean(job.remote),
    description: (job.description || '').slice(0, 2500),
  }));
  const user = `=== CANDIDATE ===\n${ctx.text}\n\n=== JOBS JSON ===\n${JSON.stringify(jobs, null, 2)}`;
  const raw = await complete({ system, user, jsonSchema: schema, maxTokens: 1400, temperature: 0.1 });
  return Array.isArray(raw?.results) ? raw.results : [];
}

export function heuristicJobScore({ profile = {}, job = {}, jobKey: key = jobKey(job), source = 'template' }) {
  const profileTerms = keywordSet([
    profile.headline,
    profile.summary,
    ...(Array.isArray(profile.skills) ? profile.skills : []),
  ].filter(Boolean).join(' '));
  const jobTerms = keywordSet(`${job.title || ''} ${job.company || ''} ${job.description || ''}`);
  const matched = [...profileTerms].filter((term) => jobTerms.has(term));
  const denominator = Math.max(4, Math.min(profileTerms.size || 1, 12));
  const coverage = Math.min(1, matched.length / denominator);
  const titleBoost = [...profileTerms].some((term) => normalizeWords(job.title || '').includes(term)) ? 12 : 0;
  const score = clampScore(Math.round(35 + coverage * 50 + titleBoost));
  const matchedLabel = matched.slice(0, 6).join(', ');
  return {
    job_key: key || '',
    score,
    reasons: matched.length
      ? [`Matches your profile keywords: ${matchedLabel}.`]
      : ['Uses your saved profile to estimate fit; add skills and a resume for sharper scoring.'],
    gaps: score >= 80
      ? []
      : ['Review the posting for requirements not yet reflected in your profile or resume.'],
    source,
  };
}

function keywordSet(text = '') {
  const stop = new Set(['and', 'the', 'for', 'with', 'from', 'that', 'this', 'you', 'your', 'are', 'job', 'role']);
  return new Set(normalizeWords(text).filter((w) => w.length > 2 && !stop.has(w)).slice(0, 80));
}

function normalizeWords(text = '') {
  return String(text).toLowerCase().replace(/[^a-z0-9+#. ]+/g, ' ').split(/\s+/).filter(Boolean);
}

function cleanScoreResult(raw, key, source) {
  return {
    job_key: key,
    score: clampScore(raw?.score),
    reasons: normalizeStringList(raw?.reasons).slice(0, 4),
    gaps: normalizeStringList(raw?.gaps).slice(0, 4),
    source,
  };
}

function cleanPositioning(raw, ctx) {
  const fallback = templatePositioning(ctx);
  return {
    headlines: normalizeStringList(raw?.headlines).slice(0, 5).length ? normalizeStringList(raw.headlines).slice(0, 5) : fallback.headlines,
    targetTitles: normalizeStringList(raw?.targetTitles).slice(0, 8).length ? normalizeStringList(raw.targetTitles).slice(0, 8) : fallback.targetTitles,
    keywordStrategy: normalizeStringList(raw?.keywordStrategy).slice(0, 10).length ? normalizeStringList(raw.keywordStrategy).slice(0, 10) : fallback.keywordStrategy,
    summaryRewrite: typeof raw?.summaryRewrite === 'string' && raw.summaryRewrite.trim()
      ? raw.summaryRewrite.trim()
      : fallback.summaryRewrite,
  };
}

export function templatePositioning(ctx = {}) {
  const profile = ctx.profile || {};
  const skills = Array.isArray(profile.skills) ? profile.skills.filter(Boolean) : [];
  const baseTitle = profile.headline || ctx.experiences?.[0]?.title || 'Results-driven professional';
  const topSkills = skills.slice(0, 4);
  const skillPhrase = topSkills.length ? ` specializing in ${topSkills.join(', ')}` : '';
  const targetTitles = [
    profile.headline,
    ctx.experiences?.[0]?.title,
    topSkills[0] && `${topSkills[0]} Specialist`,
    topSkills[1] && `${topSkills[1]} Consultant`,
  ].filter(Boolean);
  return {
    headlines: [
      `${baseTitle}${skillPhrase}`,
      topSkills.length ? `${baseTitle} | ${topSkills.slice(0, 3).join(' + ')}` : baseTitle,
      `${baseTitle} focused on measurable business impact`,
    ],
    targetTitles: [...new Set(targetTitles)].slice(0, 6),
    keywordStrategy: topSkills.length
      ? topSkills.map((skill) => `Use "${skill}" in resume bullets, search queries, and cover-letter proof points.`)
      : ['Add 5-8 concrete skills to your profile to unlock stronger keyword targeting.'],
    summaryRewrite: profile.summary
      ? `${profile.summary} I bring a focused record of matching role requirements with practical execution and clear communication.`
      : `I am a ${baseTitle.toLowerCase()}${skillPhrase} with a focus on practical execution, clear communication, and measurable results.`,
  };
}

function cleanQueryPlan(raw, ctx, intent) {
  const fallback = templateQueryPlan(ctx, intent);
  const queries = Array.isArray(raw?.queries)
    ? raw.queries.map(cleanQuery).filter((q) => q.query).slice(0, 5)
    : [];
  return {
    queries: queries.length ? queries : fallback.queries,
    rationale: typeof raw?.rationale === 'string' && raw.rationale.trim() ? raw.rationale.trim() : fallback.rationale,
  };
}

export function templateQueryPlan(ctx = {}, intent = '') {
  const profile = ctx.profile || {};
  const skills = Array.isArray(profile.skills) ? profile.skills.filter(Boolean) : [];
  const headlineWords = (profile.headline || '').split(/\s+/).filter((w) => w.length > 2);
  const base = intent.trim() || profile.headline || skills.slice(0, 3).join(' ') || 'job';
  const primary = [base, ...skills.slice(0, 2)].join(' ').trim();
  const queries = [
    { query: primary, location: profile.location || '', remote: false },
    { query: [profile.headline || headlineWords.join(' '), ...skills.slice(0, 3)].join(' ').trim(), location: '', remote: true },
    { query: skills.slice(0, 4).join(' ') || base, location: profile.location || '', remote: false },
  ].map(cleanQuery).filter((q) => q.query);
  const unique = [];
  const seen = new Set();
  for (const q of queries) {
    const key = `${q.query}|${q.location}|${q.remote}`;
    if (!seen.has(key)) { seen.add(key); unique.push(q); }
  }
  return {
    queries: unique.slice(0, 5),
    rationale: skills.length
      ? `Expanded from your profile skills: ${skills.slice(0, 5).join(', ')}.`
      : 'Expanded from your headline and saved profile. Add skills for better coverage.',
  };
}

function cleanQuery(q = {}) {
  return {
    query: String(q.query || '').replace(/\s+/g, ' ').trim(),
    location: String(q.location || '').trim(),
    remote: Boolean(q.remote),
  };
}

function normalizeStringList(value) {
  return Array.isArray(value) ? value.map((v) => String(v || '').trim()).filter(Boolean) : [];
}

function clampScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

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

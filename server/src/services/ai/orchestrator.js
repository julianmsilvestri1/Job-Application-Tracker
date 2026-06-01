// Single entry point for all Claude usage. No route or service calls the
// Anthropic API directly — they go through the task functions here, each of
// which has a deterministic fallback so the app works with no API key.
//
// DB access is dependency-injected (defaults to the app singleton) so the
// tasks can be unit-tested against an in-memory database.
import defaultDb from '../../db.js';

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const ANTHROPIC_VERSION = '2023-06-01';
const RESUME_BUDGET = 6000; // chars of resume text injected into context

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

export async function coverLetter({ job, db = defaultDb }) {
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
  try {
    return { text: await complete({ system, user, maxTokens: 900 }), source: 'ai' };
  } catch (err) {
    return { text: templateCoverLetter(ctx.profile, job), source: 'template', warning: err.message };
  }
}

export async function answerQuestion({ job = {}, question, db = defaultDb }) {
  const ctx = await buildCandidateContext({ includeResume: true, db });
  if (!aiEnabled()) {
    // Enriched in Unit 1.5.4; basic guard until then.
    return { text: '', source: 'template', warning: 'Set ANTHROPIC_API_KEY to generate answers.' };
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
  try {
    return { text: await complete({ system, user, maxTokens: 500 }), source: 'ai' };
  } catch (err) {
    return { text: '', source: 'template', warning: err.message };
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

// Exposed for testing / reuse by later phases.
export { complete, templateCoverLetter };

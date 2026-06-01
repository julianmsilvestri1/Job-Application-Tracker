// Generates tailored cover letters and application-question answers.
// Uses the Claude API when ANTHROPIC_API_KEY is set, otherwise falls back
// to a solid template so the feature always works offline / key-free.

const API_URL = 'https://api.anthropic.com/v1/messages';

export function aiEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

async function callClaude(system, user, maxTokens = 1024) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.content || []).map((b) => b.text || '').join('').trim();
}

function profileBlurb(profile, experiences = []) {
  const skills = safeJsonArray(profile.skills).join(', ');
  const recent = experiences
    .slice(0, 3)
    .map((e) => `- ${e.title} at ${e.company}${e.is_current ? ' (current)' : ''}: ${e.description || ''}`)
    .join('\n');
  return [
    `Name: ${profile.full_name || '(unknown)'}`,
    profile.headline && `Headline: ${profile.headline}`,
    profile.years_experience && `Years of experience: ${profile.years_experience}`,
    skills && `Skills: ${skills}`,
    profile.summary && `Summary: ${profile.summary}`,
    recent && `Recent experience:\n${recent}`,
  ].filter(Boolean).join('\n');
}

export async function generateCoverLetter({ profile, experiences, job }) {
  if (aiEnabled()) {
    const system =
      'You are an expert career writer. Write concise, specific, professional ' +
      'cover letters in the first person. No clichés, no placeholders, ~250 words. ' +
      'Only use facts provided about the candidate.';
    const user =
      `Write a tailored cover letter for this candidate applying to the role below.\n\n` +
      `=== CANDIDATE ===\n${profileBlurb(profile, experiences)}\n\n` +
      `=== JOB ===\nTitle: ${job.title}\nCompany: ${job.company}\n` +
      `Location: ${job.location || 'n/a'}\nDescription: ${(job.description || '').slice(0, 2500)}`;
    try {
      return { text: await callClaude(system, user, 900), source: 'ai' };
    } catch (err) {
      return { text: templateCoverLetter({ profile, job }), source: 'template', warning: err.message };
    }
  }
  return { text: templateCoverLetter({ profile, job }), source: 'template' };
}

export async function answerQuestion({ profile, experiences, job, question }) {
  if (aiEnabled()) {
    const system =
      'You help a job candidate answer application questions truthfully and ' +
      'concisely in the first person, using only the facts provided. If a fact ' +
      'is unknown, give a sensible professional answer and avoid inventing specifics.';
    const user =
      `=== CANDIDATE ===\n${profileBlurb(profile, experiences)}\n` +
      (profile.work_authorization ? `Work authorization: ${profile.work_authorization}\n` : '') +
      `\n=== JOB ===\n${job?.title || ''} at ${job?.company || ''}\n\n` +
      `=== QUESTION ===\n${question}\n\nWrite the answer only.`;
    try {
      return { text: await callClaude(system, user, 500), source: 'ai' };
    } catch (err) {
      return { text: '', source: 'template', warning: err.message };
    }
  }
  return {
    text: '',
    source: 'template',
    warning: 'Set ANTHROPIC_API_KEY to generate answers automatically.',
  };
}

function templateCoverLetter({ profile, job }) {
  const name = profile.full_name || 'Your Name';
  const skills = safeJsonArray(profile.skills).slice(0, 5).join(', ');
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

function safeJsonArray(s) {
  try { const v = JSON.parse(s || '[]'); return Array.isArray(v) ? v : []; }
  catch { return []; }
}

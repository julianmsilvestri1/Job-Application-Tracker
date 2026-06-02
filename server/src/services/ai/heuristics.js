// Pure, dependency-free heuristics that back every Phase 3 AI task when no
// ANTHROPIC_API_KEY is present (or when an AI call fails). They take already
// loaded candidate context + plain job objects so they can be unit-tested
// without a database or the network.

const STOPWORDS = new Set([
  'senior', 'junior', 'lead', 'staff', 'principal', 'sr', 'jr', 'mid', 'entry',
  'the', 'a', 'an', 'of', 'and', 'or', 'in', 'at', 'for', 'with', 'to', 'on',
  'remote', 'role', 'job', 'position', 'team', 'we', 'you', 'your', 'our', 'is',
  'are', 'as', 'be', 'by', 'from', 'this', 'that', 'will', 'who', 'i', 'ii',
  'iii', 'engineer', 'developer', 'manager', 'specialist', 'analyst',
]);

// Tokens that still carry meaning for *titles* even though they're filtered as
// generic stopwords elsewhere (so "Software Engineer" doesn't tokenize to []).
const TITLE_KEEP = new Set(['engineer', 'developer', 'manager', 'designer', 'analyst', 'scientist', 'architect']);

export function tokenize(text = '') {
  return String(text)
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ''))
    .filter((t) => t.length >= 2);
}

export function meaningfulTokens(text = '', { keep = TITLE_KEEP } = {}) {
  return tokenize(text).filter((t) => !STOPWORDS.has(t) || keep.has(t));
}

// Build the candidate's keyword surface from structured context:
//   - skills: lowercased skill phrases (kept whole so "react native" matches)
//   - tokens: a Set of every meaningful token across skills/headline/titles/summary
export function candidateKeywords({ profile = {}, experiences = [] } = {}) {
  const skills = (Array.isArray(profile.skills) ? profile.skills : [])
    .map((s) => String(s).toLowerCase().trim())
    .filter(Boolean);

  const tokens = new Set();
  for (const s of skills) tokenize(s).forEach((t) => tokens.add(t));
  meaningfulTokens(profile.headline || '').forEach((t) => tokens.add(t));
  meaningfulTokens(profile.summary || '').forEach((t) => tokens.add(t));
  for (const e of experiences) meaningfulTokens(e.title || '').forEach((t) => tokens.add(t));

  return { skills, tokens };
}

// Significant tokens of a job title (drops generic words but keeps role nouns).
export function titleTokens(title = '') {
  const seen = new Set();
  return meaningfulTokens(title).filter((t) => (seen.has(t) ? false : seen.add(t)));
}

// Deterministic fit score (0–100) from skill + title overlap, with reasons that
// cite candidate strengths and gaps that cite unmatched role emphasis. Coarser
// than the AI path, but always available.
export function heuristicScore(candidate, job = {}) {
  const cand = candidate && candidate.tokens ? candidate : candidateKeywords(candidate || {});
  const jobText = `${job.title || ''} ${job.description || ''}`.toLowerCase();

  const skillHits = [...new Set(cand.skills.filter((s) => s.length >= 2 && jobText.includes(s)))];
  const tTokens = titleTokens(job.title || '');
  const titleHits = tTokens.filter((t) => cand.tokens.has(t));

  const skillScore = cand.skills.length ? skillHits.length / cand.skills.length : 0;
  const titleScore = tTokens.length ? titleHits.length / tTokens.length : 0;
  // Weight skills a touch higher; clamp to 0..99 (AI reserves a "perfect" 100).
  const score = Math.max(0, Math.min(99, Math.round((0.55 * skillScore + 0.45 * titleScore) * 100)));

  const reasons = [];
  if (skillHits.length) reasons.push(`Matches your skills: ${skillHits.slice(0, 6).join(', ')}`);
  if (titleHits.length) reasons.push(`Title aligns with your background (${titleHits.join(', ')})`);
  if (!reasons.length) reasons.push('Limited overlap with your current profile');

  const gaps = [];
  const missing = tTokens.filter((t) => !cand.tokens.has(t));
  if (missing.length) gaps.push(`Emphasizes ${missing.slice(0, 5).join(', ')} — not prominent in your profile`);
  if (!skillHits.length && cand.skills.length) gaps.push('No direct skill overlap detected');

  return { score, reasons, gaps };
}

function compactBaseTitle(title) {
  return String(title || 'Professional')
    .replace(/\s+specializing in .+$/i, '')
    .replace(/\s+\|\s+.+$/i, '')
    .trim();
}

function headlineWithMissingSkills(baseTitle, skills) {
  const lower = baseTitle.toLowerCase();
  const missing = skills.filter((s) => !lower.includes(s.toLowerCase()));
  const compact = compactBaseTitle(baseTitle);
  return missing.length ? `${compact} specializing in ${missing.join(', ')}` : compact;
}

// Positioning guidance from structured facts (headline / skills / recent titles).
export function heuristicPositioning({ profile = {}, experiences = [] } = {}) {
  const skills = (Array.isArray(profile.skills) ? profile.skills : []).filter(Boolean);
  const recentTitles = [...new Set(experiences.map((e) => (e.title || '').trim()).filter(Boolean))];
  const top = skills.slice(0, 4);
  const base = compactBaseTitle(profile.headline || recentTitles[0] || 'Professional');

  const headlines = unique([
    profile.headline,
    headlineWithMissingSkills(base, top),
    top.length ? `${base} · ${top.slice(0, 3).join(' · ')}` : null,
    profile.years_experience ? `${base} with ${profile.years_experience} years' experience` : null,
  ]).slice(0, 4);

  const targetTitles = unique([
    ...recentTitles,
    base !== recentTitles[0] ? base : null,
    top[0] ? `${top[0]} ${roleNoun(base)}` : null,
  ]).slice(0, 5);

  const keywordStrategy = unique([...top, ...recentTitles.flatMap((t) => titleTokens(t))]).slice(0, 8);

  const summaryRewrite = profile.summary
    ? profile.summary
    : `${base}${profile.years_experience ? ` with ${profile.years_experience} years of experience` : ''}` +
      `${top.length ? `, focused on ${top.join(', ')}` : ''}. Proven track record of shipping reliable, ` +
      'high-quality work and collaborating across teams.';

  return { headlines, targetTitles, keywordStrategy, summaryRewrite };
}

// Expand a (possibly vague) intent into several board-friendly queries using the
// candidate's skills and recent titles.
export function heuristicQueries({ profile = {}, experiences = [] } = {}, intent = '') {
  const skills = (Array.isArray(profile.skills) ? profile.skills : []).filter(Boolean);
  const recentTitles = [...new Set(experiences.map((e) => (e.title || '').trim()).filter(Boolean))];
  const location = profile.location || '';
  const seedQueries = unique([
    intent && intent.trim(),
    profile.headline,
    ...recentTitles,
    ...skills.slice(0, 3),
    skills[0] && recentTitles[0] ? `${skills[0]} ${roleNoun(recentTitles[0])}` : null,
  ]).slice(0, 6);

  const queries = seedQueries.map((q) => ({
    query: q,
    location: location || undefined,
    remote: undefined,
  }));

  const rationale = intent
    ? `Expanded "${intent}" with your headline, recent titles and top skills.`
    : 'Derived from your headline, recent titles and top skills.';

  return { queries: queries.length ? queries : [{ query: intent || 'jobs' }], rationale };
}

// --- small helpers ---------------------------------------------------------

function unique(arr) {
  const seen = new Set();
  const out = [];
  for (const v of arr) {
    if (!v) continue;
    const k = String(v).toLowerCase().trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

// The role noun in a title (e.g. "Senior React Engineer" -> "Engineer").
function roleNoun(title = '') {
  const t = tokenize(title);
  const noun = [...t].reverse().find((w) => TITLE_KEEP.has(w));
  return noun ? noun[0].toUpperCase() + noun.slice(1) : 'Specialist';
}

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { runMigrations } from '../../migrations.js';
import {
  formatCandidateContext,
  buildCandidateContext,
  coverLetter,
  answerQuestion,
  templateAnswer,
  aiEnabled,
  clearAiCache,
  scoreJobs,
  positioning,
  planQueries,
  jobKey,
} from './orchestrator.js';
import { resetGeminiCallCounter } from './providers/gemini.js';

function seedDb({ resume } = {}) {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  db.prepare('INSERT OR IGNORE INTO profile (id) VALUES (1)').run();
  db.prepare(`UPDATE profile SET full_name='Jane Doe', email='jane@example.com',
    headline='Senior React Engineer', skills='["React","Node"]', summary='I build things.'
    WHERE id=1`).run();
  if (resume) {
    db.prepare(`INSERT INTO documents (type, original_name, stored_name, mimetype, is_default,
      extracted_text, extraction_status, text_chars)
      VALUES ('resume','cv.pdf','x.pdf','application/pdf',1,@t,'done',@n)`)
      .run({ t: resume, n: resume.length });
  }
  return db;
}

const realKey = process.env.ANTHROPIC_API_KEY;
const realGeminiKey = process.env.GEMINI_API_KEY;
const realFetch = global.fetch;
afterEach(() => {
  if (realKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = realKey;
  if (realGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = realGeminiKey;
  global.fetch = realFetch;
  clearAiCache();
  resetGeminiCallCounter();
});

test('formatCandidateContext includes profile and resume text', () => {
  const text = formatCandidateContext({
    profile: { full_name: 'Jane Doe', skills: ['React'] },
    experiences: [{ title: 'Eng', company: 'Acme', is_current: 1 }],
    resumeText: 'RESUME_MARKER_123',
  });
  assert.match(text, /Jane Doe/);
  assert.match(text, /Eng at Acme/);
  assert.match(text, /RESUME_MARKER_123/);
});

test('buildCandidateContext pulls the default resume from the DB', async () => {
  const db = seedDb({ resume: 'DEFAULT_RESUME_TEXT' });
  const ctx = await buildCandidateContext({ db });
  assert.ok(ctx.hasResume);
  assert.match(ctx.text, /DEFAULT_RESUME_TEXT/);
});

test('coverLetter returns a template when no API key', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const db = seedDb();
  const r = await coverLetter({ job: { title: 'Frontend Engineer', company: 'Globex' }, db });
  assert.equal(r.source, 'template');
  assert.match(r.text, /Jane Doe/);
  assert.match(r.text, /Globex/);
});

test('coverLetter (AI) sends resume text in the request body', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  const db = seedDb({ resume: 'SECRET_RESUME_MARKER' });
  let captured = '';
  global.fetch = async (url, opts) => {
    captured = opts.body;
    return { ok: true, json: async () => ({ content: [{ type: 'text', text: 'AI letter' }] }) };
  };
  const r = await coverLetter({ job: { title: 'Eng', company: 'Acme' }, db });
  assert.equal(r.source, 'ai');
  assert.equal(r.text, 'AI letter');
  assert.match(captured, /SECRET_RESUME_MARKER/);
});

test('coverLetter uses in-memory cache on repeat calls', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  const db = seedDb();
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return { ok: true, json: async () => ({ content: [{ type: 'text', text: 'Cached letter' }] }) };
  };
  const job = { title: 'Eng', company: 'Acme' };
  const r1 = await coverLetter({ job, db });
  const r2 = await coverLetter({ job, db });
  assert.equal(r1.text, 'Cached letter');
  assert.equal(r2.text, 'Cached letter');
  assert.equal(calls, 1);
});

test('refresh bypasses the cache (Regenerate)', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  const db = seedDb();
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return { ok: true, json: async () => ({ content: [{ type: 'text', text: `letter ${calls}` }] }) };
  };
  const job = { title: 'Eng', company: 'Acme' };
  await coverLetter({ job, db });                 // calls=1, caches
  const again = await coverLetter({ job, db });   // served from cache
  const fresh = await coverLetter({ job, db, refresh: true }); // bypass + recache
  assert.equal(again.text, 'letter 1');
  assert.equal(fresh.text, 'letter 2');
  assert.equal(calls, 2);
});

test('answerQuestion falls back to template if the API errors', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  const db = seedDb();
  global.fetch = async () => ({ ok: false, status: 500, text: async () => 'boom' });
  const r = await answerQuestion({
    job: { title: 'Eng', company: 'Globex' },
    question: 'Why do you want to work here?',
    db,
  });
  assert.equal(r.source, 'template');
  assert.ok(r.text.length > 0);
  assert.match(r.text, /Globex/);
  assert.ok(r.warning.includes('500'));
});

test('coverLetter falls back to template if the API errors', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  const db = seedDb();
  global.fetch = async () => ({ ok: false, status: 500, text: async () => 'boom' });
  const r = await coverLetter({ job: { title: 'Eng', company: 'Acme' }, db });
  assert.equal(r.source, 'template');
  assert.ok(r.warning.includes('500'));
});

test('aiEnabled reflects the env var', () => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GEMINI_API_KEY;
  assert.equal(aiEnabled(), false);
  process.env.ANTHROPIC_API_KEY = 'x';
  assert.equal(aiEnabled(), true);
  delete process.env.ANTHROPIC_API_KEY;
  process.env.GEMINI_API_KEY = 'x';
  assert.equal(aiEnabled(), true);
});

// --- Gemini provider priority -----------------------------------------------

test('coverLetter uses Gemini when GEMINI_API_KEY is set, even if ANTHROPIC_API_KEY is also set', async () => {
  process.env.GEMINI_API_KEY = 'gemini-test-key';
  process.env.ANTHROPIC_API_KEY = 'anthropic-test-key';
  const db = seedDb();
  let calledUrl = '';
  global.fetch = async (url) => {
    calledUrl = url;
    return {
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'Gemini letter' }] } }] }),
    };
  };
  const r = await coverLetter({ job: { title: 'Eng', company: 'Acme' }, db });
  assert.equal(r.source, 'ai');
  assert.equal(r.text, 'Gemini letter');
  assert.match(calledUrl, /generativelanguage\.googleapis\.com/);
  assert.match(calledUrl, /gemini-2\.5-pro/);
});

test('coverLetter steps down to the next Gemini model on a 429 and still succeeds', async () => {
  process.env.GEMINI_API_KEY = 'gemini-test-key';
  delete process.env.ANTHROPIC_API_KEY;
  const db = seedDb();
  const urls = [];
  global.fetch = async (url) => {
    urls.push(url);
    if (url.includes('gemini-2.5-pro')) return { ok: false, status: 429, text: async () => 'quota exceeded' };
    return {
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'Flash letter' }] } }] }),
    };
  };
  const r = await coverLetter({ job: { title: 'Eng', company: 'Acme' }, db });
  assert.equal(r.source, 'ai');
  assert.equal(r.text, 'Flash letter');
  assert.equal(urls.length, 2);
  assert.match(urls[1], /gemini-2\.5-flash/);
});

test('coverLetter falls back to the free template when Gemini has no key and Anthropic has no key', async () => {
  delete process.env.GEMINI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  const db = seedDb();
  const r = await coverLetter({ job: { title: 'Eng', company: 'Acme' }, db });
  assert.equal(r.source, 'template');
});

test('coverLetter falls back to the free template once the Gemini daily call cap is reached (never falls through to Anthropic)', async () => {
  process.env.GEMINI_API_KEY = 'gemini-test-key';
  process.env.ANTHROPIC_API_KEY = 'anthropic-test-key';
  process.env.GEMINI_DAILY_CALL_CAP = '1';
  const db = seedDb();
  let anthropicWasCalled = false;
  global.fetch = async (url) => {
    if (typeof url === 'string' && url.includes('api.anthropic.com')) anthropicWasCalled = true;
    return {
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'Gemini letter' }] } }] }),
    };
  };
  await coverLetter({ job: { title: 'Eng', company: 'Acme' }, db, refresh: true });
  const r = await coverLetter({ job: { title: 'Eng', company: 'Other' }, db, refresh: true });
  delete process.env.GEMINI_DAILY_CALL_CAP;
  assert.equal(r.source, 'template');
  assert.equal(anthropicWasCalled, false, 'a Gemini cap hit must never fall through to a paid Anthropic call');
});

test('answerQuestion returns a useful template without a key (1.5.4)', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const db = seedDb();
  const r = await answerQuestion({ job: { title: 'Eng', company: 'Globex' }, question: 'Why do you want to work here?', db });
  assert.equal(r.source, 'template');
  assert.ok(r.text.length > 0);
  assert.match(r.text, /Globex/);
});

// --- Phase 3: scoring ------------------------------------------------------

test('jobKey is stable from source + externalId', () => {
  assert.equal(jobKey({ source: 'remotive', externalId: '42' }), 'remotive:42');
});

test('scoreJobs (no key) uses the heuristic and caches to the DB', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const db = seedDb();
  const jobs = [
    { source: 'remotive', externalId: '1', title: 'React Engineer', description: 'React and Node.' },
    { source: 'remotive', externalId: '2', title: 'Diesel Mechanic', description: 'Fix trucks.' },
  ];
  const scores = await scoreJobs({ jobs, db });
  assert.equal(scores.length, 2);
  assert.ok(scores[0].score > scores[1].score, 'react role should outrank the mechanic role');
  assert.equal(scores[0].source, 'heuristic');
  const cached = db.prepare('SELECT COUNT(*) AS n FROM job_scores').get();
  assert.equal(cached.n, 2);
  const again = await scoreJobs({ jobs, db });
  assert.equal(again[0].source, 'cache');
});

test('scoreJobs (AI) parses batched tool JSON into scores', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  const db = seedDb({ resume: 'React expert' });
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return {
      ok: true,
      json: async () => ({
        content: [{
          type: 'tool_use',
          input: {
            results: [
              { job_key: 'remotive:1', score: 91, reasons: ['Strong React match'], gaps: [] },
              { job_key: 'remotive:2', score: 12, reasons: [], gaps: ['No mechanical experience'] },
            ],
          },
        }],
      }),
    };
  };
  const jobs = [
    { source: 'remotive', externalId: '1', title: 'React Engineer', description: 'React.' },
    { source: 'remotive', externalId: '2', title: 'Diesel Mechanic', description: 'Trucks.' },
  ];
  const scores = await scoreJobs({ jobs, db });
  assert.equal(scores[0].score, 91);
  assert.equal(scores[0].source, 'ai');
  assert.equal(scores[1].score, 12);
  assert.match(scores[0].reasons.join(' '), /React/);
  assert.equal(calls, 1, 'two jobs should batch into a single AI call');
});

test('scoreJobs (AI) falls back to heuristic for jobs the model omits', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  const db = seedDb();
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ content: [{ type: 'tool_use', input: { results: [
      { job_key: 'remotive:1', score: 88, reasons: ['ok'], gaps: [] },
    ] } }] }),
  });
  const jobs = [
    { source: 'remotive', externalId: '1', title: 'React Engineer', description: 'React.' },
    { source: 'remotive', externalId: '2', title: 'React Developer', description: 'React and Node.' },
  ];
  const scores = await scoreJobs({ jobs, db });
  assert.equal(scores[0].source, 'ai');
  assert.equal(scores[1].source, 'heuristic');
});

test('scoreJobs (AI) falls back to heuristic when the API errors', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  const db = seedDb();
  global.fetch = async () => ({ ok: false, status: 500, text: async () => 'boom' });
  const jobs = [{ source: 'remotive', externalId: '1', title: 'React Engineer', description: 'React.' }];
  const scores = await scoreJobs({ jobs, db });
  assert.equal(scores[0].source, 'heuristic');
  assert.equal(typeof scores[0].score, 'number');
});

// --- Phase 3: positioning --------------------------------------------------

test('positioning (no key) returns non-empty heuristic suggestions', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const db = seedDb();
  const r = await positioning({ db });
  assert.equal(r.source, 'heuristic');
  assert.ok(r.headlines.length > 0);
  assert.ok(r.summaryRewrite.length > 0);
});

test('positioning (AI) parses tool JSON', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  const db = seedDb();
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ content: [{ type: 'tool_use', input: {
      headlines: ['React Engineer who ships'], targetTitles: ['Frontend Engineer'],
      keywordStrategy: ['React', 'TypeScript'], summaryRewrite: 'I build great UIs.',
    } }] }),
  });
  const r = await positioning({ db });
  assert.equal(r.source, 'ai');
  assert.deepEqual(r.headlines, ['React Engineer who ships']);
});

// --- Phase 3: query planning ----------------------------------------------

test('planQueries (no key) expands from the profile', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const db = seedDb();
  const r = await planQueries({ intent: 'frontend', db });
  assert.equal(r.source, 'heuristic');
  assert.ok(r.queries.length >= 1);
  assert.ok(r.queries.every((q) => q.query));
});

test('planQueries (AI) parses tool JSON and trims to valid queries', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  const db = seedDb();
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ content: [{ type: 'tool_use', input: {
      queries: [{ query: 'react developer' }, { query: '' }, { query: 'frontend engineer', remote: true }],
      rationale: 'widen coverage',
    } }] }),
  });
  const r = await planQueries({ intent: 'frontend', db });
  assert.equal(r.source, 'ai');
  assert.equal(r.queries.length, 2);
  assert.equal(r.queries[1].remote, true);
});

test('templateAnswer composes from profile facts by category', () => {
  const profile = {
    full_name: 'Jane Doe', headline: 'Senior React Engineer', years_experience: '8',
    skills: ['React', 'Node'], summary: 'I ship reliable software.',
    desired_salary: '$160k', work_authorization: 'US Citizen', needs_sponsorship: false,
  };
  const job = { title: 'Frontend Eng', company: 'Acme' };

  assert.match(templateAnswer(profile, job, 'Why do you want to work here?'), /Acme/);
  assert.match(templateAnswer(profile, job, 'What is your greatest strength?'), /React/);
  assert.match(templateAnswer(profile, job, 'What are your salary expectations?'), /160k/);
  assert.match(templateAnswer(profile, job, 'Do you require visa sponsorship?'), /do not require/i);
  assert.match(templateAnswer(profile, job, 'Tell me about yourself'), /Jane Doe/);
  assert.match(templateAnswer(profile, job, 'When can you start?'), /two weeks/i);
  // Generic fallback still non-empty and grounded.
  assert.ok(templateAnswer(profile, job, 'Describe a hard problem you solved').length > 0);
});

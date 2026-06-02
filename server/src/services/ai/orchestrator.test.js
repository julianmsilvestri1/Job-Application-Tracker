import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { runMigrations } from '../../migrations.js';
import {
  formatCandidateContext,
  buildCandidateContext,
  coverLetter,
  answerQuestion,
  scoreJobs,
  heuristicJobScore,
  positioning,
  planQueries,
  templateAnswer,
  aiEnabled,
  clearAiCache,
} from './orchestrator.js';

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
const realFetch = global.fetch;
afterEach(() => {
  if (realKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = realKey;
  global.fetch = realFetch;
  clearAiCache();
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
  assert.equal(aiEnabled(), false);
  process.env.ANTHROPIC_API_KEY = 'x';
  assert.equal(aiEnabled(), true);
});

test('answerQuestion returns a useful template without a key (1.5.4)', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const db = seedDb();
  const r = await answerQuestion({ job: { title: 'Eng', company: 'Globex' }, question: 'Why do you want to work here?', db });
  assert.equal(r.source, 'template');
  assert.ok(r.text.length > 0);
  assert.match(r.text, /Globex/);
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

test('heuristicJobScore gives stronger scores for overlapping skills', () => {
  const profile = { headline: 'Senior React Engineer', skills: ['React', 'Node', 'GraphQL'] };
  const strong = heuristicJobScore({
    profile,
    job: { title: 'React Engineer', description: 'Build React and GraphQL apps with Node services.' },
  });
  const weak = heuristicJobScore({
    profile,
    job: { title: 'Accountant', description: 'Prepare audits and financial statements.' },
  });
  assert.ok(strong.score > weak.score);
  assert.match(strong.reasons[0], /react/i);
});

test('scoreJobs parses AI tool JSON and persists cache hits', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  const db = seedDb({ resume: 'React resume' });
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return {
      ok: true,
      json: async () => ({
        content: [{
          type: 'tool_use',
          input: {
            results: [{
              job_key: 'remotive:123',
              score: 91,
              reasons: ['React and Node match the role.'],
              gaps: ['Cloud experience is unclear.'],
            }],
          },
        }],
      }),
    };
  };

  const jobs = [{ source: 'remotive', externalId: '123', title: 'React Engineer', description: 'React Node' }];
  const first = await scoreJobs({ jobs, db });
  const second = await scoreJobs({ jobs, db });

  assert.equal(first.results[0].score, 91);
  assert.equal(second.results[0].score, 91);
  assert.equal(second.results[0].source, 'cache');
  assert.equal(calls, 1);
});

test('scoreJobs falls back without an API key', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const db = seedDb();
  const result = await scoreJobs({
    jobs: [{ source: 'remotive', externalId: '7', title: 'React Engineer', description: 'React Node' }],
    db,
  });
  assert.equal(result.source, 'template');
  assert.ok(result.results[0].score > 0);
});

test('positioning fallback and query planning fallback are profile-specific', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const db = seedDb();
  const pos = await positioning({ db });
  const plan = await planQueries({ intent: 'remote startup role', db });
  assert.ok(pos.headlines.length > 0);
  assert.ok(pos.targetTitles.length > 0);
  assert.ok(plan.queries.some((q) => /React|Node|remote startup role/i.test(q.query)));
});

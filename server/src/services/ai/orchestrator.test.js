import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { runMigrations } from '../../migrations.js';
import {
  formatCandidateContext,
  buildCandidateContext,
  coverLetter,
  answerQuestion,
  aiEnabled,
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

test('answerQuestion warns without a key (pre-1.5.4)', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const db = seedDb();
  const r = await answerQuestion({ job: {}, question: 'Why us?', db });
  assert.equal(r.source, 'template');
  assert.ok(r.warning);
});

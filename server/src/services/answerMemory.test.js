import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { runMigrations } from '../migrations.js';
import { setEmbedder } from './ai/embeddings.js';
import { syncEmbeddings } from './ai/indexer.js';
import { recordEditIfAny } from './answerMemory.js';

function db() {
  const d = new Database(':memory:');
  d.pragma('foreign_keys = ON');
  runMigrations(d);
  d.prepare('INSERT OR IGNORE INTO profile (id) VALUES (1)').run();
  return d;
}
afterEach(() => setEmbedder(null));

function insertAnswer(d, { question, answer, source }) {
  return d.prepare(
    'INSERT INTO application_answers (question, answer, source) VALUES (?, ?, ?)',
  ).run(question, answer, source).lastInsertRowid;
}

test('records an edit when an AI draft is changed, and flags the answer', () => {
  const d = db();
  const id = insertAnswer(d, { question: 'Why us?', answer: 'My polished final answer.', source: 'ai' });
  const recorded = recordEditIfAny(d, {
    id, question: 'Why us?', aiDraft: 'A generic AI draft.', finalText: 'My polished final answer.', source: 'ai',
  });
  assert.equal(recorded, true);
  assert.equal(d.prepare('SELECT COUNT(*) n FROM answer_edits').get().n, 1);
  assert.equal(d.prepare('SELECT edited FROM application_answers WHERE id = ?').get(id).edited, 1);
});

test('does not record when the answer is unchanged or not AI', () => {
  const d = db();
  assert.equal(recordEditIfAny(d, { aiDraft: 'same', finalText: 'same', source: 'ai' }), false);
  assert.equal(recordEditIfAny(d, { aiDraft: 'draft', finalText: 'final', source: 'manual' }), false);
  assert.equal(d.prepare('SELECT COUNT(*) n FROM answer_edits').get().n, 0);
});

test('edited answers get a higher retrieval weight than plain AI answers', () => {
  const d = db();
  const aiId = insertAnswer(d, { question: 'Q1', answer: 'plain ai answer', source: 'ai' });
  const editId = insertAnswer(d, { question: 'Q2', answer: 'edited voice answer', source: 'ai' });
  recordEditIfAny(d, { id: editId, aiDraft: 'draft', finalText: 'edited voice answer', source: 'ai' });

  syncEmbeddings(d);
  const w = (sid) => d.prepare("SELECT weight FROM embeddings WHERE source_type='answer' AND source_id=?").get(sid).weight;
  assert.ok(w(editId) > w(aiId), 'edited answer weighted higher');
});

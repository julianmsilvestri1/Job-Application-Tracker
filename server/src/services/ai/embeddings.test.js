import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMBED_DIM, embed, cosineSimilarity, topK, toBlob, fromBlob, available, setEmbedder,
} from './embeddings.js';

test('embed returns a normalized vector of the right dimension', () => {
  const v = embed('Senior React Engineer building design systems');
  assert.equal(v.length, EMBED_DIM);
  let norm = 0;
  for (const x of v) norm += x * x;
  assert.ok(Math.abs(Math.sqrt(norm) - 1) < 1e-6, 'L2 norm ~ 1');
});

test('empty text yields a zero vector (cosine 0, no crash)', () => {
  const v = embed('   ');
  assert.equal(cosineSimilarity(v, embed('anything')), 0);
});

test('cosine: identical text = 1; related > unrelated', () => {
  const eng = embed('react frontend engineer typescript');
  assert.ok(Math.abs(cosineSimilarity(eng, embed('react frontend engineer typescript')) - 1) < 1e-6);
  const related = cosineSimilarity(eng, embed('frontend react developer'));
  const unrelated = cosineSimilarity(eng, embed('warehouse forklift operator'));
  assert.ok(related > unrelated, `related ${related} should beat unrelated ${unrelated}`);
});

test('topK ranks by cosine and honors weight, returns k', () => {
  const q = embed('react engineer');
  const rows = [
    { id: 1, embedding: embed('react engineer frontend') },
    { id: 2, embedding: embed('marketing manager') },
    { id: 3, embedding: embed('react developer'), weight: 2 }, // boosted
  ];
  const out = topK(q, rows, 2);
  assert.equal(out.length, 2);
  assert.ok(out[0].score >= out[1].score);
  assert.ok(out.every((r) => r.id !== 2), 'unrelated row should not rank top-2');
});

test('toBlob/fromBlob round-trips a vector', () => {
  const v = embed('portable vector storage');
  const back = fromBlob(toBlob(v));
  assert.equal(back.length, v.length);
  for (let i = 0; i < v.length; i++) assert.ok(Math.abs(back[i] - v[i]) < 1e-7);
});

test('setEmbedder swaps the provider (DI) and available() reflects it', () => {
  assert.equal(available(), true);
  setEmbedder((t) => {
    const v = new Float32Array(EMBED_DIM);
    v[0] = t.includes('match') ? 1 : 0;
    return v;
  });
  assert.equal(cosineSimilarity(embed('match'), embed('match also')), 1);
  setEmbedder(null); // restore default
  assert.ok(cosineSimilarity(embed('react'), embed('react')) > 0.99);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { embed, semanticDuplicates } from './embeddings.js';
import { blendSemantic } from './orchestrator.js';

test('blendSemantic boosts a semantically-matched job over an unrelated one', () => {
  const candidateVec = embed('react frontend engineer typescript design systems');
  const base = { score: 50, reasons: ['lexical'], gaps: [] };
  const matched = blendSemantic(base, candidateVec, { title: 'React Engineer', description: 'frontend typescript UI' });
  const unrelated = blendSemantic(base, candidateVec, { title: 'Forklift Operator', description: 'warehouse logistics' });
  assert.ok(matched.score > unrelated.score, `${matched.score} should beat ${unrelated.score}`);
  assert.ok(matched.score <= 99);
});

test('blendSemantic is a no-op without a candidate vector', () => {
  const base = { score: 42, reasons: ['x'], gaps: [] };
  assert.deepEqual(blendSemantic(base, null, { title: 'X' }), base);
});

test('semanticDuplicates flags reworded near-duplicates only', () => {
  const vectors = [
    embed('Senior React Engineer at Acme building design systems'),
    embed('Senior React Engineer at Acme building design systems'), // exact dup
    embed('Warehouse forklift operator night shift'),               // distinct
  ];
  const drop = semanticDuplicates(vectors, 0.95);
  assert.ok(drop.has(1), 'duplicate flagged');
  assert.ok(!drop.has(0) && !drop.has(2), 'distinct items kept');
});

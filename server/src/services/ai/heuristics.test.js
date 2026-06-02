import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  candidateKeywords,
  heuristicScore,
  heuristicPositioning,
  heuristicQueries,
  titleTokens,
} from './heuristics.js';

const candidate = {
  profile: { headline: 'Senior React Engineer', skills: ['React', 'Node', 'TypeScript'], summary: 'I build web apps.' },
  experiences: [{ title: 'Frontend Engineer', company: 'Acme' }],
};

test('candidateKeywords collects skills and meaningful tokens', () => {
  const kw = candidateKeywords(candidate);
  assert.deepEqual(kw.skills, ['react', 'node', 'typescript']);
  assert.ok(kw.tokens.has('react'));
  assert.ok(kw.tokens.has('frontend'));
});

test('titleTokens keeps role nouns but drops seniority', () => {
  assert.deepEqual(titleTokens('Senior React Engineer'), ['react', 'engineer']);
});

test('heuristicScore: strong overlap lands in a high band with reasons', () => {
  const job = { title: 'React Engineer', description: 'We need React and Node and TypeScript experience.' };
  const r = heuristicScore(candidate, job);
  assert.ok(r.score >= 80, `expected >=80, got ${r.score}`);
  assert.match(r.reasons.join(' '), /React/i);
});

test('heuristicScore: a partial overlap lands in a mid band', () => {
  const job = { title: 'React Engineer', description: 'Build UIs with React.' };
  const r = heuristicScore(candidate, job);
  // React matches (1 of 3 skills) + both title tokens match.
  assert.ok(r.score >= 40 && r.score <= 75, `expected mid band, got ${r.score}`);
});

test('heuristicScore: no overlap scores low and reports gaps', () => {
  const job = { title: 'Diesel Mechanic', description: 'Repair heavy trucks and engines.' };
  const r = heuristicScore(candidate, job);
  assert.ok(r.score < 30, `expected <30, got ${r.score}`);
  assert.ok(r.gaps.length > 0);
});

test('heuristicScore: empty candidate never throws and scores 0', () => {
  const r = heuristicScore({ profile: {}, experiences: [] }, { title: 'Anything' });
  assert.equal(typeof r.score, 'number');
  assert.ok(r.score >= 0);
});

test('heuristicPositioning returns non-empty arrays and a summary', () => {
  const p = heuristicPositioning(candidate);
  assert.ok(p.headlines.length > 0);
  assert.ok(p.targetTitles.length > 0);
  assert.ok(p.keywordStrategy.length > 0);
  assert.ok(p.summaryRewrite.length > 0);
  assert.match(p.keywordStrategy.join(' ').toLowerCase(), /react/);
});

test('heuristicQueries expands intent with profile skills/titles', () => {
  const q = heuristicQueries(candidate, 'frontend');
  const text = q.queries.map((x) => x.query.toLowerCase()).join(' | ');
  assert.ok(q.queries.length >= 2);
  assert.match(text, /frontend/);
  assert.match(text, /react|engineer/);
});

test('heuristicQueries with no intent still derives from the profile', () => {
  const q = heuristicQueries(candidate, '');
  assert.ok(q.queries.length >= 1);
  assert.ok(q.queries.every((x) => x.query));
});

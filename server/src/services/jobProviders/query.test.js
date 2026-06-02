import { test } from 'node:test';
import assert from 'node:assert/strict';
import { significantTerms } from './util.js';
import { museCategories } from './themuse.js';

test('significantTerms drops seniority words and prefers specific terms', () => {
  assert.deepEqual(significantTerms('senior react native engineer', 2), ['engineer', 'native']);
  assert.deepEqual(significantTerms('lead data scientist', 2), ['scientist', 'data']);
  assert.deepEqual(significantTerms('', 2), []);
  // Never returns more than max.
  assert.equal(significantTerms('principal staff distributed systems architect', 2).length, 2);
});

test('museCategories maps queries to The Muse categories', () => {
  assert.deepEqual(museCategories('frontend engineer'), ['Software Engineering']);
  assert.deepEqual(museCategories('machine learning'), ['Data Science']);
  assert.deepEqual(museCategories('product designer'), ['Design and UX']);
  // No match -> empty (fetch broadly, filter locally).
  assert.deepEqual(museCategories('barista'), []);
  // Multiple distinct categories.
  const multi = museCategories('data engineer');
  assert.ok(multi.includes('Software Engineering') && multi.includes('Data Science'));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isApplyPage, atsLabel } from '../src/shared/applyTargets.js';

test('detects known ATS hosts', () => {
  assert.ok(isApplyPage('https://boards.greenhouse.io/acme/jobs/123'));
  assert.ok(isApplyPage('https://jobs.lever.co/acme/abc/apply'));
  assert.ok(isApplyPage('https://acme.myworkdayjobs.com/en-US/careers/job/123'));
  assert.ok(isApplyPage('https://jobs.ashbyhq.com/acme/role'));
});

test('detects apply-style paths on unknown hosts', () => {
  assert.ok(isApplyPage('https://careers.acme.com/apply'));
  assert.ok(isApplyPage('https://acme.com/jobs/123/application'));
});

test('ignores ordinary pages and bad input', () => {
  assert.equal(isApplyPage('https://news.example.com/'), false);
  assert.equal(isApplyPage('https://acme.com/about'), false);
  assert.equal(isApplyPage('https://acme.com/applying-tips'), false);
  assert.equal(isApplyPage('not a url'), false);
});

test('atsLabel returns the matched ATS domain or the hostname', () => {
  assert.equal(atsLabel('https://boards.greenhouse.io/x'), 'greenhouse.io');
  assert.equal(atsLabel('https://careers.acme.com/apply'), 'careers.acme.com');
});

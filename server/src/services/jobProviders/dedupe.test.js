import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dedupe } from './index.js';
import { normalizeUrl } from './util.js';

test('normalizeUrl canonicalizes host, slash, hash, tracking params', () => {
  assert.equal(
    normalizeUrl('https://WWW.Example.com/jobs/123/?utm_source=x&ref=y#apply'),
    'example.com/jobs/123',
  );
  // Meaningful query (job id) is preserved.
  assert.equal(normalizeUrl('https://acme.io/careers?gh_jid=42'), 'acme.io/careers?gh_jid=42');
  assert.equal(normalizeUrl('not a url'), '');
});

test('same posting from two boards (same company/title/location) collapses', () => {
  const jobs = [
    { source: 'adzuna', externalId: 'a1', company: 'Acme', title: 'Senior Engineer', location: 'NYC', url: 'https://adzuna.com/a1' },
    { source: 'jooble', externalId: 'j1', company: 'acme', title: 'senior engineer', location: 'nyc', url: 'https://jooble.org/j1' },
  ];
  assert.equal(dedupe(jobs).length, 1);
});

test('same URL (board pagination overlap) collapses despite tracking params', () => {
  const jobs = [
    { source: 'remoteok', externalId: '1', company: 'A', title: 'Dev', location: '', url: 'https://x.com/job/9?utm_source=a' },
    { source: 'remoteok', externalId: '2', company: 'B', title: 'Eng', location: '', url: 'https://x.com/job/9?utm_source=b#x' },
  ];
  assert.equal(dedupe(jobs).length, 1);
});

test('distinct roles with same title but different location are both kept', () => {
  const jobs = [
    { source: 'adzuna', externalId: 'a', company: 'Google', title: 'Software Engineer', location: 'NYC', url: 'https://g.co/a' },
    { source: 'adzuna', externalId: 'b', company: 'Google', title: 'Software Engineer', location: 'SF', url: 'https://g.co/b' },
  ];
  assert.equal(dedupe(jobs).length, 2);
});

test('jobs with no identity keys are all kept', () => {
  const jobs = [
    { source: 's', externalId: '', company: '', title: '', location: '', url: '' },
    { source: 's', externalId: '', company: '', title: '', location: '', url: '' },
  ];
  assert.equal(dedupe(jobs).length, 2);
});

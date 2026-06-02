import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { runMigrations } from '../migrations.js';
import { getSearchPreferences, preferenceQueries, saveSearchPreferences } from './searchPreferences.js';

function db() {
  const database = new Database(':memory:');
  database.pragma('foreign_keys = ON');
  runMigrations(database);
  return database;
}

test('search preferences round trip typed values', () => {
  const database = db();
  const saved = saveSearchPreferences(database, {
    titles: ['Product Manager', 'AI Lead'],
    locations: 'Remote, New York',
    keywords: ['SaaS'],
    remote_only: true,
    min_salary: '$140k',
    sources: ['remotive'],
  });

  assert.deepEqual(saved.titles, ['Product Manager', 'AI Lead']);
  assert.deepEqual(saved.locations, ['Remote', 'New York']);
  assert.equal(saved.remote_only, true);
  assert.equal(saved.min_salary, '$140k');
  assert.deepEqual(getSearchPreferences(database).sources, ['remotive']);
});

test('preferenceQueries composes title keyword location combinations', () => {
  const queries = preferenceQueries({
    titles: ['Frontend Engineer'],
    locations: ['Remote'],
    keywords: ['React', 'Node'],
    remote_only: true,
  });

  assert.equal(queries.length, 1);
  assert.match(queries[0].query, /Frontend Engineer/);
  assert.match(queries[0].query, /React/);
  assert.equal(queries[0].remote, true);
});

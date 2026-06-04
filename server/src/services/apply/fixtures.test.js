import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { runMigrations } from '../../migrations.js';
import { runApply } from './stagehandRunner.js';

function seedDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  db.prepare('INSERT OR IGNORE INTO profile (id) VALUES (1)').run();
  db.prepare(`UPDATE profile SET full_name='Jane Doe', email='jane@example.com',
    phone='555-0100', location='New York, NY', linkedin='https://linkedin.com/in/janedoe',
    github='https://github.com/janedoe', work_authorization='U.S. Citizen', needs_sponsorship=0,
    custom_fields=? WHERE id=1`).run(JSON.stringify({ 'Language proficiency': 'Professional' }));
  const appId = db.prepare("INSERT INTO applications (title, company, url) VALUES ('Analyst','Acme','https://x')").run().lastInsertRowid;
  db.prepare(`INSERT INTO application_answers (application_id, question, answer, source)
    VALUES (?, 'Why do you want to work here?', 'Because I admire the mission.', 'manual')`).run(appId);
  return { db, appId };
}

const loadFixture = async (name) =>
  JSON.parse(await readFile(fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url)), 'utf8'));

const optionValue = (o) => (typeof o === 'string' ? o : (o?.value ?? o?.label ?? ''));

async function runFixture(name) {
  const { db, appId } = seedDb();
  const fields = await loadFixture(name);
  const acts = [];
  const factory = async () => ({
    extract: async () => fields,
    act: async (a) => { acts.push(a); },
    close: async () => {},
  });
  const summary = await runApply({ applicationId: appId, url: `https://boards.${name}.test/job/1`, db, stagehandFactory: factory });
  db.close();
  return { summary, acts, fields };
}

const filledLabels = (s) => s.details.filter((d) => d.action === 'filled').map((d) => d.label);
const skipReason = (s, label) => s.details.find((d) => d.label === label)?.reason;
const actFor = (acts, label) => acts.find((a) => a.field && a.field.label === label);

// Every categorical fill must choose one of the field's allowed option VALUES.
function assertValidOptionFills(summary, acts, fields) {
  for (const d of summary.details.filter((x) => x.action === 'filled')) {
    const field = fields.find((f) => f.label === d.label);
    if (field?.options) {
      const valid = field.options.map(optionValue);
      assert.ok(valid.includes(actFor(acts, d.label).answer), `${d.label} → a valid option value`);
    }
  }
}

test('greenhouse: fills split name + contact, skips EEO selects', async () => {
  const { summary, acts } = await runFixture('greenhouse');
  const filled = filledLabels(summary);
  for (const l of ['First Name', 'Last Name', 'Email', 'Phone', 'LinkedIn Profile']) assert.ok(filled.includes(l), l);
  assert.equal(skipReason(summary, 'Gender'), 'redacted');
  assert.equal(skipReason(summary, 'Race / Ethnicity'), 'redacted');
  assert.equal(actFor(acts, 'First Name').answer, 'Jane');
  assert.equal(actFor(acts, 'Last Name').answer, 'Doe');
});

test('lever: skips a pre-filled field, fills the rest', async () => {
  const { summary } = await runFixture('lever');
  assert.equal(skipReason(summary, 'Email'), 'prefilled');
  const filled = filledLabels(summary);
  for (const l of ['Full name', 'Phone', 'Location', 'GitHub']) assert.ok(filled.includes(l), l);
});

test('ashby: categorical selects resolve to valid option values', async () => {
  const { summary, acts, fields } = await runFixture('ashby');
  const sponsor = 'Do you now or in the future require visa sponsorship?';
  assert.equal(actFor(acts, sponsor).answer, 'No');
  assert.equal(actFor(acts, 'Language proficiency').answer, 'Professional');
  assertValidOptionFills(summary, acts, fields);
});

test('workday (gnarly): verbose labels, {value,label} options, EEO/SSN/veteran skipped', async () => {
  const { summary, acts, fields } = await runFixture('workday');
  const filled = filledLabels(summary);
  for (const l of ['Legal First Name', 'Legal Last Name', 'Email Address', 'Phone Number']) assert.ok(filled.includes(l), l);
  // selects return the option VALUE, not the label
  assert.equal(actFor(acts, 'What is your current work authorization status?').answer, 'citizen');
  assert.equal(actFor(acts, 'Will you now or in the future require sponsorship for an employment visa status?').answer, 'no');
  assert.equal(skipReason(summary, 'Social Security Number'), 'redacted');
  assert.equal(skipReason(summary, 'Gender'), 'redacted');
  assert.equal(skipReason(summary, 'Are you a protected veteran?'), 'redacted');
  assert.equal(skipReason(summary, 'Country'), 'unresolved'); // unknown → left to the user
  assertValidOptionFills(summary, acts, fields);
});

test('generic: answers a free-text question from saved Q&A; fills a bare "Name" with the full name', async () => {
  const { summary, acts } = await runFixture('generic');
  const filled = filledLabels(summary);
  assert.ok(filled.includes('Email'));
  assert.ok(filled.includes('Why do you want to work here?'));
  assert.equal(actFor(acts, 'Why do you want to work here?').answer, 'Because I admire the mission.');
  // a field labelled exactly "Name" resolves to the full name (but compound
  // labels like "Company name" do not — see stagehandRunner.test.js)
  assert.equal(actFor(acts, 'Name').answer, 'Jane Doe');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { extractText } from './extract.js';

async function tmpFile(name, content) {
  const p = path.join(os.tmpdir(), `extract-test-${Date.now()}-${name}`);
  await fs.writeFile(p, content);
  return p;
}

test('extracts and normalizes plain text', async () => {
  const p = await tmpFile('r.txt', 'Jane   Doe\r\n\n\n\nReact   Engineer  ');
  const r = await extractText({ path: p, mimetype: 'text/plain' });
  assert.equal(r.status, 'done');
  assert.match(r.text, /Jane Doe/);
  assert.match(r.text, /React Engineer/);
  assert.ok(!/\n{3,}/.test(r.text), 'collapses 3+ newlines');
  await fs.rm(p, { force: true });
});

test('reports unsupported mimetype', async () => {
  const p = await tmpFile('x.doc', 'binary');
  const r = await extractText({ path: p, mimetype: 'application/msword' });
  assert.equal(r.status, 'unsupported');
  assert.equal(r.text, '');
  await fs.rm(p, { force: true });
});

test('fails gracefully on a corrupt PDF (no throw)', async () => {
  const p = await tmpFile('bad.pdf', 'not really a pdf');
  const r = await extractText({ path: p, mimetype: 'application/pdf' });
  assert.equal(r.status, 'failed');
  assert.ok(r.error.length > 0);
  await fs.rm(p, { force: true });
});

test('extracts text from a generated PDF', async () => {
  const { PDFDocument, StandardFonts } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const page = doc.addPage();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('Resume Sample Jane Doe', { x: 72, y: 700, size: 12, font });
  const bytes = await doc.save();
  const p = await tmpFile('generated.pdf', Buffer.from(bytes));
  const r = await extractText({ path: p, mimetype: 'application/pdf' });
  assert.equal(r.status, 'done');
  assert.match(r.text, /Resume Sample/i);
  await fs.rm(p, { force: true });
});

test('empty text yields failed status', async () => {
  const p = await tmpFile('empty.txt', '   \n  ');
  const r = await extractText({ path: p, mimetype: 'text/plain' });
  assert.equal(r.status, 'failed');
  await fs.rm(p, { force: true });
});

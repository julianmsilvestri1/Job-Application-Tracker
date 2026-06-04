import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previewSummary, fieldsToText, answersToText } from '../src/shared/packetView.js';

const packet = {
  candidate: { fields: [{ label: 'Email', value: 'a@b.com' }, { label: 'Phone', value: '5' }] },
  documents: [{}],
  answers: [{ question: 'Why?', answer: 'Because' }],
};

test('previewSummary pluralizes correctly', () => {
  assert.equal(previewSummary(packet), '2 fields · 1 doc · 1 answer');
  assert.equal(previewSummary({ candidate: { fields: [] }, documents: [], answers: [] }), '0 fields · 0 docs · 0 answers');
});

test('fields and answers format as copyable text', () => {
  assert.equal(fieldsToText(packet), 'Email: a@b.com\nPhone: 5');
  assert.equal(answersToText(packet), 'Q: Why?\nA: Because');
});

test('handles a missing/partial packet shape gracefully', () => {
  assert.equal(previewSummary(null), '0 fields · 0 docs · 0 answers');
  assert.equal(fieldsToText(undefined), '');
  assert.equal(answersToText({}), '');
});

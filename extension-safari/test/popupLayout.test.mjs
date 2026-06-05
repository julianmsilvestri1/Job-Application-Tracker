import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const read = (p) => readFile(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

// "Viewport fixture" for the popup at iPad scale: assert the responsive,
// touch-friendly CSS contract rather than spinning up a DOM engine.
test('popup CSS is responsive and uses 44pt tap targets', async () => {
  const html = await read('../src/popup.html');
  assert.match(html, /width:\s*min\(/, 'responsive width');
  assert.match(html, /min-width:\s*\d+px/, 'has a minimum width');
  assert.match(html, /max-height:\s*\d+vh/, 'caps height to the viewport');
  assert.match(html, /overflow-y:\s*auto/, 'scrolls when tall');
  assert.match(html, /min-height:\s*44px/, '44pt tap targets');
});

test('options page exposes a portal URL field and Test connection', async () => {
  const html = await read('../src/options.html');
  assert.match(html, /id="portalUrl"/);
  assert.match(html, /Test connection/);
});

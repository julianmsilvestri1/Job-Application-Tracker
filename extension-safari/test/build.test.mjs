import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from '../build.mjs';

const dist = (p) => fileURLToPath(new URL(`../dist/${p}`, import.meta.url));

test('builds both chrome and safari targets with all assets', async () => {
  const names = await build();
  assert.deepEqual(names, ['chrome', 'safari']);

  for (const target of names) {
    for (const f of ['content.js', 'popup.js', 'options.js', 'background.js', 'popup.html', 'options.html', 'manifest.json']) {
      const buf = await readFile(dist(`${target}/${f}`), 'utf8');
      assert.ok(buf.length > 0, `${target}/${f} should be non-empty`);
    }
    const manifest = JSON.parse(await readFile(dist(`${target}/manifest.json`), 'utf8'));
    assert.equal(manifest.manifest_version, 3);
    assert.equal(manifest.action.default_popup, 'popup.html');
    assert.equal(manifest.background.service_worker, 'background.js');
  }
});

test('content bundle has no top-level ESM export (Safari/MV3 requirement)', async () => {
  await build();
  for (const target of ['chrome', 'safari']) {
    const content = await readFile(dist(`${target}/content.js`), 'utf8');
    assert.ok(!/^export[\s{]/m.test(content), `${target}/content.js must not export at top level`);
  }
});

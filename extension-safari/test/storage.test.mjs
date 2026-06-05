import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getSettings, setSettings, DEFAULTS } from '../src/shared/storage.js';

function mockChrome() {
  const data = {};
  globalThis.chrome = {
    storage: {
      sync: {
        async get(keys) { const out = {}; for (const k of keys) if (k in data) out[k] = data[k]; return out; },
        async set(values) { Object.assign(data, values); },
      },
    },
  };
  return data;
}

afterEach(() => { delete globalThis.chrome; delete globalThis.browser; });

test('returns defaults when nothing is stored', async () => {
  mockChrome();
  assert.equal((await getSettings()).portalUrl, DEFAULTS.portalUrl);
});

test('round-trips a saved portal URL', async () => {
  mockChrome();
  await setSettings({ portalUrl: 'http://192.168.1.10:4000' });
  assert.equal((await getSettings()).portalUrl, 'http://192.168.1.10:4000');
});

test('falls back to defaults when no storage API is present', async () => {
  assert.deepEqual(await getSettings(), { ...DEFAULTS });
});

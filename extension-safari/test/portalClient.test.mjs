import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { portal } from '../src/shared/portalClient.js';

const realFetch = globalThis.fetch;
function mockStorage(portalUrl = 'http://localhost:4000') {
  globalThis.chrome = { storage: { sync: { async get() { return { portalUrl }; }, async set() {} } } };
}
afterEach(() => { globalThis.fetch = realFetch; delete globalThis.chrome; delete globalThis.browser; });

test('getPacket targets the configured host and parses JSON', async () => {
  mockStorage('http://localhost:4000');
  let called = '';
  globalThis.fetch = async (url) => {
    called = url;
    return { ok: true, status: 200, json: async () => ({ candidate: { fields: [] }, documents: [], answers: [] }) };
  };
  const p = await portal.getPacket(7);
  assert.equal(called, 'http://localhost:4000/api/applications/7/packet');
  assert.ok(Array.isArray(p.documents));
});

test('surfaces a clear error when the portal is unreachable', async () => {
  mockStorage();
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(() => portal.testConnection(), /Failed to fetch/);
});

test('throws the server-provided error message on a non-ok response', async () => {
  mockStorage();
  globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => ({ error: 'Not found' }) });
  await assert.rejects(() => portal.getPacket(1), /Not found/);
});

test('requires a portal URL to be configured', async () => {
  globalThis.chrome = { storage: { sync: { async get() { return { portalUrl: '' }; }, async set() {} } } };
  await assert.rejects(() => portal.listApplications(), /portal URL/);
});

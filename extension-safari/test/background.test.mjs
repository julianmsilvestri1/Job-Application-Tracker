import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { handlePortalMessage } from '../src/background.js';
import { bgPortal } from '../src/shared/bgPortal.js';

const mockClient = {
  async testConnection() { return { ok: true }; },
  async getPacket(id) { return { id }; },
  async triggerApply() { throw new Error('boom'); },
};

test('handlePortalMessage routes to the client and wraps the result', async () => {
  assert.deepEqual(await handlePortalMessage({ type: 'PORTAL', method: 'getPacket', args: [9] }, mockClient), { ok: true, data: { id: 9 } });
});

test('handlePortalMessage reports thrown errors and unknown methods', async () => {
  assert.deepEqual(await handlePortalMessage({ type: 'PORTAL', method: 'triggerApply', args: [] }, mockClient), { ok: false, error: 'boom' });
  const unknown = await handlePortalMessage({ type: 'PORTAL', method: 'nope' }, mockClient);
  assert.equal(unknown.ok, false);
  assert.match(unknown.error, /Unknown method/);
});

test('handlePortalMessage ignores non-PORTAL messages', async () => {
  assert.equal(await handlePortalMessage({ type: 'OTHER' }, mockClient), undefined);
  assert.equal(await handlePortalMessage(null, mockClient), undefined);
});

// bgPortal proxies through runtime.sendMessage and unwraps { ok, data }.
afterEach(() => { delete globalThis.chrome; delete globalThis.browser; });

test('bgPortal resolves data from a successful background response', async () => {
  let sent = null;
  globalThis.chrome = { runtime: { sendMessage: (msg, cb) => { sent = msg; cb({ ok: true, data: [{ id: 1 }] }); } } };
  const apps = await bgPortal.listApplications();
  assert.deepEqual(sent, { type: 'PORTAL', method: 'listApplications', args: [] });
  assert.deepEqual(apps, [{ id: 1 }]);
});

test('bgPortal rejects when the background reports an error', async () => {
  globalThis.chrome = { runtime: { sendMessage: (_msg, cb) => cb({ ok: false, error: 'nope' }) } };
  await assert.rejects(() => bgPortal.getPacket(1), /nope/);
});

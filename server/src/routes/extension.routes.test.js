import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import extensionRouter from './extension.js';

// The success path requires a live Chrome/CDP + Stagehand, so here we only
// assert the route's input validation (the pipeline itself is covered by
// stagehandRunner.test.js with a mocked Stagehand client).
test('POST /api/extension/trigger-apply requires applicationId and url', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/extension', extensionRouter);

  await new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const base = `http://127.0.0.1:${server.address().port}`;
      try {
        const missing = await fetch(`${base}/api/extension/trigger-apply`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        });
        assert.equal(missing.status, 400);

        const partial = await fetch(`${base}/api/extension/trigger-apply`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ applicationId: 1 }),
        });
        assert.equal(partial.status, 400);
        resolve();
      } catch (e) {
        reject(e);
      } finally {
        server.close();
      }
    });
  });
});

test('PORTAL_TOKEN gates the extension API (closes the no-Origin bypass)', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/extension', extensionRouter);
  process.env.PORTAL_TOKEN = 'secret123';

  await new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const base = `http://127.0.0.1:${server.address().port}`;
      const post = (headers) => fetch(`${base}/api/extension/trigger-apply`, {
        method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({}),
      });
      try {
        // No token (and no Origin) → 401, not a bypass.
        assert.equal((await post({})).status, 401);
        // Wrong token → 401.
        assert.equal((await post({ 'x-portal-token': 'nope' })).status, 401);
        // Correct token → passes the gate (then 400 for the empty body).
        assert.equal((await post({ 'x-portal-token': 'secret123' })).status, 400);
        // Authorization: Bearer form also accepted.
        assert.equal((await post({ authorization: 'Bearer secret123' })).status, 400);
        resolve();
      } catch (e) {
        reject(e);
      } finally {
        delete process.env.PORTAL_TOKEN;
        server.close();
      }
    });
  });
});

test('with an explicit allowlist, only the listed extension origin is accepted', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/extension', extensionRouter);
  process.env.EXTENSION_ALLOWED_ORIGINS = 'chrome-extension://good';

  await new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const base = `http://127.0.0.1:${server.address().port}`;
      const post = (origin) => fetch(`${base}/api/extension/trigger-apply`, {
        method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify({}),
      });
      try {
        assert.equal((await post('chrome-extension://evil')).status, 403, 'unlisted extension origin rejected');
        assert.equal((await post('chrome-extension://good')).status, 400, 'listed extension origin passes the gate');
        resolve();
      } catch (e) {
        reject(e);
      } finally {
        delete process.env.EXTENSION_ALLOWED_ORIGINS;
        server.close();
      }
    });
  });
});

test('bridge read endpoints serve the extension (apply-policy 200, packet 404 for missing)', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/extension', extensionRouter);

  await new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const base = `http://127.0.0.1:${server.address().port}`;
      const h = { origin: 'chrome-extension://abc' };
      try {
        const policy = await fetch(`${base}/api/extension/apply-policy`, { headers: h });
        assert.equal(policy.status, 200);
        assert.equal((await policy.json()).canSubmit, false, 'auto-submit OFF by default');
        const packet = await fetch(`${base}/api/extension/packet/99999999`, { headers: h });
        assert.equal(packet.status, 404);
        resolve();
      } catch (e) {
        reject(e);
      } finally {
        server.close();
      }
    });
  });
});

test('the extension API is origin-locked: web origins are rejected, extension origins allowed', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/extension', extensionRouter);

  await new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const base = `http://127.0.0.1:${server.address().port}`;
      const post = (origin) => fetch(`${base}/api/extension/trigger-apply`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin },
        body: JSON.stringify({}),
      });
      try {
        const evil = await post('https://evil.example.com');
        assert.equal(evil.status, 403, 'a website origin is rejected');

        const ext = await post('chrome-extension://abcdefghijklmnop');
        assert.equal(ext.status, 400, 'an extension origin passes CORS (then hits validation)');
        assert.equal(ext.headers.get('access-control-allow-origin'), 'chrome-extension://abcdefghijklmnop');

        const safari = await post('safari-web-extension://1234-ABCD');
        assert.equal(safari.status, 400, 'a Safari extension origin passes CORS');
        resolve();
      } catch (e) {
        reject(e);
      } finally {
        server.close();
      }
    });
  });
});

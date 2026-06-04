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

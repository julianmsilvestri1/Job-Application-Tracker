import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { completeGemini, geminiEnabled, resetGeminiCallCounter } from './gemini.js';

const realKey = process.env.GEMINI_API_KEY;
const realModel = process.env.GEMINI_MODEL;
const realCap = process.env.GEMINI_DAILY_CALL_CAP;
const realFetch = global.fetch;

afterEach(() => {
  if (realKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = realKey;
  if (realModel === undefined) delete process.env.GEMINI_MODEL; else process.env.GEMINI_MODEL = realModel;
  if (realCap === undefined) delete process.env.GEMINI_DAILY_CALL_CAP; else process.env.GEMINI_DAILY_CALL_CAP = realCap;
  global.fetch = realFetch;
  resetGeminiCallCounter();
});

test('geminiEnabled reflects GEMINI_API_KEY', () => {
  delete process.env.GEMINI_API_KEY;
  assert.equal(geminiEnabled(), false);
  process.env.GEMINI_API_KEY = 'x';
  assert.equal(geminiEnabled(), true);
});

test('completeGemini throws immediately with no key set (no network call)', async () => {
  delete process.env.GEMINI_API_KEY;
  let called = false;
  global.fetch = async () => { called = true; return { ok: true, json: async () => ({}) }; };
  await assert.rejects(() => completeGemini({ system: 's', user: 'u' }));
  assert.equal(called, false);
});

test('completeGemini calls the strongest free model first', async () => {
  process.env.GEMINI_API_KEY = 'k';
  let url = '';
  global.fetch = async (u) => {
    url = u;
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'hi' }] } }] }) };
  };
  const out = await completeGemini({ system: 's', user: 'u' });
  assert.equal(out, 'hi');
  assert.match(url, /gemini-2\.5-pro/);
});

test('completeGemini steps down through the model priority list on 429s', async () => {
  process.env.GEMINI_API_KEY = 'k';
  const urls = [];
  global.fetch = async (u) => {
    urls.push(u);
    if (u.includes('gemini-2.5-pro') || u.includes('gemini-2.5-flash')) {
      return { ok: false, status: 429, text: async () => 'quota' };
    }
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'from flash-2.0' }] } }] }) };
  };
  const out = await completeGemini({ system: 's', user: 'u' });
  assert.equal(out, 'from flash-2.0');
  assert.equal(urls.length, 3);
  assert.match(urls[2], /gemini-2\.0-flash/);
});

test('completeGemini surfaces a non-quota error immediately without trying other models', async () => {
  process.env.GEMINI_API_KEY = 'k';
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return { ok: false, status: 401, text: async () => 'invalid api key' };
  };
  await assert.rejects(() => completeGemini({ system: 's', user: 'u' }), /401/);
  assert.equal(calls, 1, 'an auth error should not be masked by retrying weaker models');
});

test('completeGemini respects GEMINI_MODEL override (skips the priority list)', async () => {
  process.env.GEMINI_API_KEY = 'k';
  process.env.GEMINI_MODEL = 'gemini-2.0-flash';
  let url = '';
  global.fetch = async (u) => {
    url = u;
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }) };
  };
  await completeGemini({ system: 's', user: 'u' });
  assert.match(url, /gemini-2\.0-flash/);
});

test('completeGemini parses JSON output when jsonSchema is given', async () => {
  process.env.GEMINI_API_KEY = 'k';
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text: '{"score": 42}' }] } }] }),
  });
  const out = await completeGemini({ system: 's', user: 'u', jsonSchema: { type: 'object' } });
  assert.deepEqual(out, { score: 42 });
});

test('completeGemini enforces its own daily call cap independent of Google quota errors', async () => {
  process.env.GEMINI_API_KEY = 'k';
  process.env.GEMINI_DAILY_CALL_CAP = '2';
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }) };
  };
  await completeGemini({ system: 's', user: 'u' });
  await completeGemini({ system: 's', user: 'u' });
  await assert.rejects(() => completeGemini({ system: 's', user: 'u' }), /daily call cap/);
  assert.equal(calls, 2, 'the third call must be refused locally, never reaching the network');
});

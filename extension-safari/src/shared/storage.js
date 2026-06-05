// Storage abstraction over `browser.storage` (Safari/Firefox) and
// `chrome.storage` (Chromium). MV3 returns promises in both engines; we read
// the namespace lazily so tests can inject a mock on globalThis.
export const DEFAULTS = { portalUrl: 'http://localhost:4000' };

function area() {
  const api = globalThis.browser ?? globalThis.chrome;
  return api?.storage?.sync ?? api?.storage?.local ?? null;
}

export async function getSettings(defaults = DEFAULTS) {
  const store = area();
  if (!store) return { ...defaults };
  const got = await store.get(Object.keys(defaults));
  return { ...defaults, ...(got || {}) };
}

export async function setSettings(values) {
  const store = area();
  if (!store) return;
  await store.set(values);
}

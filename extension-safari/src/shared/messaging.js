// Cross-engine runtime.sendMessage wrapper. Safari/Firefox expose a
// promise-based `browser.*`; Chromium uses a callback on `chrome.*`. The API is
// resolved lazily (at call time) so it works regardless of load order.
export function sendToBackground(message) {
  const promiseBased = Boolean(globalThis.browser?.runtime?.sendMessage);
  const api = globalThis.browser ?? globalThis.chrome;
  if (promiseBased) return api.runtime.sendMessage(message);
  return new Promise((resolve, reject) => {
    api.runtime.sendMessage(message, (res) => {
      const err = api.runtime?.lastError;
      if (err) reject(new Error(err.message));
      else resolve(res);
    });
  });
}

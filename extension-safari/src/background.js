// Background service worker. It owns all portal network calls so requests carry
// the EXTENSION origin (with host permissions) rather than the page origin.
// This is the correct MV3 pattern and keeps the content-script inline review
// working once /api/extension/* CORS is locked to extension origins (Unit 2.7).
import { portal } from './shared/portalClient.js';

// Pure, testable: route a { type:'PORTAL', method, args } message to the client.
export async function handlePortalMessage(message, client = portal) {
  if (!message || message.type !== 'PORTAL') return undefined;
  const fn = client[message.method];
  if (typeof fn !== 'function') return { ok: false, error: `Unknown method: ${message.method}` };
  try {
    return { ok: true, data: await fn(...(message.args || [])) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

const api = globalThis.browser ?? globalThis.chrome;
api?.runtime?.onMessage?.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== 'PORTAL') return undefined;
  handlePortalMessage(message).then(sendResponse);
  return true; // keep the channel open for the async response
});

// Portal API client used by the popup/options. No hardcoded host — the portal
// URL comes from extension storage (set in options). The extension is a Trigger
// UI: it reads the packet for preview/copy and triggers server-side apply; it
// never scrapes or fills the page DOM (that is Stagehand's job, Unit 2.4).
import { getSettings } from './storage.js';

async function req(path, options = {}) {
  const { portalUrl, portalToken } = await getSettings();
  const base = String(portalUrl || '').replace(/\/+$/, '');
  if (!base) throw new Error('Set your portal URL in the extension options.');
  const headers = { ...(options.headers || {}) };
  if (portalToken) headers['X-Portal-Token'] = portalToken; // required by /api/extension when configured
  const res = await fetch(`${base}/api${path}`, { ...options, headers });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try { const d = await res.json(); if (d?.error) msg = d.error; } catch { /* non-JSON body */ }
    throw new Error(msg);
  }
  return res.status === 204 ? null : res.json();
}

export const portal = {
  testConnection: () => req('/health'),
  applyPolicy: () => req('/assistant/apply-policy'),
  listApplications: () => req('/applications'),
  getPacket: (id) => req(`/applications/${id}/packet`),
  triggerApply: (applicationId, url) => req('/extension/trigger-apply', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ applicationId, url }),
  }),
};

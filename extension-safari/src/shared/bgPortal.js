// Portal client for contexts that must not fetch cross-origin directly (the
// content script runs in the page origin). Proxies every call to the background
// service worker, which performs the fetch with the extension origin.
import { sendToBackground } from './messaging.js';

function call(method, ...args) {
  return sendToBackground({ type: 'PORTAL', method, args }).then((res) => {
    if (!res) throw new Error('No response from the extension background.');
    if (!res.ok) throw new Error(res.error || 'Background request failed.');
    return res.data;
  });
}

export const bgPortal = {
  testConnection: () => call('testConnection'),
  listApplications: () => call('listApplications'),
  getPacket: (id) => call('getPacket', id),
  triggerApply: (applicationId, url) => call('triggerApply', applicationId, url),
};

// Turn a failed "Test connection" into actionable guidance. Pure + tested.
// Browsers report unreachable host and CORS the same way (a generic network
// TypeError), so we lead with the most likely local cause.
const LAN = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

export function diagnoseConnection(url, error) {
  const raw = String(url || '').trim();
  if (!raw) return 'Enter your portal URL (e.g. http://192.168.1.42:4000).';

  let parsed;
  try { parsed = new URL(raw); } catch { return 'That portal URL is not valid. Use e.g. http://192.168.1.42:4000.'; }

  const msg = (error && error.message) || String(error || '');
  const networkish = /failed to fetch|networkerror|load failed|fetch failed|^fetch$/i.test(msg);
  if (networkish) {
    if (parsed.protocol === 'https:' && LAN.test(parsed.hostname)) {
      return `Could not reach ${parsed.host}. Local portals run over http, not https — try http://${parsed.host}.`;
    }
    return `Could not reach ${parsed.host} (unreachable or blocked). Check the portal is running with HOST=0.0.0.0, that this device is on the same Wi-Fi, and allow local network access if prompted.`;
  }
  return msg || `Could not connect to ${parsed.host}.`;
}

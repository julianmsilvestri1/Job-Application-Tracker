// Shared helpers for job-board providers.

const DEFAULT_TIMEOUT = 9000;
const USER_AGENT =
  'JobApplicationPortal/1.0 (+https://github.com/julianmsilvestri1/job-application-tracker)';

// fetch with a hard timeout and a sensible User-Agent. Some free boards
// (RemoteOK in particular) reject requests without a UA.
export async function fetchJson(url, { headers = {}, timeout = DEFAULT_TIMEOUT, ...rest } = {}) {
  const res = await fetch(url, {
    ...rest,
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) throw new Error(`${res.status} ${await safeText(res)}`.trim());
  return res.json();
}

export async function safeText(res) {
  try { return (await res.text()).slice(0, 200); } catch { return ''; }
}

export function stripHtml(s = '') {
  return String(s).replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}

export function formatSalary(min, max, currency = '$') {
  const fmt = (n) => `${currency}${Math.round(n).toLocaleString()}`;
  if (min && max) return `${fmt(min)} – ${fmt(max)}`;
  if (min || max) return fmt(min || max);
  return '';
}

// Stable id derived from a string (for boards without their own job ids).
export function hash(prefix, s = '') {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return `${prefix}${(h >>> 0).toString(36)}`;
}

// Canonical form of a posting URL for de-duplication: lowercase host (no www),
// no trailing slash, no hash, common tracking params dropped. Returns '' for
// unparseable input. The query is otherwise preserved (some boards put the job
// id there), so distinct postings stay distinct.
const TRACKING_PARAM = /^(utm_|ref$|source$|src$|trk$|recommended|gh_src$)/i;
export function normalizeUrl(url = '') {
  try {
    const u = new URL(url);
    u.hash = '';
    for (const k of [...u.searchParams.keys()]) {
      if (TRACKING_PARAM.test(k)) u.searchParams.delete(k);
    }
    const host = u.host.toLowerCase().replace(/^www\./, '');
    const path = u.pathname.replace(/\/+$/, '');
    const qs = u.searchParams.toString();
    return `${host}${path}${qs ? `?${qs}` : ''}`;
  } catch {
    return '';
  }
}

// Many free boards have no server-side keyword/location search, so we filter
// the returned listings locally. Every query term must appear somewhere in the
// job's text; location (when given) must appear in the job's location/text.
export function localFilter(jobs, { query = '', location = '' } = {}) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const loc = location.toLowerCase().trim();
  return jobs.filter((j) => {
    const hay = `${j.title} ${j.company} ${j.description} ${j.location}`.toLowerCase();
    if (terms.length && !terms.every((t) => hay.includes(t))) return false;
    if (loc && loc !== 'remote' && !`${j.location}`.toLowerCase().includes(loc) && !hay.includes(loc)) {
      return false;
    }
    return true;
  });
}

export function looksRemote(...parts) {
  return /remote|anywhere|work from home|wfh/i.test(parts.join(' '));
}

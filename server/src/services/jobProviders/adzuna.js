// Adzuna provider. Free API that aggregates listings from Indeed,
// LinkedIn-adjacent boards and thousands of other sites.
// Docs: https://developer.adzuna.com/

const BASE = 'https://api.adzuna.com/v1/api/jobs';

export const id = 'adzuna';
export const label = 'Adzuna';

export function isConfigured() {
  return Boolean(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY);
}

export async function search({ query = '', location = '', remote = false, page = 1 } = {}) {
  if (!isConfigured()) return [];

  const country = (process.env.ADZUNA_COUNTRY || 'us').toLowerCase();
  const params = new URLSearchParams({
    app_id: process.env.ADZUNA_APP_ID,
    app_key: process.env.ADZUNA_APP_KEY,
    results_per_page: '25',
    'content-type': 'application/json',
  });
  if (query) params.set('what', query);
  if (location) params.set('where', location);
  if (remote) params.set('what_or', `${query} remote`.trim());

  const url = `${BASE}/${country}/search/${page}?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Adzuna ${res.status}: ${await safeText(res)}`);
  const data = await res.json();

  return (data.results || []).map((j) => ({
    externalId: String(j.id),
    source: id,
    title: j.title || '',
    company: j.company?.display_name || '',
    location: j.location?.display_name || '',
    url: j.redirect_url || '',
    salary: formatSalary(j.salary_min, j.salary_max),
    description: stripHtml(j.description || ''),
    remote: /remote/i.test(`${j.title} ${j.description}`),
    postedAt: j.created || null,
  }));
}

function formatSalary(min, max) {
  if (!min && !max) return '';
  const fmt = (n) => `$${Math.round(n).toLocaleString()}`;
  if (min && max) return `${fmt(min)} – ${fmt(max)}`;
  return fmt(min || max);
}

function stripHtml(s) {
  return s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

async function safeText(res) {
  try { return await res.text(); } catch { return ''; }
}

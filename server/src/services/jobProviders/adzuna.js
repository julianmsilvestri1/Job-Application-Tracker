// Adzuna provider. Free API that aggregates listings from Indeed,
// LinkedIn-adjacent boards and thousands of other sites.
// Docs: https://developer.adzuna.com/  (needs free app id + key)
import { fetchJson, stripHtml, formatSalary, looksRemote } from './util.js';

const BASE = 'https://api.adzuna.com/v1/api/jobs';

export const id = 'adzuna';
export const label = 'Adzuna';
export const requiresKey = true;

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
  if (query) params.set('what', remote ? `${query} remote`.trim() : query);
  else if (remote) params.set('what', 'remote');
  if (location) params.set('where', location);

  const data = await fetchJson(`${BASE}/${country}/search/${page}?${params}`);
  return (data.results || []).map((j) => ({
    externalId: String(j.id),
    source: id,
    title: j.title || '',
    company: j.company?.display_name || '',
    location: j.location?.display_name || '',
    url: j.redirect_url || '',
    salary: formatSalary(j.salary_min, j.salary_max),
    description: stripHtml(j.description || ''),
    remote: looksRemote(j.title, j.description),
    postedAt: j.created || null,
  }));
}

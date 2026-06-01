// Arbeitnow provider. Free, no key — broad job board (EU-heavy + global remote).
// Docs: https://documenter.getpostman.com/view/18545278/UVJbJdKh
import { fetchJson, stripHtml } from './util.js';

export const id = 'arbeitnow';
export const label = 'Arbeitnow';
export const requiresKey = false;
export const clientFilter = true;

export function isConfigured() {
  return true;
}

export async function search({ page = 1 } = {}) {
  const data = await fetchJson(`https://www.arbeitnow.com/api/job-board-api?page=${page}`);
  return (data.data || []).map((j) => ({
    externalId: j.slug || j.url || j.title,
    source: id,
    title: j.title || '',
    company: j.company_name || '',
    location: j.location || (j.remote ? 'Remote' : ''),
    url: j.url || '',
    salary: '',
    description: stripHtml(j.description || (j.tags || []).join(', ')),
    remote: Boolean(j.remote),
    postedAt: j.created_at ? new Date(j.created_at * 1000).toISOString() : null,
  }));
}

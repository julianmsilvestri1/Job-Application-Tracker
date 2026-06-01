// Remotive provider. No API key required — returns remote jobs only.
// Docs: https://remotive.com/api/remote-jobs
import { fetchJson, stripHtml } from './util.js';

export const id = 'remotive';
export const label = 'Remotive';
export const requiresKey = false;

export function isConfigured() {
  return true; // no credentials needed
}

export async function search({ query = '', limit = 30 } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (query) params.set('search', query);

  const data = await fetchJson(`https://remotive.com/api/remote-jobs?${params}`);
  return (data.jobs || []).map((j) => ({
    externalId: String(j.id),
    source: id,
    title: j.title || '',
    company: j.company_name || '',
    location: j.candidate_required_location || 'Remote',
    url: j.url || '',
    salary: j.salary || '',
    description: stripHtml(j.description || ''),
    remote: true,
    postedAt: j.publication_date || null,
  }));
}

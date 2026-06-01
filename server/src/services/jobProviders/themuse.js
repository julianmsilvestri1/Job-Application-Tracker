// The Muse provider. Free, no key required (an optional key raises limits).
// Curated roles from well-known companies. Docs: https://www.themuse.com/developers/api/v2
// The Muse has no free-text search, so we fetch a few pages and filter locally.
import { fetchJson, stripHtml, looksRemote } from './util.js';

export const id = 'themuse';
export const label = 'The Muse';
export const requiresKey = false;
export const clientFilter = true; // aggregator applies keyword/location filter

export function isConfigured() {
  return true;
}

export async function search({ remote = false } = {}) {
  const key = process.env.THE_MUSE_API_KEY;
  const pages = await Promise.allSettled([0, 1, 2].map((page) => {
    const params = new URLSearchParams({ page: String(page) });
    if (remote) params.set('location', 'Flexible / Remote');
    if (key) params.set('api_key', key);
    return fetchJson(`https://www.themuse.com/api/public/jobs?${params}`);
  }));

  const jobs = [];
  for (const p of pages) {
    if (p.status !== 'fulfilled') continue;
    for (const j of p.value.results || []) {
      const location = (j.locations || []).map((l) => l.name).join(', ');
      jobs.push({
        externalId: String(j.id),
        source: id,
        title: j.name || '',
        company: j.company?.name || '',
        location: location || 'See posting',
        url: j.refs?.landing_page || '',
        salary: '',
        description: stripHtml(j.contents || ''),
        remote: looksRemote(location),
        postedAt: j.publication_date || null,
      });
    }
  }
  return jobs;
}

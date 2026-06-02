// Jooble provider. Free API aggregating listings from many job boards.
// Docs: https://jooble.org/api/about  (needs free key)
import { fetchJson, stripHtml, hash, looksRemote, normalizeUrl } from './util.js';

export const id = 'jooble';
export const label = 'Jooble';
export const requiresKey = true;

export function isConfigured() {
  return Boolean(process.env.JOOBLE_API_KEY);
}

export async function search({ query = '', location = '', page = 1 } = {}) {
  if (!isConfigured()) return [];

  const data = await fetchJson(`https://jooble.org/api/${process.env.JOOBLE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keywords: query, location, page: String(page) }),
  });

  return (data.jobs || []).map((j) => ({
    // Hash the canonical link so the same posting yields a stable id across searches.
    externalId: hash('j', normalizeUrl(j.link) || j.link || `${j.title}-${j.company}`),
    source: id,
    title: j.title || '',
    company: j.company || '',
    location: j.location || '',
    url: j.link || '',
    salary: j.salary || '',
    description: stripHtml(j.snippet || ''),
    remote: looksRemote(j.title, j.location, j.snippet),
    postedAt: j.updated || null,
  }));
}

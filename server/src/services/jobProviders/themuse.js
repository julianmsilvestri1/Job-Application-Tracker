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

// The Muse has no free-text search but does filter by a fixed set of
// categories. Mapping the query to categories narrows results before the
// local keyword filter, improving precision per page fetched.
const MUSE_CATEGORY_RULES = [
  [/\b(engineer|engineering|developer|software|backend|frontend|full[- ]?stack|devops|programmer)\b/, 'Software Engineering'],
  [/\b(data|machine learning|\bml\b|\bai\b|analytics|scientist)\b/, 'Data Science'],
  [/\b(design|designer|\bux\b|\bui\b)\b/, 'Design and UX'],
  [/\b(product manager|product management)\b/, 'Product Management'],
  [/\b(project manager|program manager)\b/, 'Project Management'],
  [/\b(marketing|seo|content|growth|brand)\b/, 'Marketing & PR'],
  [/\b(sales|account executive|\bsdr\b|\bbdr\b)\b/, 'Sales'],
  [/\b(finance|accounting|financial|accountant)\b/, 'Finance'],
  [/\b(recruiter|recruiting|human resources|\bhr\b|people ops)\b/, 'Human Resources'],
];

export function museCategories(query = '') {
  const q = query.toLowerCase();
  const cats = [];
  for (const [re, cat] of MUSE_CATEGORY_RULES) {
    if (re.test(q) && !cats.includes(cat)) cats.push(cat);
  }
  return cats;
}

export async function search({ remote = false, query = '' } = {}) {
  const key = process.env.THE_MUSE_API_KEY;
  const categories = museCategories(query);
  const pages = await Promise.allSettled([0, 1, 2].map((page) => {
    const params = new URLSearchParams({ page: String(page) });
    if (remote) params.set('location', 'Flexible / Remote');
    categories.forEach((c) => params.append('category', c));
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

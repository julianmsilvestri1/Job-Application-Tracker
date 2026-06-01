// Jobicy provider. Free, no key — remote jobs across many industries.
// Docs: https://jobicy.com/jobs-rss-feed#api
import { fetchJson, stripHtml, formatSalary } from './util.js';

export const id = 'jobicy';
export const label = 'Jobicy';
export const requiresKey = false;
export const clientFilter = true;

export function isConfigured() {
  return true;
}

export async function search({ query = '' } = {}) {
  const params = new URLSearchParams({ count: '50' });
  // Jobicy accepts a single keyword tag; we still filter locally afterwards.
  const firstTerm = query.trim().split(/\s+/)[0];
  if (firstTerm) params.set('tag', firstTerm);

  const data = await fetchJson(`https://jobicy.com/api/v2/remote-jobs?${params}`);
  return (data.jobs || []).map((j) => ({
    externalId: String(j.id),
    source: id,
    title: j.jobTitle || '',
    company: j.companyName || '',
    location: j.jobGeo || 'Remote',
    url: j.url || '',
    salary: formatSalary(j.annualSalaryMin, j.annualSalaryMax, j.salaryCurrency || '$'),
    description: stripHtml(j.jobExcerpt || ''),
    remote: true,
    postedAt: j.pubDate || null,
  }));
}

// RemoteOK provider. Free, no key — remote tech/startup roles.
// Docs: https://remoteok.com/api  (first array element is metadata, not a job)
import { fetchJson, stripHtml, formatSalary } from './util.js';

export const id = 'remoteok';
export const label = 'RemoteOK';
export const requiresKey = false;
export const clientFilter = true;

export function isConfigured() {
  return true;
}

export async function search() {
  const data = await fetchJson('https://remoteok.com/api');
  const rows = Array.isArray(data) ? data.filter((r) => r && r.id && r.position) : [];
  return rows.map((j) => ({
    externalId: String(j.id),
    source: id,
    title: j.position || '',
    company: j.company || '',
    location: j.location || 'Remote',
    url: j.url || j.apply_url || '',
    salary: formatSalary(j.salary_min, j.salary_max),
    description: stripHtml(j.description || (j.tags || []).join(', ')),
    remote: true,
    postedAt: j.date || null,
  }));
}

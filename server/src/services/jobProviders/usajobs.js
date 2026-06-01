// USAJOBS provider. Official US federal jobs API. Free, but needs an API key
// and your registration email. Docs: https://developer.usajobs.gov/
import { fetchJson, stripHtml, formatSalary } from './util.js';

export const id = 'usajobs';
export const label = 'USAJOBS (federal)';
export const requiresKey = true;

export function isConfigured() {
  return Boolean(process.env.USAJOBS_API_KEY && process.env.USAJOBS_EMAIL);
}

export async function search({ query = '', location = '', page = 1 } = {}) {
  if (!isConfigured()) return [];

  const params = new URLSearchParams({ ResultsPerPage: '25', Page: String(page) });
  if (query) params.set('Keyword', query);
  if (location) params.set('LocationName', location);

  const data = await fetchJson(`https://data.usajobs.gov/api/search?${params}`, {
    headers: {
      Host: 'data.usajobs.gov',
      'User-Agent': process.env.USAJOBS_EMAIL,
      'Authorization-Key': process.env.USAJOBS_API_KEY,
    },
  });

  const items = data.SearchResult?.SearchResultItems || [];
  return items.map(({ MatchedObjectDescriptor: d = {} }) => {
    const pay = (d.PositionRemuneration || [])[0] || {};
    return {
      externalId: String(d.PositionID || d.PositionURI),
      source: id,
      title: d.PositionTitle || '',
      company: d.OrganizationName || d.DepartmentName || '',
      location: d.PositionLocationDisplay || '',
      url: d.PositionURI || '',
      salary: formatSalary(Number(pay.MinimumRange), Number(pay.MaximumRange)),
      description: stripHtml(d.UserArea?.Details?.JobSummary || d.QualificationSummary || ''),
      remote: /remote|telework/i.test(d.PositionLocationDisplay || ''),
      postedAt: d.PublicationStartDate || null,
    };
  });
}

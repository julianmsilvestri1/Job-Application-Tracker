// Remotive provider. No API key required — returns remote jobs only.
// Docs: https://remotive.com/api/remote-jobs

export const id = 'remotive';
export const label = 'Remotive (remote)';

// Always available; no credentials needed.
export function isConfigured() {
  return true;
}

export async function search({ query = '', limit = 25 } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (query) params.set('search', query);

  const res = await fetch(`https://remotive.com/api/remote-jobs?${params.toString()}`);
  if (!res.ok) throw new Error(`Remotive ${res.status}: ${await safeText(res)}`);
  const data = await res.json();

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

function stripHtml(s) {
  return s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

async function safeText(res) {
  try { return await res.text(); } catch { return ''; }
}

// Jooble provider. Free API aggregating listings from many job boards.
// Docs: https://jooble.org/api/about

export const id = 'jooble';
export const label = 'Jooble';

export function isConfigured() {
  return Boolean(process.env.JOOBLE_API_KEY);
}

export async function search({ query = '', location = '', page = 1 } = {}) {
  if (!isConfigured()) return [];

  const url = `https://jooble.org/api/${process.env.JOOBLE_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keywords: query, location, page: String(page) }),
  });
  if (!res.ok) throw new Error(`Jooble ${res.status}: ${await safeText(res)}`);
  const data = await res.json();

  return (data.jobs || []).map((j) => ({
    // Jooble has no stable id; derive one from the link.
    externalId: hash(j.link || `${j.title}-${j.company}`),
    source: id,
    title: j.title || '',
    company: j.company || '',
    location: j.location || '',
    url: j.link || '',
    salary: j.salary || '',
    description: stripHtml(j.snippet || ''),
    remote: /remote/i.test(`${j.title} ${j.location} ${j.snippet}`),
    postedAt: j.updated || null,
  }));
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return `j${(h >>> 0).toString(36)}`;
}

function stripHtml(s) {
  return s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

async function safeText(res) {
  try { return await res.text(); } catch { return ''; }
}

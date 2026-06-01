// Aggregates all job-board providers behind one normalized interface.
// Adding a new board is as simple as dropping a module in this folder and
// registering it here — the rest of the app never needs to change.
import * as adzuna from './adzuna.js';
import * as jooble from './jooble.js';
import * as remotive from './remotive.js';

const PROVIDERS = [adzuna, jooble, remotive];

export function providerStatus() {
  return PROVIDERS.map((p) => ({
    id: p.id,
    label: p.label,
    configured: p.isConfigured(),
  }));
}

/**
 * Search every configured provider in parallel and merge the results.
 * A single failing provider never breaks the whole search.
 */
export async function searchAll(opts = {}) {
  const wanted = opts.sources?.length
    ? PROVIDERS.filter((p) => opts.sources.includes(p.id))
    : PROVIDERS;

  // Only query providers that are actually configured; keep this list so the
  // settled results line up with the right provider when reporting errors.
  const active = wanted.filter((p) => p.isConfigured());
  const settled = await Promise.allSettled(active.map((p) => p.search(opts)));

  const errors = [];
  const jobs = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') jobs.push(...r.value);
    else errors.push({ source: active[i].id, message: r.reason?.message || String(r.reason) });
  });

  return { jobs: dedupe(jobs), errors };
}

// Drop duplicates that show up across boards (same company + title).
function dedupe(jobs) {
  const seen = new Set();
  const out = [];
  for (const j of jobs) {
    const key = `${j.company}|${j.title}`.toLowerCase().trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(j);
  }
  return out;
}

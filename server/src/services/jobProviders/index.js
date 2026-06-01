// Aggregates all job-board providers behind one normalized interface.
// Adding a board is as simple as dropping a module in this folder and
// registering it here — nothing else in the app needs to change.
import { localFilter } from './util.js';
import * as adzuna from './adzuna.js';
import * as jooble from './jooble.js';
import * as usajobs from './usajobs.js';
import * as remotive from './remotive.js';
import * as themuse from './themuse.js';
import * as remoteok from './remoteok.js';
import * as arbeitnow from './arbeitnow.js';
import * as jobicy from './jobicy.js';

const PROVIDERS = [adzuna, jooble, usajobs, remotive, themuse, remoteok, arbeitnow, jobicy];

// Small in-memory cache so repeated/identical searches are instant and we
// stay friendly to the free APIs' rate limits.
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function providerStatus() {
  return PROVIDERS.map((p) => ({
    id: p.id,
    label: p.label,
    requiresKey: Boolean(p.requiresKey),
    configured: p.isConfigured(),
  }));
}

/**
 * Search every configured provider in parallel and merge the results.
 * A single failing or slow provider never breaks the whole search.
 */
export async function searchAll(opts = {}) {
  const wanted = opts.sources?.length
    ? PROVIDERS.filter((p) => opts.sources.includes(p.id))
    : PROVIDERS;
  const active = wanted.filter((p) => p.isConfigured());

  const settled = await Promise.allSettled(active.map((p) => runProvider(p, opts)));

  const errors = [];
  let jobs = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') jobs.push(...r.value);
    else errors.push({ source: active[i].id, message: cleanError(r.reason) });
  });

  jobs = dedupe(jobs);
  sortByRecency(jobs);
  return { jobs, errors, sourcesQueried: active.map((p) => p.id) };
}

async function runProvider(provider, opts) {
  const key = `${provider.id}|${JSON.stringify(opts)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.jobs;

  let jobs = await provider.search(opts);
  // Boards without server-side search get filtered here.
  if (provider.clientFilter) jobs = localFilter(jobs, opts);
  if (opts.remote) jobs = jobs.filter((j) => j.remote || j.source === 'remotive');

  cache.set(key, { at: Date.now(), jobs });
  return jobs;
}

// Drop duplicates that show up across boards (same company + title).
function dedupe(jobs) {
  const seen = new Set();
  const out = [];
  for (const j of jobs) {
    const key = `${j.company}|${j.title}`.toLowerCase().trim();
    if (key === '|' || seen.has(key)) continue; // skip empties and dups
    seen.add(key);
    out.push(j);
  }
  return out;
}

function sortByRecency(jobs) {
  jobs.sort((a, b) => {
    const ta = Date.parse(a.postedAt) || 0;
    const tb = Date.parse(b.postedAt) || 0;
    return tb - ta;
  });
}

function cleanError(reason) {
  const msg = reason?.message || String(reason);
  if (/aborted|timeout|timed out/i.test(msg)) return 'Timed out — the source was slow to respond.';
  return msg;
}

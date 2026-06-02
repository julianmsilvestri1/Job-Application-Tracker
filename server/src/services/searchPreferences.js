const ARRAY_FIELDS = ['titles', 'locations', 'keywords', 'sources'];

function parseJson(s, fallback) {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((v) => v.trim()).filter(Boolean);
  return [];
}

export function getSearchPreferences(db) {
  db.prepare('INSERT OR IGNORE INTO search_preferences (id) VALUES (1)').run();
  const row = db.prepare('SELECT * FROM search_preferences WHERE id = 1').get();
  const prefs = { ...row, remote_only: Boolean(row.remote_only) };
  for (const field of ARRAY_FIELDS) prefs[field] = parseJson(row[field], []);
  return prefs;
}

export function saveSearchPreferences(db, body = {}) {
  const current = getSearchPreferences(db);
  const next = {
    titles: 'titles' in body ? normalizeList(body.titles) : current.titles,
    locations: 'locations' in body ? normalizeList(body.locations) : current.locations,
    keywords: 'keywords' in body ? normalizeList(body.keywords) : current.keywords,
    sources: 'sources' in body ? normalizeList(body.sources) : current.sources,
    remote_only: 'remote_only' in body ? Boolean(body.remote_only) : current.remote_only,
    min_salary: 'min_salary' in body ? String(body.min_salary || '').trim() : current.min_salary,
  };
  db.prepare(`
    UPDATE search_preferences
    SET titles = @titles, locations = @locations, keywords = @keywords, remote_only = @remote_only,
        min_salary = @min_salary, sources = @sources, updated_at = datetime('now')
    WHERE id = 1
  `).run({
    titles: JSON.stringify(next.titles),
    locations: JSON.stringify(next.locations),
    keywords: JSON.stringify(next.keywords),
    sources: JSON.stringify(next.sources),
    remote_only: next.remote_only ? 1 : 0,
    min_salary: next.min_salary,
  });
  return getSearchPreferences(db);
}

export function preferenceQueries(prefs) {
  const titles = prefs.titles?.length ? prefs.titles : [];
  const keywords = prefs.keywords?.length ? prefs.keywords : [];
  const locations = prefs.locations?.length ? prefs.locations : [''];
  const baseQueries = titles.length ? titles : [keywords.join(' ')];
  const queries = [];

  for (const query of baseQueries.filter(Boolean)) {
    for (const location of locations) {
      queries.push({ query: [query, ...keywords.filter((k) => !query.includes(k)).slice(0, 3)].join(' '), location, remote: prefs.remote_only });
    }
  }

  return queries.slice(0, 6);
}

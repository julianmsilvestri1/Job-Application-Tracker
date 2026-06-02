import { useEffect, useState } from 'react';
import { api } from '../api.js';
import AssistantModal from '../components/AssistantModal.jsx';
import AutofillPanel from '../components/AutofillPanel.jsx';
import { useToast } from '../components/Toaster.jsx';

export default function Search() {
  const [q, setQ] = useState(() => new URLSearchParams(window.location.search).get('q') || '');
  const [location, setLocation] = useState('');
  const [remote, setRemote] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [assistJob, setAssistJob] = useState(null);
  const [showAutofill, setShowAutofill] = useState(false);
  const [providers, setProviders] = useState([]);
  const [selected, setSelected] = useState([]); // empty = all sources
  const [sortByFit, setSortByFit] = useState(true);
  const [fitOpen, setFitOpen] = useState({});
  const [planned, setPlanned] = useState(null);
  const [planning, setPlanning] = useState(false);
  const { toast } = useToast();
  const notify = (m) => toast(m, 'success');
  const visibleJobs = sortJobs(jobs, sortByFit);

  useEffect(() => {
    api.assistantStatus().then((s) => setAiEnabled(s.aiEnabled)).catch((e) => toast(e.message, 'error'));
    api.getProviders().then((p) => setProviders(p.filter((x) => x.configured))).catch((e) => toast(e.message, 'error'));
  }, [toast]);

  function toggleSource(id) {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  async function doSearch(e) {
    e?.preventDefault();
    setLoading(true); setSearched(true);
    try {
      const params = { q, location, remote: String(remote), rank: 'true' };
      if (selected.length) params.sources = selected.join(',');
      const r = await api.searchJobs(params);
      setJobs(r.jobs || []); setErrors(uniqueErrors(r.errors || []));
    } catch (err) {
      setErrors([{ source: 'app', message: err.message }]); setJobs([]);
    }
    setLoading(false);
  }

  async function improveSearch() {
    setPlanning(true); setLoading(true); setSearched(true);
    try {
      const plan = await api.planQueries({ intent: q || 'Find strong-fit roles for me' });
      setPlanned(plan);
      const queries = (plan.queries || []).slice(0, 4);
      if (queries[0]) {
        setQ(queries[0].query);
        setLocation(queries[0].location || '');
        setRemote(Boolean(queries[0].remote));
      }
      const batches = await Promise.all(queries.map((query) => {
        const params = {
          q: query.query,
          location: query.location || '',
          remote: String(Boolean(query.remote)),
          rank: 'true',
        };
        if (selected.length) params.sources = selected.join(',');
        return api.searchJobs(params);
      }));
      const merged = mergeJobs(batches.flatMap((r) => r.jobs || []));
      setJobs(merged);
      setSortByFit(true);
      setErrors(uniqueErrors(batches.flatMap((r) => r.errors || [])));
      notify('Search improved with AI query planning');
    } catch (err) {
      setErrors([{ source: 'assistant', message: err.message }]); setJobs([]);
    } finally {
      setPlanning(false); setLoading(false);
    }
  }

  async function save(job, status) {
    try {
      const app = await api.saveApplication({ ...job, status });
      setJobs((prev) => prev.map((j) =>
        j.externalId === job.externalId && j.source === job.source
          ? { ...j, trackedStatus: status, id: app.id } : j));
      notify(status === 'applied' ? 'Marked as applied' : 'Saved to tracker');
      return app;
    } catch (err) {
      toast(err.message, 'error');
      return null;
    }
  }

  async function saveCoverLetterFromSearch(text) {
    if (!assistJob) return;
    try {
      let appId = assistJob.id;
      if (!appId) {
        const app = await save(assistJob, 'saved');
        if (!app?.id) return;
        appId = app.id;
        setAssistJob((j) => (j ? { ...j, id: appId } : j));
      }
      await api.updateApplication(appId, { cover_letter: text });
      notify('Cover letter saved to tracker');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <div>
      <h1 className="page-title">Find Jobs</h1>
      <p className="page-sub">Search across every connected job board at once.</p>

      <form className="card" onSubmit={doSearch}>
        <div className="grid-2">
          <div className="field">
            <label>Keywords / title</label>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. frontend engineer" />
          </div>
          <div className="field">
            <label>Location</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. New York or Remote" />
          </div>
        </div>
        <div className="row">
          <button className="btn" type="submit" disabled={loading}>
            {loading ? 'Searching…' : 'Search jobs'}
          </button>
          <button type="button" className="btn secondary" onClick={() => setShowAutofill(true)}>
            ⚡ Autofill helper
          </button>
          <button type="button" className="btn secondary" onClick={improveSearch} disabled={planning || loading}>
            {planning ? 'Improving…' : '✨ Improve my search'}
          </button>
          <div className="checkbox-row">
            <input id="remote" type="checkbox" checked={remote} onChange={(e) => setRemote(e.target.checked)} />
            <label htmlFor="remote">Remote only</label>
          </div>
          <div className="checkbox-row">
            <input
              id="fit-sort"
              type="checkbox"
              checked={sortByFit}
              onChange={(e) => {
                setSortByFit(e.target.checked);
              }}
            />
            <label htmlFor="fit-sort">Sort by fit</label>
          </div>
        </div>
        {planned?.queries?.length > 0 && (
          <div className="banner info" style={{ marginTop: 16, marginBottom: 0 }}>
            <strong>Expanded search:</strong>{' '}
            {planned.queries.map((query) => query.query).join(' · ')}
            {planned.rationale && <div className="muted" style={{ marginTop: 4 }}>{planned.rationale}</div>}
          </div>
        )}
        {providers.length > 0 && (
          <>
            <label style={{ marginTop: 16 }}>Sources {selected.length === 0 && '(all)'}</label>
            <div className="tag-input-tags">
              {providers.map((p) => (
                <span
                  key={p.id}
                  className="tag"
                  onClick={() => toggleSource(p.id)}
                  style={{ cursor: 'pointer', opacity: selected.length === 0 || selected.includes(p.id) ? 1 : 0.45 }}
                >
                  {selected.includes(p.id) ? '☑' : '☐'} {p.label}
                </span>
              ))}
            </div>
          </>
        )}
      </form>

      {errors.map((er, i) => (
        <div className="banner" key={i}>{er.source}: {er.message}</div>
      ))}

      {searched && !loading && jobs.length === 0 && (
        <div className="empty">No jobs found. Try different keywords, or add API keys for more sources.</div>
      )}

      {visibleJobs.map((job) => (
        <div className="job" key={`${job.source}-${job.externalId}`}>
          <div className="job-head">
            <div>
              <h3 className="job-title">{job.title}</h3>
              <div className="job-company">{job.company}</div>
            </div>
            {job.trackedStatus && <span className={`badge ${job.trackedStatus}`}>{job.trackedStatus}</span>}
          </div>
          <div className="job-meta">
            <span className="badge source">{job.source}</span>
            {job.fit && (
              <button
                className={`fit-badge fit-${fitBand(job.fit.score)}`}
                type="button"
                onClick={() => setFitOpen((prev) => ({ ...prev, [jobKey(job)]: !prev[jobKey(job)] }))}
              >
                {job.fit.score}% fit
              </button>
            )}
            {job.location && <span className="muted">📍 {job.location}</span>}
            {job.remote && <span className="muted">🏠 Remote</span>}
            {job.salary && <span className="muted">💰 {job.salary}</span>}
          </div>
          {job.fit && fitOpen[jobKey(job)] && (
            <div className="fit-details">
              {job.fit.reasons?.length > 0 && (
                <div><strong>Why it fits:</strong> {job.fit.reasons.join(' ')}</div>
              )}
              {job.fit.gaps?.length > 0 && (
                <div><strong>Check gaps:</strong> {job.fit.gaps.join(' ')}</div>
              )}
            </div>
          )}
          {job.description && <p className="job-desc">{job.description.slice(0, 220)}…</p>}
          <div className="job-actions">
            <a className="btn small" href={job.url} target="_blank" rel="noreferrer">Apply ↗</a>
            <button className="btn small secondary" onClick={() => save(job, 'saved')} disabled={job.trackedStatus === 'saved'}>
              Save
            </button>
            <button className="btn small secondary" onClick={() => save(job, 'applied')}>
              Mark applied
            </button>
            <button className="btn small secondary" onClick={() => setAssistJob(job)}>
              ✍️ Assistant
            </button>
          </div>
        </div>
      ))}

      {assistJob && (
        <AssistantModal
          job={assistJob}
          aiEnabled={aiEnabled}
          onClose={() => setAssistJob(null)}
          onSaveCoverLetter={saveCoverLetterFromSearch}
        />
      )}
      {showAutofill && <AutofillPanel onClose={() => setShowAutofill(false)} />}
    </div>
  );
}

function jobKey(job) {
  return `${job.source}-${job.externalId || job.url || job.title}`;
}

function sortJobs(jobs, byFit) {
  return [...(jobs || [])].sort((a, b) => {
    if (byFit) {
      const fit = (b.fit?.score ?? -1) - (a.fit?.score ?? -1);
      if (fit !== 0) return fit;
    }
    return (Date.parse(b.postedAt) || 0) - (Date.parse(a.postedAt) || 0);
  });
}

function mergeJobs(jobs) {
  const seen = new Set();
  const out = [];
  for (const job of jobs) {
    const key = job.url || `${job.source}:${job.externalId}` || `${job.company}:${job.title}:${job.location}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(job);
  }
  return out;
}

function fitBand(score) {
  if (score >= 80) return 'high';
  if (score >= 60) return 'mid';
  return 'low';
}

function uniqueErrors(errors) {
  const seen = new Set();
  return errors.filter((error) => {
    const key = `${error.source}:${error.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

import { useEffect, useState } from 'react';
import { api } from '../api.js';
import AssistantModal from '../components/AssistantModal.jsx';
import AutofillPanel from '../components/AutofillPanel.jsx';
import JobCard from '../components/JobCard.jsx';
import { useToast } from '../components/Toaster.jsx';

export default function Search() {
  const [q, setQ] = useState('');
  const [location, setLocation] = useState('');
  const [remote, setRemote] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [improving, setImproving] = useState(false);
  const [sortByFit, setSortByFit] = useState(false);
  const [searched, setSearched] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [assistJob, setAssistJob] = useState(null);
  const [showAutofill, setShowAutofill] = useState(false);
  const [providers, setProviders] = useState([]);
  const [selected, setSelected] = useState([]); // empty = all sources
  const { toast } = useToast();
  const notify = (m) => toast(m, 'success');

  useEffect(() => {
    api.assistantStatus().then((s) => setAiEnabled(s.aiEnabled)).catch((e) => toast(e.message, 'error'));
    api.getProviders().then((p) => setProviders(p.filter((x) => x.configured))).catch((e) => toast(e.message, 'error'));

    // Deep-link support: /search?q=React+Engineer&location=Remote auto-runs once.
    const params = new URLSearchParams(window.location.search);
    const initialQ = params.get('q');
    const initialLoc = params.get('location');
    if (!initialQ && !initialLoc) return;
    if (initialQ) setQ(initialQ);
    if (initialLoc) setLocation(initialLoc);
    setLoading(true); setSearched(true);
    api.searchJobs({ q: initialQ || '', location: initialLoc || '', remote: 'false' })
      .then((r) => { setJobs(r.jobs); setErrors(r.errors || []); })
      .catch((err) => { setErrors([{ source: 'app', message: err.message }]); setJobs([]); })
      .finally(() => setLoading(false));
  }, [toast]);

  function toggleSource(id) {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  async function doSearch(e) {
    e?.preventDefault();
    setLoading(true); setSearched(true); setSortByFit(false);
    setJobs([]);
    try {
      const params = { q, location, remote: String(remote) };
      if (selected.length) params.sources = selected.join(',');
      const r = await api.searchJobs(params);
      setJobs(r.jobs); setErrors(r.errors || []);
    } catch (err) {
      setErrors([{ source: 'app', message: err.message }]); setJobs([]);
    }
    setLoading(false);
  }

  // Score the current results, attach a `fit` to each, and sort by it.
  async function rankByFit() {
    if (jobs.length === 0) return;
    setScoring(true);
    try {
      const { scores } = await api.scoreJobs(jobs);
      const byKey = new Map(scores.map((s) => [s.job_key, s]));
      const next = jobs.map((j) => ({ ...j, fit: byKey.get(`${j.source}:${j.externalId}`) || j.fit || null }));
      next.sort((a, b) => (b.fit?.score || 0) - (a.fit?.score || 0));
      setJobs(next);
      setSortByFit(true);
      notify(aiEnabled ? 'Ranked by AI fit' : 'Ranked by fit (heuristic)');
    } catch (err) {
      toast(err.message, 'error');
    }
    setScoring(false);
  }

  function toggleSort() {
    if (!sortByFit) { rankByFit(); return; }
    setSortByFit(false);
    // Restore recency order.
    setJobs((prev) => [...prev].sort((a, b) => (Date.parse(b.postedAt) || 0) - (Date.parse(a.postedAt) || 0)));
  }

  // Expand a vague query into several board-friendly queries and merge results.
  async function improveSearch() {
    setImproving(true); setSearched(true);
    setJobs([]);
    try {
      const plan = await api.planQueries(q);
      if (plan.rationale) toast(plan.rationale, 'info');
      const sources = selected.length ? selected.join(',') : undefined;
      const results = await Promise.all(plan.queries.slice(0, 5).map((pq) =>
        api.searchJobs({
          q: pq.query,
          location: pq.location || location,
          remote: String(pq.remote ?? remote),
          ...(sources ? { sources } : {}),
        }).catch(() => ({ jobs: [], errors: [] })),
      ));
      const seen = new Set();
      const merged = [];
      const errs = [];
      for (const r of results) {
        errs.push(...(r.errors || []));
        for (const j of (r.jobs || [])) {
          const k = `${j.source}|${j.externalId}`;
          if (seen.has(k)) continue;
          seen.add(k);
          merged.push(j);
        }
      }
      setJobs(merged); setErrors(errs); setSortByFit(false);
      notify(`Expanded into ${plan.queries.length} searches · ${merged.length} jobs`);
    } catch (err) {
      toast(err.message, 'error');
    }
    setImproving(false);
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
          <button type="button" className="btn secondary" onClick={improveSearch} disabled={improving}>
            {improving ? 'Improving…' : '✨ Improve my search'}
          </button>
          <button type="button" className="btn secondary" onClick={() => setShowAutofill(true)}>
            ⚡ Autofill helper
          </button>
          <div className="checkbox-row">
            <input id="remote" type="checkbox" checked={remote} onChange={(e) => setRemote(e.target.checked)} />
            <label htmlFor="remote">Remote only</label>
          </div>
        </div>
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

      {jobs.length > 0 && (
        <div className="section-actions">
          <span className="muted">{jobs.length} result{jobs.length === 1 ? '' : 's'}</span>
          <button
            className={`btn small ${sortByFit ? '' : 'secondary'}`}
            onClick={toggleSort}
            disabled={scoring}
          >
            {scoring ? 'Scoring…' : sortByFit ? '★ Sorted by fit' : '☆ Sort by fit'}
          </button>
        </div>
      )}

      {searched && !loading && !improving && jobs.length === 0 && (
        <div className="empty">No jobs found. Try different keywords, or add API keys for more sources.</div>
      )}

      {jobs.map((job) => (
        <JobCard
          key={`${job.source}-${job.externalId}`}
          job={job}
          onSave={save}
          onAssist={setAssistJob}
        />
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

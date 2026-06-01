import { useEffect, useState } from 'react';
import { api } from '../api.js';
import AssistantModal from '../components/AssistantModal.jsx';
import AutofillPanel from '../components/AutofillPanel.jsx';

export default function Search() {
  const [q, setQ] = useState('');
  const [location, setLocation] = useState('');
  const [remote, setRemote] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [assistJob, setAssistJob] = useState(null);
  const [showAutofill, setShowAutofill] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    api.assistantStatus().then((s) => setAiEnabled(s.aiEnabled)).catch(() => {});
  }, []);

  function notify(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 1800);
  }

  async function doSearch(e) {
    e?.preventDefault();
    setLoading(true); setSearched(true);
    try {
      const r = await api.searchJobs({ q, location, remote: String(remote) });
      setJobs(r.jobs); setErrors(r.errors || []);
    } catch (err) {
      setErrors([{ source: 'app', message: err.message }]); setJobs([]);
    }
    setLoading(false);
  }

  async function save(job, status) {
    try {
      await api.saveApplication({ ...job, status });
      setJobs((prev) => prev.map((j) =>
        j.externalId === job.externalId && j.source === job.source
          ? { ...j, trackedStatus: status } : j));
      notify(status === 'applied' ? 'Marked as applied' : 'Saved to tracker');
    } catch (err) { notify(err.message); }
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
          <div className="checkbox-row">
            <input id="remote" type="checkbox" checked={remote} onChange={(e) => setRemote(e.target.checked)} />
            <label htmlFor="remote">Remote only</label>
          </div>
        </div>
      </form>

      {errors.map((er, i) => (
        <div className="banner" key={i}>{er.source}: {er.message}</div>
      ))}

      {searched && !loading && jobs.length === 0 && (
        <div className="empty">No jobs found. Try different keywords, or add API keys for more sources.</div>
      )}

      {jobs.map((job) => (
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
            {job.location && <span className="muted">📍 {job.location}</span>}
            {job.remote && <span className="muted">🏠 Remote</span>}
            {job.salary && <span className="muted">💰 {job.salary}</span>}
          </div>
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
        <AssistantModal job={assistJob} aiEnabled={aiEnabled} onClose={() => setAssistJob(null)} />
      )}
      {showAutofill && <AutofillPanel onClose={() => setShowAutofill(false)} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

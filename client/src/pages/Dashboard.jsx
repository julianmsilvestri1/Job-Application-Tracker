import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import JobCard from '../components/JobCard.jsx';
import AssistantModal from '../components/AssistantModal.jsx';
import { useToast } from '../components/Toaster.jsx';

const PIPELINE = ['saved', 'applied', 'interviewing', 'offer', 'rejected'];

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [providers, setProviders] = useState([]);
  const { toast } = useToast();

  useEffect(() => {
    api.getStats().then(setStats).catch((e) => toast(e.message, 'error'));
    api.getApplications().then((a) => setRecent(a.slice(0, 5))).catch((e) => toast(e.message, 'error'));
    api.getProviders().then(setProviders).catch((e) => toast(e.message, 'error'));
  }, [toast]);

  return (
    <div>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-sub">Your job hunt at a glance.</p>

      {stats && (
        <div className="stats">
          <div className="stat">
            <div className="num">{stats.total}</div>
            <div className="lbl">total tracked</div>
          </div>
          {PIPELINE.map((s) => (
            <div className="stat" key={s}>
              <div className="num">{stats[s]}</div>
              <div className="lbl">{s}</div>
            </div>
          ))}
        </div>
      )}

      <Recommended />

      <div className="card">
        <div className="section-actions">
          <h3 style={{ margin: 0 }}>Recent activity</h3>
          <Link to="/applications" className="btn small secondary">View all</Link>
        </div>
        {recent.length === 0 ? (
          <p className="muted">
            Nothing yet. <Link to="/search">Find jobs</Link> to get started.
          </p>
        ) : (
          recent.map((a) => (
            <div key={a.id} className="autofill-item">
              <div>
                <div>{a.title}</div>
                <div className="autofill-label">{a.company} · {a.location || '—'}</div>
              </div>
              <span className={`badge ${a.status}`}>{a.status}</span>
            </div>
          ))
        )}
      </div>

      <div className="card">
        <div className="section-actions">
          <h3 style={{ margin: 0 }}>Job sources</h3>
          <span className="muted" style={{ fontSize: 13 }}>
            {providers.filter((p) => p.configured).length} / {providers.length} active
          </span>
        </div>
        <div className="row">
          {providers.map((p) => (
            <span key={p.id} className="badge source" title={p.requiresKey ? 'Needs an API key' : 'No key required'}>
              {p.configured ? '🟢' : '⚪'} {p.label}{p.requiresKey && !p.configured ? ' · add key' : ''}
            </span>
          ))}
        </div>
        <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
          Remotive, The Muse, RemoteOK, Arbeitnow and Jobicy work with no key. Add
          Adzuna, Jooble or USAJOBS keys in <code>server/.env</code> to unlock listings from
          Indeed, LinkedIn-adjacent boards and federal jobs.
        </p>
      </div>
    </div>
  );
}

// Profile/preference-driven feed, ranked by fit.
function Recommended() {
  const [state, setState] = useState({ loading: true });
  const [assistJob, setAssistJob] = useState(null);
  const [aiEnabled, setAiEnabled] = useState(false);
  const { toast } = useToast();

  function load() {
    setState({ loading: true });
    api.getRecommended(8)
      .then((r) => setState({ loading: false, ...r }))
      .catch((e) => setState({ loading: false, error: e.message }));
  }

  useEffect(() => {
    api.assistantStatus().then((s) => setAiEnabled(s.aiEnabled)).catch(() => {});
    load();
  }, []);

  async function save(job, status) {
    try {
      await api.saveApplication({ ...job, status });
      setState((s) => ({
        ...s,
        jobs: (s.jobs || []).map((j) =>
          j.externalId === job.externalId && j.source === job.source ? { ...j, trackedStatus: status } : j),
      }));
      toast(status === 'applied' ? 'Marked as applied' : 'Saved to tracker', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  const jobs = state.jobs || [];

  return (
    <div className="card">
      <div className="section-actions">
        <h3 style={{ margin: 0 }}>Recommended for you</h3>
        <div className="row" style={{ gap: 8 }}>
          {state.derivedFrom && jobs.length > 0 && (
            <span className="muted" style={{ fontSize: 13 }}>
              from your {state.derivedFrom === 'preferences' ? 'preferences' : 'profile'}
            </span>
          )}
          <button className="btn small secondary" onClick={load} disabled={state.loading}>
            {state.loading ? 'Loading…' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {state.loading && <p className="muted">Finding roles that fit you…</p>}
      {state.error && <div className="banner">{state.error}</div>}

      {!state.loading && !state.error && jobs.length === 0 && (
        <p className="muted">
          {state.note || (
            <>Add <Link to="/profile">job preferences or a headline</Link> to get personalized recommendations.</>
          )}
        </p>
      )}

      {jobs.map((job) => (
        <JobCard key={`${job.source}-${job.externalId}`} job={job} onSave={save} onAssist={setAssistJob} />
      ))}

      {assistJob && (
        <AssistantModal job={assistJob} aiEnabled={aiEnabled} onClose={() => setAssistJob(null)} />
      )}
    </div>
  );
}

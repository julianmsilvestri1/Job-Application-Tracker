import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import AssistantModal from '../components/AssistantModal.jsx';
import { useToast } from '../components/Toaster.jsx';

const PIPELINE = ['saved', 'applied', 'interviewing', 'offer', 'rejected'];

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [providers, setProviders] = useState([]);
  const [recommended, setRecommended] = useState([]);
  const [recommendationMeta, setRecommendationMeta] = useState(null);
  const [assistJob, setAssistJob] = useState(null);
  const [aiEnabled, setAiEnabled] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    api.getStats().then(setStats).catch((e) => toast(e.message, 'error'));
    api.getApplications().then((a) => setRecent(a.slice(0, 5))).catch((e) => toast(e.message, 'error'));
    api.getProviders().then(setProviders).catch((e) => toast(e.message, 'error'));
    api.getRecommendedJobs({ limit: '6' }).then((r) => {
      setRecommended(r.jobs || []);
      setRecommendationMeta(r);
    }).catch((e) => toast(e.message, 'error'));
    api.assistantStatus().then((s) => setAiEnabled(s.aiEnabled)).catch(() => {});
  }, [toast]);

  async function save(job, status) {
    try {
      const app = await api.saveApplication({ ...job, status });
      setRecommended((prev) => prev.map((j) =>
        j.externalId === job.externalId && j.source === job.source
          ? { ...j, trackedStatus: status, id: app.id }
          : j));
      toast(status === 'applied' ? 'Marked as applied' : 'Saved to tracker', 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
  }

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

      <div className="card">
        <div className="section-actions">
          <div>
            <h3 style={{ margin: 0 }}>Recommended for you</h3>
            <div className="autofill-label">
              Ranked from your profile{recommendationMeta?.queries?.length ? ` · ${recommendationMeta.queries.length} searches` : ''}
            </div>
          </div>
          <Link to="/profile" className="btn small secondary">Tune preferences</Link>
        </div>
        {recommended.length === 0 ? (
          <p className="muted">
            Add skills, a headline, or job preferences to generate stronger recommendations.
          </p>
        ) : (
          recommended.map((job) => (
            <div key={`${job.source}-${job.externalId || job.url}`} className="recommended-job">
              <div>
                <div className="job-title">{job.title}</div>
                <div className="job-company">{job.company} · {job.location || 'Remote / flexible'}</div>
                <div className="job-meta">
                  <span className="badge source">{job.source}</span>
                  {job.fit && <span className={`fit-badge fit-${fitBand(job.fit.score)}`}>{job.fit.score}% fit</span>}
                  {job.trackedStatus && <span className={`badge ${job.trackedStatus}`}>{job.trackedStatus}</span>}
                </div>
                {job.fit?.reasons?.[0] && <p className="job-desc">{job.fit.reasons[0]}</p>}
              </div>
              <div className="job-actions">
                <a className="btn small" href={job.url} target="_blank" rel="noreferrer">Apply ↗</a>
                <button className="btn small secondary" onClick={() => save(job, 'saved')} disabled={job.trackedStatus === 'saved'}>Save</button>
                <button className="btn small secondary" onClick={() => setAssistJob(job)}>Assistant</button>
              </div>
            </div>
          ))
        )}
      </div>

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
      {assistJob && (
        <AssistantModal
          job={assistJob}
          aiEnabled={aiEnabled}
          onClose={() => setAssistJob(null)}
        />
      )}
    </div>
  );
}

function fitBand(score) {
  if (score >= 80) return 'high';
  if (score >= 60) return 'mid';
  return 'low';
}

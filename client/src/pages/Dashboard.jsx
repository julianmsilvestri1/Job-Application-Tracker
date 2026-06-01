import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

const PIPELINE = ['saved', 'applied', 'interviewing', 'offer', 'rejected'];

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [providers, setProviders] = useState([]);

  useEffect(() => {
    api.getStats().then(setStats).catch(() => {});
    api.getApplications().then((a) => setRecent(a.slice(0, 5))).catch(() => {});
    api.getProviders().then(setProviders).catch(() => {});
  }, []);

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

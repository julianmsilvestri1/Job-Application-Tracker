import { useEffect, useState } from 'react';
import { api } from '../api.js';
import AssistantModal from '../components/AssistantModal.jsx';
import { useToast } from '../components/Toaster.jsx';

const STATUSES = ['all', 'saved', 'applied', 'interviewing', 'offer', 'rejected', 'archived'];
const NEXT_STATUS = ['saved', 'applied', 'interviewing', 'offer', 'rejected', 'archived'];

export default function Applications() {
  const [filter, setFilter] = useState('all');
  const [apps, setApps] = useState([]);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [assistJob, setAssistJob] = useState(null);
  const { toast } = useToast();
  const notify = (m) => toast(m, 'success');

  function load() {
    api.getApplications(filter === 'all' ? undefined : filter).then(setApps).catch((e) => toast(e.message, 'error'));
  }
  useEffect(load, [filter]);
  useEffect(() => { api.assistantStatus().then((s) => setAiEnabled(s.aiEnabled)).catch((e) => toast(e.message, 'error')); }, [toast]);

  async function changeStatus(app, status) {
    await api.updateApplication(app.id, { status });
    load(); notify(`Moved to ${status}`);
  }
  async function saveNotes(app, notes) {
    await api.updateApplication(app.id, { notes });
  }
  async function remove(id) {
    if (!confirm('Remove this application from your tracker?')) return;
    await api.deleteApplication(id); load();
  }
  async function saveCoverLetter(app, text) {
    await api.updateApplication(app.id, { cover_letter: text });
    notify('Cover letter saved'); setAssistJob(null); load();
  }

  return (
    <div>
      <h1 className="page-title">Applications</h1>
      <p className="page-sub">Every job you've saved or applied to, in one pipeline.</p>

      <div className="tabs">
        {STATUSES.map((s) => (
          <div key={s} className={`tab ${filter === s ? 'active' : ''}`} onClick={() => setFilter(s)}>
            {s}
          </div>
        ))}
      </div>

      {apps.length === 0 ? (
        <div className="empty">No applications here yet.</div>
      ) : (
        apps.map((app) => (
          <div className="job" key={app.id}>
            <div className="job-head">
              <div>
                <h3 className="job-title">{app.title}</h3>
                <div className="job-company">{app.company} {app.location && `· ${app.location}`}</div>
              </div>
              <span className={`badge ${app.status}`}>{app.status}</span>
            </div>
            <div className="job-meta">
              {app.source && <span className="badge source">{app.source}</span>}
              {app.salary && <span className="muted">💰 {app.salary}</span>}
              {app.applied_at && <span className="muted">Applied {new Date(app.applied_at).toLocaleDateString()}</span>}
              {app.url && <a href={app.url} target="_blank" rel="noreferrer">Open posting ↗</a>}
            </div>

            <div className="field" style={{ marginTop: 12, marginBottom: 8 }}>
              <label>Notes</label>
              <textarea
                defaultValue={app.notes}
                placeholder="Recruiter name, follow-up date, interview prep…"
                onBlur={(e) => saveNotes(app, e.target.value)}
                style={{ minHeight: 56 }}
              />
            </div>

            <div className="job-actions">
              <select value={app.status} onChange={(e) => changeStatus(app, e.target.value)} style={{ width: 'auto' }}>
                {NEXT_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <button className="btn small secondary" onClick={() => setAssistJob(app)}>
                ✍️ Assistant{app.cover_letter ? ' ✓' : ''}
              </button>
              <button className="btn small danger" onClick={() => remove(app.id)}>Delete</button>
            </div>
          </div>
        ))
      )}

      {assistJob && (
        <AssistantModal
          job={assistJob}
          aiEnabled={aiEnabled}
          onClose={() => setAssistJob(null)}
          onSaveCoverLetter={(text) => saveCoverLetter(assistJob, text)}
        />
      )}
    </div>
  );
}

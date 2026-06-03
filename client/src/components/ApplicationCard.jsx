// One application row in the pipeline list. Opening it switches the page to the
// full apply workspace (Unit 2.0). Quick status/notes/delete stay inline so the
// common pipeline actions don't require opening the workspace.
const NEXT_STATUS = ['saved', 'applied', 'interviewing', 'offer', 'rejected', 'archived'];

export default function ApplicationCard({ app, onOpen, onChangeStatus, onSaveNotes, onDelete }) {
  return (
    <div className="job">
      <div className="job-head">
        <div>
          <h3 className="job-title">{app.title || '(untitled role)'}</h3>
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
          onBlur={(e) => onSaveNotes(app, e.target.value)}
          style={{ minHeight: 56 }}
        />
      </div>

      <div className="job-actions">
        <select value={app.status} onChange={(e) => onChangeStatus(app, e.target.value)} style={{ width: 'auto' }}>
          {NEXT_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button className="btn small" onClick={() => onOpen(app)}>Open workspace →</button>
        <button className="btn small danger" onClick={() => onDelete(app.id)}>Delete</button>
      </div>
    </div>
  );
}

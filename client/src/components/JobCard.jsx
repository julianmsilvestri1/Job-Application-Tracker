import FitBadge from './FitBadge.jsx';

// A single job posting card, reused by Search and the Dashboard "Recommended
// for you" feed. Actions are optional so callers can show a subset.
export default function JobCard({ job, onSave, onAssist }) {
  return (
    <div className="job">
      <div className="job-head">
        <div>
          <h3 className="job-title">{job.title}</h3>
          <div className="job-company">{job.company}</div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {job.fit && <FitBadge fit={job.fit} />}
          {job.trackedStatus && <span className={`badge ${job.trackedStatus}`}>{job.trackedStatus}</span>}
        </div>
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
        {onSave && (
          <>
            <button className="btn small secondary" onClick={() => onSave(job, 'saved')} disabled={job.trackedStatus === 'saved'}>
              Save
            </button>
            <button className="btn small secondary" onClick={() => onSave(job, 'applied')}>
              Mark applied
            </button>
          </>
        )}
        {onAssist && (
          <button className="btn small secondary" onClick={() => onAssist(job)}>
            ✍️ Assistant
          </button>
        )}
      </div>
    </div>
  );
}

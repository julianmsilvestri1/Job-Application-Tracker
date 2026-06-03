import ApplicationDocuments from './ApplicationDocuments.jsx';
import ApplicationChecklist from './ApplicationChecklist.jsx';
import ApplyPlanPanel from './ApplyPlanPanel.jsx';

// The fixed-section layout for one application's workspace (Unit 2.0).
// Sections are always present; later units fill their bodies:
//   Overview (now) · Documents (2.1) · Checklist (2.2) · Apply plan (2.3) ·
//   Packet (2.4) · Assistant (now) · Activity (2.7).
const NEXT_STATUS = ['saved', 'applied', 'interviewing', 'offer', 'rejected', 'archived'];

function Section({ title, count, children }) {
  return (
    <section className="job">
      <h3 className="job-title" style={{ fontSize: 15, marginBottom: 8 }}>
        {title}{typeof count === 'number' ? ` (${count})` : ''}
      </h3>
      {children}
    </section>
  );
}

export default function ApplicationDetailsPanel({
  application: app, aiEnabled, onChangeStatus, onSaveNotes, onOpenAssistant, onReload,
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
      <Section title="Overview">
        <div className="job-meta">
          {app.source && <span className="badge source">{app.source}</span>}
          {app.location && <span className="muted">📍 {app.location}</span>}
          {app.salary && <span className="muted">💰 {app.salary}</span>}
          {app.applied_at && <span className="muted">Applied {new Date(app.applied_at).toLocaleDateString()}</span>}
          {app.url && <a href={app.url} target="_blank" rel="noreferrer">Open posting ↗</a>}
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label>Status</label>
          <select value={app.status} onChange={(e) => onChangeStatus(e.target.value)} style={{ width: 'auto' }}>
            {NEXT_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label>Notes</label>
          <textarea
            defaultValue={app.notes}
            placeholder="Recruiter name, follow-up date, interview prep…"
            onBlur={(e) => onSaveNotes(e.target.value)}
            style={{ minHeight: 56 }}
          />
        </div>
        {app.description && (
          <div className="field" style={{ marginTop: 12 }}>
            <label>Job description</label>
            <div className="muted" style={{ whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'auto' }}>
              {app.description}
            </div>
          </div>
        )}
      </Section>

      <Section title="Documents" count={app.documents.length}>
        <ApplicationDocuments
          applicationId={app.id}
          attached={app.documents}
          onChanged={onReload}
        />
      </Section>

      <Section title="Checklist" count={app.tasks.length}>
        <ApplicationChecklist
          applicationId={app.id}
          tasks={app.tasks}
          onChanged={onReload}
        />
      </Section>

      <Section title="Apply plan">
        <ApplyPlanPanel
          applicationId={app.id}
          plan={app.applyPlan}
          aiEnabled={aiEnabled}
          onChanged={onReload}
        />
      </Section>

      <Section title="Packet">
        <div className="empty">The application packet is assembled here once available.</div>
      </Section>

      <Section title="Assistant">
        <button className="btn small secondary" onClick={onOpenAssistant}>
          ✍️ Cover letter & answers{app.cover_letter ? ' ✓' : ''}
        </button>
        {!aiEnabled && (
          <p className="muted" style={{ marginTop: 8 }}>
            Works without an API key using templates.
          </p>
        )}
      </Section>

      <Section title="Activity" count={app.events.length}>
        {app.events.length === 0 ? (
          <div className="empty">No activity recorded yet.</div>
        ) : (
          <ul>{app.events.map((e) => (
            <li key={e.id}>{e.type}</li>
          ))}</ul>
        )}
      </Section>
    </div>
  );
}

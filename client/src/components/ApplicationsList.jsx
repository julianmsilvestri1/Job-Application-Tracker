import ApplicationCard from './ApplicationCard.jsx';

// Status-filtered list of applications (the pipeline view). Selecting a card
// hands control to the workspace via onOpen.
const STATUSES = ['all', 'saved', 'applied', 'interviewing', 'offer', 'rejected', 'archived'];

export default function ApplicationsList({
  filter, setFilter, apps, onOpen, onChangeStatus, onSaveNotes, onDelete,
}) {
  return (
    <div>
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
          <ApplicationCard
            key={app.id}
            app={app}
            onOpen={onOpen}
            onChangeStatus={onChangeStatus}
            onSaveNotes={onSaveNotes}
            onDelete={onDelete}
          />
        ))
      )}
    </div>
  );
}

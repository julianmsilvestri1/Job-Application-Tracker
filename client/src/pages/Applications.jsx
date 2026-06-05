import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../components/Toaster.jsx';
import ApplicationsList from '../components/ApplicationsList.jsx';
import ApplicationWorkspace from '../components/ApplicationWorkspace.jsx';

// Controller for the Applications area (Unit 2.0): the status-filtered pipeline
// list, or — when a card is opened — the single-application apply workspace.
export default function Applications() {
  const [filter, setFilter] = useState('all');
  const [apps, setApps] = useState([]);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const { toast } = useToast();
  const notify = useCallback((m) => toast(m, 'success'), [toast]);

  const load = useCallback(() => {
    api.getApplications(filter === 'all' ? undefined : filter)
      .then(setApps).catch((e) => toast(e.message, 'error'));
  }, [filter, toast]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.assistantStatus().then((s) => setAiEnabled(s.aiEnabled)).catch((e) => toast(e.message, 'error'));
  }, [toast]);

  async function changeStatus(app, status) {
    await api.updateApplication(app.id, { status });
    load(); notify(`Moved to ${status}`);
  }
  async function saveNotes(app, notes) {
    await api.updateApplication(app.id, { notes });
  }
  async function remove(id) {
    if (!confirm('Remove this application from your tracker?')) return;
    await api.deleteApplication(id);
    if (selectedId === id) setSelectedId(null);
    load();
  }

  return (
    <div>
      <h1 className="page-title">Applications</h1>
      <p className="page-sub">Every job you’ve saved or applied to, in one pipeline.</p>

      {selectedId ? (
        <ApplicationWorkspace
          applicationId={selectedId}
          aiEnabled={aiEnabled}
          onBack={() => { setSelectedId(null); load(); }}
          onChanged={load}
        />
      ) : (
        <ApplicationsList
          filter={filter}
          setFilter={setFilter}
          apps={apps}
          onOpen={(app) => setSelectedId(app.id)}
          onChangeStatus={changeStatus}
          onSaveNotes={saveNotes}
          onDelete={remove}
        />
      )}
    </div>
  );
}

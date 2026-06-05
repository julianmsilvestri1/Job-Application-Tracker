import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from './Toaster.jsx';
import AssistantModal from './AssistantModal.jsx';
import ApplicationDetailsPanel from './ApplicationDetailsPanel.jsx';

// The full apply workspace for a single application (Unit 2.0). Loads the
// normalized application (GET /api/applications/:id) and renders the fixed
// section layout. Patches go through PATCH and re-load so nested collections
// added by later units stay in sync.
export default function ApplicationWorkspace({ applicationId, aiEnabled, onBack, onChanged }) {
  const [app, setApp] = useState(null);
  const [assistOpen, setAssistOpen] = useState(false);
  const { toast } = useToast();

  const load = useCallback(() => {
    api.getApplication(applicationId)
      .then(setApp)
      .catch((e) => toast(e.message, 'error'));
  }, [applicationId, toast]);
  useEffect(() => { load(); }, [load]);

  const patch = useCallback(async (body, msg) => {
    try {
      await api.updateApplication(applicationId, body);
      if (msg) toast(msg, 'success');
      load();
      onChanged?.();
    } catch (e) {
      toast(e.message, 'error');
    }
  }, [applicationId, toast, load, onChanged]);

  const markSubmitted = useCallback(async () => {
    try {
      await api.markSubmitted(applicationId);
      toast('Marked as submitted', 'success');
      load();
      onChanged?.();
    } catch (e) {
      toast(e.message, 'error');
    }
  }, [applicationId, toast, load, onChanged]);

  const clearFlag = useCallback(async () => {
    try {
      await api.clearReview(applicationId);
      toast('Review flag cleared', 'success');
      load();
      onChanged?.();
    } catch (e) {
      toast(e.message, 'error');
    }
  }, [applicationId, toast, load, onChanged]);

  if (!app) {
    return (
      <div>
        <button className="btn small secondary" onClick={onBack}>← Back to list</button>
        <div className="empty" style={{ marginTop: 16 }}>Loading application…</div>
      </div>
    );
  }

  return (
    <div>
      <button className="btn small secondary" onClick={onBack}>← Back to list</button>
      <div className="job-head" style={{ marginTop: 12 }}>
        <div>
          <h2 className="job-title" style={{ fontSize: 20 }}>{app.title || '(untitled role)'}</h2>
          <div className="job-company">{app.company} {app.location && `· ${app.location}`}</div>
        </div>
        <span className={`badge ${app.status}`}>{app.status}</span>
      </div>

      {app.needs_review && (
        <div className="banner" style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ flex: 1 }}>⚠ {app.review_summary || 'Auto-apply paused — this application needs human review before submitting.'}</span>
          <button className="btn small secondary" onClick={clearFlag}>Clear flag</button>
        </div>
      )}

      <ApplicationDetailsPanel
        application={app}
        aiEnabled={aiEnabled}
        onChangeStatus={(status) => patch({ status }, `Moved to ${status}`)}
        onSaveNotes={(notes) => patch({ notes })}
        onOpenAssistant={() => setAssistOpen(true)}
        onReload={() => { load(); onChanged?.(); }}
        onMarkSubmitted={markSubmitted}
      />

      {assistOpen && (
        <AssistantModal
          job={app}
          aiEnabled={aiEnabled}
          onClose={() => setAssistOpen(false)}
          onSaveCoverLetter={async (text) => {
            await patch({ cover_letter: text }, 'Cover letter saved');
            setAssistOpen(false);
          }}
        />
      )}
    </div>
  );
}

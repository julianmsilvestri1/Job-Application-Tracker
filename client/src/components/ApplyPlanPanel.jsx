import { useState } from 'react';
import { api } from '../api.js';
import { useToast } from './Toaster.jsx';

// Apply-plan section of the workspace (Unit 2.3): generate an AI/heuristic plan
// (required materials, likely questions, warnings, suggested tasks) and merge
// the suggested tasks into the checklist.
export default function ApplyPlanPanel({ applicationId, plan, aiEnabled, onChanged }) {
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  async function generate({ mergeTasks = false } = {}) {
    setBusy(true);
    try {
      const res = await api.generateApplyPlan(applicationId, { refresh: true, mergeTasks });
      if (res.warning) toast(res.warning, 'error');
      if (mergeTasks) {
        toast(res.mergedTaskCount ? `Added ${res.mergedTaskCount} task(s) to the checklist` : 'No new tasks to add', 'success');
      } else {
        toast(res.source === 'ai' ? 'Apply plan generated' : 'Apply plan generated (template)', 'success');
      }
      onChanged?.();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const list = (title, items) => items?.length > 0 && (
    <div className="field" style={{ marginTop: 10 }}>
      <label>{title}</label>
      <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
        {items.map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </div>
  );

  return (
    <div>
      {!plan ? (
        <div className="empty">No apply plan generated yet.</div>
      ) : (
        <div>
          <span className="badge source">{plan.source === 'ai' ? 'AI' : 'template'}</span>
          {list('Required materials', plan.requirements)}
          {list('Likely questions', plan.likely_questions)}
          {list('Warnings', plan.warnings)}
          {plan.suggested_tasks?.length > 0 && (
            <div className="field" style={{ marginTop: 10 }}>
              <label>Suggested tasks</label>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {plan.suggested_tasks.map((t, i) => (
                  <li key={i}>{t.label} <span className="muted">· {t.category}</span></li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <button className="btn small" disabled={busy} onClick={() => generate()}>
          {busy ? 'Working…' : plan ? '↻ Regenerate plan' : 'Suggest apply plan'}
        </button>
        {plan?.suggested_tasks?.length > 0 && (
          <button className="btn small secondary" disabled={busy} onClick={() => generate({ mergeTasks: true })}>
            Add suggested tasks
          </button>
        )}
      </div>
      {!aiEnabled && (
        <p className="muted" style={{ marginTop: 8 }}>
          No API key set — plans are generated from the job text with built-in rules.
        </p>
      )}
    </div>
  );
}

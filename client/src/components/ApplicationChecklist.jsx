import { useState } from 'react';
import { api } from '../api.js';
import { useToast } from './Toaster.jsx';

// Checklist section of the apply workspace (Unit 2.2): toggle, add, set a due
// date, and delete per-application tasks. Tasks are seeded on application
// create; this UI manages them and shows progress.
export default function ApplicationChecklist({ applicationId, tasks, onChanged }) {
  const [label, setLabel] = useState('');
  const [dueDate, setDueDate] = useState('');
  const { toast } = useToast();

  const done = tasks.filter((t) => t.done).length;

  async function run(fn) {
    try { await fn(); onChanged?.(); } catch (e) { toast(e.message, 'error'); }
  }
  const toggle = (t) => run(() => api.updateTask(applicationId, t.id, { done: !t.done }));
  const remove = (t) => run(() => api.deleteTask(applicationId, t.id));
  async function add() {
    if (!label.trim()) return;
    await run(() => api.addTask(applicationId, { label: label.trim(), due_date: dueDate || null }));
    setLabel(''); setDueDate('');
  }

  function dueClass(t) {
    if (t.done || !t.due_date) return 'muted';
    const today = new Date().toISOString().slice(0, 10);
    return t.due_date < today ? 'badge rejected' : 'muted';
  }

  return (
    <div>
      <div className="muted" style={{ marginBottom: 8 }}>{done}/{tasks.length} complete</div>

      {tasks.length === 0 ? (
        <div className="empty">No checklist items yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {tasks.map((t) => (
            <div key={t.id} className="job-meta" style={{ alignItems: 'center' }}>
              <input type="checkbox" checked={Boolean(t.done)} onChange={() => toggle(t)} />
              <span style={{ textDecoration: t.done ? 'line-through' : 'none', flex: 1 }}>{t.label}</span>
              <span className="badge source">{t.category}</span>
              {t.due_date && <span className={dueClass(t)}>due {t.due_date}</span>}
              <button className="btn small danger" onClick={() => remove(t)}>✕</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: 1, margin: 0 }}>
          <label>Add a task</label>
          <input value={label} placeholder="e.g. Email the recruiter"
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Due</label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <button className="btn small" disabled={!label.trim()} onClick={add}>Add</button>
      </div>
    </div>
  );
}

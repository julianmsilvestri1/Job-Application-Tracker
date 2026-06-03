// Default + industry checklist templates seeded onto a new application (Unit 2.2).
// `dueInDays` is resolved to an ISO date (YYYY-MM-DD) at seed time so the
// due-soon / overdue stats can compare lexicographically against date('now').

export const DEFAULT_TASKS = [
  { label: 'Review job requirements', category: 'apply' },
  { label: 'Select resume variant', category: 'document' },
  { label: 'Tailor materials', category: 'document' },
  { label: 'Complete application form', category: 'form' },
  { label: 'Submit', category: 'apply' },
  { label: 'Follow up', category: 'follow_up', dueInDays: 7 },
];

const FINANCE = [
  { label: 'Identify 1 contact to reach out to on LinkedIn', category: 'networking' },
  { label: 'Draft deal / transaction talking points', category: 'document' },
  { label: 'Confirm compliance / disclosure attachments', category: 'document' },
];

const REAL_ESTATE = [
  { label: 'Prepare project / portfolio summary', category: 'document' },
  { label: 'Verify license / certification uploads', category: 'document' },
];

const ANALYTICS = [
  { label: 'Align technical stack narrative (Python / R / SQL)', category: 'apply' },
  { label: 'Prepare case study or take-home if mentioned', category: 'apply' },
];

// Industry packs keyed by `template_pack` (aliases share a pack).
export const TEMPLATE_PACKS = {
  finance: FINANCE, pe: FINANCE, ib: FINANCE,
  real_estate: REAL_ESTATE, development: REAL_ESTATE,
  analytics: ANALYTICS, quant: ANALYTICS,
};

function dueDateFrom(dueInDays) {
  if (dueInDays == null) return null;
  const d = new Date(Date.now() + dueInDays * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

// The full ordered task list for a (default + optional pack) seed.
export function templateTasksFor(pack) {
  return [...DEFAULT_TASKS, ...(TEMPLATE_PACKS[pack] || [])];
}

// Seed the default checklist (+ optional industry pack) for an application.
// No-ops if the table is missing or the application already has tasks.
export function seedTasks(db, applicationId, pack) {
  const hasTable = db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'application_tasks'",
  ).get();
  if (!hasTable) return 0;
  const existing = db.prepare('SELECT COUNT(*) AS n FROM application_tasks WHERE application_id = ?')
    .get(applicationId).n;
  if (existing > 0) return 0;

  const tasks = templateTasksFor(pack);
  const insert = db.prepare(`
    INSERT INTO application_tasks (application_id, label, category, source, sort_order, due_date)
    VALUES (@application_id, @label, @category, 'template', @sort_order, @due_date)
  `);
  const insertAll = db.transaction((rows) => {
    rows.forEach((t, i) => insert.run({
      application_id: applicationId,
      label: t.label,
      category: t.category || 'apply',
      sort_order: i,
      due_date: dueDateFrom(t.dueInDays),
    }));
  });
  insertAll(tasks);
  return tasks.length;
}

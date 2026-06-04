// Apply-session events (Unit 2.7). A small, shared layer so the portal routes
// and the extension bridge log the same way. Metadata is JSON and must never
// contain external form field values — counts/hostnames only.

const EVENT_KINDS = ['created', 'packet_opened', 'autofill_run', 'task_done', 'submitted', 'review_required', 'note'];

export function logEvent(db, applicationId, { kind, source = 'portal', summary = '', metadata = {} } = {}) {
  if (!kind) throw new Error('event kind is required');
  const info = db.prepare(`
    INSERT INTO application_events (application_id, kind, source, summary, metadata)
    VALUES (@application_id, @kind, @source, @summary, @metadata)
  `).run({
    application_id: applicationId,
    kind,
    source,
    summary: String(summary || ''),
    metadata: JSON.stringify(metadata || {}),
  });
  return db.prepare('SELECT * FROM application_events WHERE id = ?').get(info.lastInsertRowid);
}

// Atomically mark an application submitted: status → applied (stamp applied_at),
// complete its open "Submit" checklist task(s), clear any review flag, and log a
// `submitted` event.
export function recordSubmitted(db, applicationId, { source = 'portal', summary = 'Marked as submitted', metadata = {} } = {}) {
  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE applications
      SET status = 'applied', applied_at = COALESCE(applied_at, @now),
          needs_review = 0, review_summary = '', updated_at = datetime('now')
      WHERE id = @id
    `).run({ id: applicationId, now: new Date().toISOString() });
    db.prepare(`
      UPDATE application_tasks SET done = 1, updated_at = datetime('now')
      WHERE application_id = ? AND done = 0 AND lower(label) LIKE '%submit%'
    `).run(applicationId);
    logEvent(db, applicationId, { kind: 'submitted', source, summary, metadata });
  });
  tx();
}

// Flag an application for human review (auto-apply could not complete/verify).
// Sets the tracker flag + reason and logs a `review_required` event.
export function flagForReview(db, applicationId, { summary = 'Needs human review', source = 'extension', metadata = {} } = {}) {
  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE applications SET needs_review = 1, review_summary = @summary, updated_at = datetime('now')
      WHERE id = @id
    `).run({ id: applicationId, summary: String(summary || '') });
    logEvent(db, applicationId, { kind: 'review_required', source, summary, metadata });
  });
  tx();
}

// Clear a review flag after a human has handled it.
export function clearReview(db, applicationId, { source = 'portal', summary = 'Review resolved' } = {}) {
  const tx = db.transaction(() => {
    db.prepare("UPDATE applications SET needs_review = 0, review_summary = '', updated_at = datetime('now') WHERE id = ?")
      .run(applicationId);
    logEvent(db, applicationId, { kind: 'note', source, summary });
  });
  tx();
}

export { EVENT_KINDS };

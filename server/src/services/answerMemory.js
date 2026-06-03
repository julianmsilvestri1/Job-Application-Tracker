// Answer memory (Unit 3.5.4): when the user edits an AI-drafted answer before
// saving, log the (draft → final) pair and flag the saved answer as edited so
// the indexer weights the user's own voice higher in future retrieval. This is
// few-shot reinforcement via retrieval — not model fine-tuning.

export function recordEditIfAny(db, { id, question = '', jobContext = '', aiDraft = '', finalText = '', source = '' }) {
  const draft = String(aiDraft || '').trim();
  const final = String(finalText || '').trim();
  if (source !== 'ai' || !draft || draft === final) return false;

  db.prepare(`
    INSERT INTO answer_edits (question, job_context, ai_draft, final_text)
    VALUES (?, ?, ?, ?)
  `).run(question, jobContext, draft, final);
  if (id) db.prepare('UPDATE application_answers SET edited = 1 WHERE id = ?').run(id);
  return true;
}

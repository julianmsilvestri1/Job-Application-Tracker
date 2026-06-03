// Keeps the `embeddings` table in sync with the knowledge base (Unit 3.5.1).
//
// Rather than hooking every mutation route, `syncEmbeddings` reconciles the
// vector store with the current DB state in one pass: it embeds any new/changed
// text (deduped by content hash) and prunes vectors whose source no longer
// exists. This is self-healing (no missed hooks), cheap at personal scale (the
// default embedder is pure in-process hashing), and runs on boot + lazily
// before retrieval.
import crypto from 'node:crypto';
import defaultDb from '../../db.js';
import { embed, toBlob, EMBED_DIM, PROVIDER } from './embeddings.js';

const RESUME_CHUNK = 512;

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const parseJson = (s, fb) => { try { const v = JSON.parse(s); return v ?? fb; } catch { return fb; } };

function chunk(text, size = RESUME_CHUNK) {
  const out = [];
  const t = String(text || '');
  for (let i = 0; i < t.length; i += size) out.push(t.slice(i, i + size));
  return out;
}

// The set of knowledge items the vector store SHOULD contain, from current data.
// Non-row sources (skills/custom) use source_id 0; content_hash keeps them unique.
export function desiredItems(db = defaultDb) {
  const items = [];
  const p = db.prepare('SELECT * FROM profile WHERE id = 1').get() || {};

  const skills = parseJson(p.skills, []);
  if (skills.length) items.push({ source_type: 'skill', source_id: 0, text: `Skills: ${skills.join(', ')}`, weight: 1 });

  const custom = parseJson(p.custom_fields, {});
  for (const [k, v] of Object.entries(custom)) {
    if (v) items.push({ source_type: 'custom', source_id: 0, text: `${k}: ${v}`, weight: 1 });
  }

  for (const e of db.prepare('SELECT * FROM experiences').all()) {
    const text = `${e.title || ''} at ${e.company || ''}${e.description ? `: ${e.description}` : ''}`.trim();
    if (text.replace(/at\s*/, '').trim()) items.push({ source_type: 'experience', source_id: e.id, text, weight: 1 });
  }
  for (const e of db.prepare('SELECT * FROM education').all()) {
    const text = `${e.degree || ''} ${e.field ? `in ${e.field}` : ''} ${e.school || ''}`.replace(/\s+/g, ' ').trim();
    if (text) items.push({ source_type: 'education', source_id: e.id, text, weight: 1 });
  }
  for (const a of db.prepare('SELECT * FROM application_answers').all()) {
    if (!a.answer) continue;
    // User-authored / edited answers are higher-signal for the candidate's voice.
    const weight = a.source === 'manual' ? 1.5 : 1;
    items.push({ source_type: 'answer', source_id: a.id, text: `Q: ${a.question}\nA: ${a.answer}`, weight });
  }

  const resume = db.prepare(`
    SELECT id, extracted_text FROM documents
    WHERE type = 'resume' AND is_default = 1 AND extraction_status = 'done'
    ORDER BY created_at DESC LIMIT 1
  `).get();
  if (resume?.extracted_text) {
    for (const c of chunk(resume.extracted_text)) {
      if (c.trim()) items.push({ source_type: 'resume_chunk', source_id: resume.id, text: c, weight: 1 });
    }
  }
  return items;
}

/** Reconcile the vector store with the current knowledge base. */
export function syncEmbeddings(db = defaultDb) {
  const items = desiredItems(db);
  const desired = new Set();

  const exists = db.prepare('SELECT id, weight FROM embeddings WHERE source_type = ? AND source_id = ? AND content_hash = ?');
  const insert = db.prepare(`
    INSERT INTO embeddings (source_type, source_id, content_hash, text_chunk, dim, embedding, weight, provider, updated_at)
    VALUES (@source_type, @source_id, @content_hash, @text_chunk, @dim, @embedding, @weight, @provider, datetime('now'))
  `);
  const setWeight = db.prepare('UPDATE embeddings SET weight = ? WHERE id = ?');

  let indexed = 0;
  for (const it of items) {
    const content_hash = sha(it.text);
    desired.add(`${it.source_type}|${it.source_id}|${content_hash}`);
    const found = exists.get(it.source_type, it.source_id, content_hash);
    if (found) {
      if (found.weight !== it.weight) setWeight.run(it.weight, found.id);
      continue;
    }
    insert.run({
      source_type: it.source_type, source_id: it.source_id, content_hash,
      text_chunk: it.text.slice(0, 4000), dim: EMBED_DIM,
      embedding: toBlob(embed(it.text)), weight: it.weight, provider: PROVIDER,
    });
    indexed += 1;
  }

  // Prune vectors whose source/text no longer exists.
  let pruned = 0;
  const del = db.prepare('DELETE FROM embeddings WHERE id = ?');
  for (const r of db.prepare('SELECT id, source_type, source_id, content_hash FROM embeddings').all()) {
    if (!desired.has(`${r.source_type}|${r.source_id}|${r.content_hash}`)) { del.run(r.id); pruned += 1; }
  }
  return { total: items.length, indexed, pruned };
}

/** Boot-time reconciliation (mirrors backfillPendingExtractions). */
export function backfillEmbeddings(db = defaultDb) {
  try {
    const { total, indexed, pruned } = syncEmbeddings(db);
    if (indexed || pruned) console.log(`Embeddings synced: ${total} items (${indexed} new, ${pruned} pruned).`);
  } catch (err) {
    console.error('Embedding backfill failed:', err.message);
  }
}

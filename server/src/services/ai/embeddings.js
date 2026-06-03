// Local semantic-retrieval embedding service (Unit 3.5.0).
//
// Default provider is DEPENDENCY-FREE: a feature-hashing ("hashing trick")
// bag-of-words vector with sublinear term weighting, L2-normalized. It needs no
// model download, no native build, no network, and adds zero vulnerabilities —
// so retrieval works out of the box, offline and key-free. It captures lexical
// overlap (the classic RAG baseline), which is enough to rank a candidate's own
// chunks against a query.
//
// A higher-quality NEURAL provider (e.g. MiniLM via Transformers.js) can be
// plugged in via `setEmbedder()` for users who opt in — see phase-3.5 spec.
// Pure functions (embed/cosine/topK/blob) are unit-tested without any model.

export const EMBED_DIM = 512;
export const PROVIDER = 'hash';

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'at',
  'by', 'is', 'are', 'be', 'as', 'we', 'you', 'our', 'your', 'this', 'that',
]);

function tokenize(text) {
  return (String(text || '').toLowerCase().match(/[a-z0-9+#.]+/g) || [])
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

// FNV-1a 32-bit hash → deterministic, fast, no deps.
function hash32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// Dependency-free embedding: signed feature hashing + sublinear TF, L2-normalized.
function embedHash(text) {
  const v = new Float32Array(EMBED_DIM);
  const counts = new Map();
  for (const tok of tokenize(text)) counts.set(tok, (counts.get(tok) || 0) + 1);
  for (const [tok, c] of counts) {
    const h = hash32(tok);
    const idx = h % EMBED_DIM;
    const sign = ((h >>> 16) & 1) ? 1 : -1; // independent bit for sign
    v[idx] += sign * (1 + Math.log(c)); // sublinear term frequency
  }
  let norm = 0;
  for (let i = 0; i < EMBED_DIM; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < EMBED_DIM; i++) v[i] /= norm;
  return v;
}

// Active embedder (swappable for a neural provider or a test fake).
let activeEmbedder = embedHash;

/** Replace the embedder (e.g. an opt-in neural model, or a test fake). */
export function setEmbedder(fn) { activeEmbedder = fn || embedHash; }

/** Embedding is always available because the default needs no model/network. */
export function available() { return typeof activeEmbedder === 'function'; }

/** Embed text → Float32Array(EMBED_DIM). */
export function embed(text) { return activeEmbedder(text); }

export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0; let na = 0; let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Rank rows by cosine to the query, scaled by each row's `weight`.
 * @param rows [{ embedding: Float32Array, weight?: number, ... }]
 * @returns the top-k rows, each with an added `score`, highest first.
 */
export function topK(queryVec, rows, k = 5) {
  return rows
    .map((r) => ({ ...r, score: cosineSimilarity(queryVec, r.embedding) * (r.weight ?? 1) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

// Indices of near-duplicate vectors (cosine ≥ threshold to an earlier item).
// Pure helper the search layer can opt into to merge reworded repostings.
export function semanticDuplicates(vectors, threshold = 0.92) {
  const drop = new Set();
  for (let i = 0; i < vectors.length; i++) {
    if (drop.has(i)) continue;
    for (let j = i + 1; j < vectors.length; j++) {
      if (!drop.has(j) && cosineSimilarity(vectors[i], vectors[j]) >= threshold) drop.add(j);
    }
  }
  return drop;
}

// --- Blob (de)serialization for SQLite storage ----------------------------
export function toBlob(vec) {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
}

export function fromBlob(buf) {
  // Copy into a fresh, aligned Float32Array (SQLite Buffers may be unaligned).
  return new Float32Array(new Uint8Array(buf).buffer.slice(0, buf.length));
}

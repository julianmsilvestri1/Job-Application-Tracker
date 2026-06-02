import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import db from '../db.js';
import { queueExtraction, runExtractionForDoc } from '../services/documents/extractionQueue.js';

// Columns returned in lists — excludes the (potentially large) extracted_text.
const LIST_COLS =
  'id, type, label, original_name, stored_name, mimetype, size, is_default, ' +
  'extraction_status, extraction_error, text_chars, created_at';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

// Legacy .doc (application/msword) is not supported for text extraction — use DOCX or PDF.
const ALLOWED = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]);

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    if (ALLOWED.has(file.mimetype)) cb(null, true);
    else cb(new Error('Unsupported file type. Upload PDF, DOCX, or TXT (.doc is not supported).'));
  },
});

const router = Router();

router.get('/', (req, res) => {
  res.json(db.prepare(`SELECT ${LIST_COLS} FROM documents ORDER BY created_at DESC`).all());
});

router.post('/', upload.single('file'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const type = req.body.type || 'resume';
  const isDefault = req.body.is_default ? 1 : 0;

  if (isDefault) {
    db.prepare('UPDATE documents SET is_default = 0 WHERE type = ?').run(type);
  }
  const info = db.prepare(`
    INSERT INTO documents (type, label, original_name, stored_name, mimetype, size, is_default)
    VALUES (@type, @label, @original_name, @stored_name, @mimetype, @size, @is_default)
  `).run({
    type,
    label: req.body.label || req.file.originalname,
    original_name: req.file.originalname,
    stored_name: req.file.filename,
    mimetype: req.file.mimetype,
    size: req.file.size,
    is_default: isDefault,
  });

  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(info.lastInsertRowid);
  queueExtraction(doc);
  res.status(201).json(db.prepare(`SELECT ${LIST_COLS} FROM documents WHERE id = ?`).get(doc.id));
});

// Extracted text for a single document (loaded on demand, not in lists).
router.get('/:id/text', (req, res) => {
  const doc = db.prepare('SELECT id, extracted_text, extraction_status FROM documents WHERE id = ?')
    .get(Number(req.params.id));
  if (!doc) return res.status(404).json({ error: 'Not found' });
  res.json({ id: doc.id, status: doc.extraction_status, text: doc.extracted_text || '' });
});

// Retry extraction for a document that failed or predates this feature.
router.post('/:id/reextract', async (req, res, next) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(Number(req.params.id));
  if (!doc) return res.status(404).json({ error: 'Not found' });
  try {
    await runExtractionForDoc(doc);
  } catch (err) {
    next(err);
    return;
  }
  res.json(db.prepare(`SELECT ${LIST_COLS} FROM documents WHERE id = ?`).get(doc.id));
});

router.get('/:id/download', (req, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(Number(req.params.id));
  if (!doc) return res.status(404).json({ error: 'Not found' });
  const filePath = path.join(uploadsDir, doc.stored_name);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File missing on disk' });
  res.download(filePath, doc.original_name);
});

router.put('/:id/default', (req, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(Number(req.params.id));
  if (!doc) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE documents SET is_default = 0 WHERE type = ?').run(doc.type);
  db.prepare('UPDATE documents SET is_default = 1 WHERE id = ?').run(doc.id);
  const updated = db.prepare('SELECT * FROM documents WHERE id = ?').get(doc.id);
  if (
    updated.type === 'resume'
    && updated.extraction_status !== 'done'
    && updated.mimetype !== 'application/msword'
  ) {
    queueExtraction(updated);
  }
  res.json(db.prepare(`SELECT ${LIST_COLS} FROM documents WHERE id = ?`).get(doc.id));
});

router.delete('/:id', (req, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(Number(req.params.id));
  if (doc) {
    const filePath = path.join(uploadsDir, doc.stored_name);
    fs.rm(filePath, { force: true }, () => {});
    db.prepare('DELETE FROM documents WHERE id = ?').run(doc.id);
  }
  res.status(204).end();
});

export default router;

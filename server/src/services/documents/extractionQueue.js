// Runs document text extraction outside the upload request path.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from '../../db.js';
import { extractText } from './extract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '..', '..', '..', 'uploads');

export async function runExtractionForDoc(doc) {
  const filePath = path.join(uploadsDir, doc.stored_name);
  const { text, status, error } = await extractText({ path: filePath, mimetype: doc.mimetype });
  db.prepare(`
    UPDATE documents
    SET extracted_text = @text, extraction_status = @status,
        extraction_error = @error, text_chars = @chars
    WHERE id = @id
  `).run({ id: doc.id, text, status, error, chars: text.length });
}

export function queueExtraction(doc) {
  setImmediate(() => {
    runExtractionForDoc(doc).catch((err) => {
      console.error(`Document extraction failed (id=${doc.id}):`, err.message);
      db.prepare(`
        UPDATE documents SET extraction_status = 'failed', extraction_error = @error WHERE id = @id
      `).run({ id: doc.id, error: err.message });
    });
  });
}

/** Re-queue pending extractions after upgrade or server restart. */
export function backfillPendingExtractions() {
  const rows = db.prepare(`
    SELECT * FROM documents
    WHERE extraction_status = 'pending'
      AND mimetype IN ('application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain')
  `).all();
  for (const doc of rows) queueExtraction(doc);
}

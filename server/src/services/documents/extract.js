// Extract plain text from uploaded documents so the AI can read them.
// Dispatches by mimetype; PDF via unpdf (modern pdf.js), DOCX via mammoth,
// TXT directly. Legacy .doc (binary) is unsupported.
import fs from 'node:fs/promises';

const MAX_CHARS = 50_000; // cap stored text to keep prompts/DB sane

function normalize(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
    .slice(0, MAX_CHARS);
}

/**
 * @returns {Promise<{text:string,status:'done'|'failed'|'unsupported',error:string}>}
 */
export async function extractText({ path, mimetype }) {
  try {
    if (mimetype === 'application/pdf') {
      // unpdf bundles a current pdf.js that handles modern PDFs (xref/object
      // streams) — unlike the unmaintained pdf-parse it replaced.
      const { getDocumentProxy, extractText: extractPdfText } = await import('unpdf');
      const buf = await fs.readFile(path);
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const { text } = await extractPdfText(pdf, { mergePages: true });
      return ok(text);
    }
    if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const { default: mammoth } = await import('mammoth');
      const { value } = await mammoth.extractRawText({ path });
      return ok(value);
    }
    if (mimetype === 'text/plain') {
      return ok(await fs.readFile(path, 'utf8'));
    }
    return { text: '', status: 'unsupported', error: `Unsupported type: ${mimetype}` };
  } catch (err) {
    return { text: '', status: 'failed', error: err.message };
  }
}

function ok(raw) {
  const text = normalize(raw);
  return text
    ? { text, status: 'done', error: '' }
    : { text: '', status: 'failed', error: 'No text could be extracted.' };
}

export { MAX_CHARS };

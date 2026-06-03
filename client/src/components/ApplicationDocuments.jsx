import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from './Toaster.jsx';

// Documents section of the apply workspace (Unit 2.1): shows which resume /
// cover letter / portfolio variant is attached to this application, and lets
// the user attach (with role + variant tag + label) or detach.
const ROLES = ['resume', 'cover_letter', 'portfolio', 'references', 'transcript', 'other'];
const VARIANT_PRESETS = ['', 'quant', 'analytics', 'underwriting', 'pe', 'ib', 'european-format'];

export default function ApplicationDocuments({ applicationId, attached, onChanged }) {
  const [docs, setDocs] = useState([]);
  const [documentId, setDocumentId] = useState('');
  const [role, setRole] = useState('resume');
  const [variantTag, setVariantTag] = useState('');
  const [label, setLabel] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    api.getDocuments().then(setDocs).catch((e) => toast(e.message, 'error'));
  }, [toast]);

  async function attach(body) {
    try {
      await api.attachDocument(applicationId, body);
      toast('Document linked', 'success');
      setDocumentId(''); setVariantTag(''); setLabel('');
      onChanged?.();
    } catch (e) {
      toast(e.message, 'error');
    }
  }
  async function attachSelected() {
    if (!documentId) return;
    await attach({ documentId: Number(documentId), role, variantTag, label });
  }
  async function attachDefaultResume() {
    const def = docs.find((d) => d.type === 'resume' && d.is_default);
    if (!def) { toast('No default resume set', 'error'); return; }
    await attach({ documentId: def.id, role: 'resume', label: def.label || def.original_name });
  }
  async function detach(docId) {
    try {
      await api.detachDocument(applicationId, docId);
      onChanged?.();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  return (
    <div>
      {attached.length === 0 ? (
        <div className="empty">No documents linked to this application yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {attached.map((d) => (
            <div key={`${d.document_id}-${d.role}`} className="job-meta" style={{ alignItems: 'center' }}>
              <span className="badge source">{d.role}</span>
              <strong>{d.label || d.original_name}</strong>
              {d.variant_tag && <span className="badge">{d.variant_tag}</span>}
              <span className="muted">{d.extraction_status === 'done' ? 'text ready' : d.extraction_status}</span>
              <a href={api.downloadUrl(d.document_id)} target="_blank" rel="noreferrer">Download ↗</a>
              <button className="btn small danger" onClick={() => detach(d.document_id)}>Detach</button>
            </div>
          ))}
        </div>
      )}

      <div className="field" style={{ marginTop: 12 }}>
        <button className="btn small secondary" onClick={attachDefaultResume}>Attach default resume</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
        <div className="field">
          <label>Document</label>
          <select value={documentId} onChange={(e) => setDocumentId(e.target.value)}>
            <option value="">Select a document…</option>
            {docs.map((d) => (
              <option key={d.id} value={d.id}>{d.label || d.original_name} ({d.type})</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Variant tag</label>
          <input list="variant-presets" value={variantTag} placeholder="e.g. analytics"
            onChange={(e) => setVariantTag(e.target.value)} />
          <datalist id="variant-presets">
            {VARIANT_PRESETS.filter(Boolean).map((v) => <option key={v} value={v} />)}
          </datalist>
        </div>
        <div className="field">
          <label>Label</label>
          <input value={label} placeholder="Resume — analytics (Python/R)"
            onChange={(e) => setLabel(e.target.value)} />
        </div>
      </div>
      <button className="btn small" disabled={!documentId} onClick={attachSelected} style={{ marginTop: 8 }}>
        Attach document
      </button>
    </div>
  );
}

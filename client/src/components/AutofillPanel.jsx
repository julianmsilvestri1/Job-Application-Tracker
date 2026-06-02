import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from './Toaster.jsx';

// Copy-to-clipboard helper: one click copies a profile field so you can
// paste it into any external application form (phase-1 autofill).
export default function AutofillPanel({ onClose }) {
  const [fields, setFields] = useState([]);
  const [copied, setCopied] = useState(null);
  const { toast } = useToast();

  useEffect(() => {
    api.getAutofill()
      .then((r) => setFields(r.fields))
      .catch((e) => {
        setFields([]);
        toast(e.message, 'error');
      });
  }, [toast]);

  function copy(field) {
    navigator.clipboard.writeText(field.value);
    setCopied(field.label);
    setTimeout(() => setCopied(null), 1200);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Autofill Helper</h3>
          <button className="btn ghost" onClick={onClose}>✕</button>
        </div>
        <div className="banner info">
          Click any field to copy it, then paste into the job site’s form. Fields come
          straight from your Profile — keep it up to date for the best autofill.
        </div>
        {fields.length === 0 && (
          <p className="muted">No profile fields yet. Fill out your Profile first.</p>
        )}
        {fields.map((f) => (
          <div key={f.label} className="autofill-item">
            <div>
              <div className="autofill-label">{f.label}</div>
              <div className="autofill-value">{f.value}</div>
            </div>
            <button className="btn small secondary" onClick={() => copy(f)}>
              {copied === f.label ? 'Copied!' : 'Copy'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

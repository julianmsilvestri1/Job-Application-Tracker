import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from './Toaster.jsx';

// Packet section of the workspace (Unit 2.4): copy grouped autofill fields and
// answers, download attached documents, open the posting, and trigger the
// backend Stagehand auto-apply for the posting URL.
const SENSITIVITY_LABEL = { public: 'Public', contact: 'Contact', sensitive: 'Sensitive' };

// Friendly, value-free summary of why fields were skipped during an auto-apply.
const SKIP_LABEL = {
  redacted: 'sensitive/EEO', prefilled: 'already filled',
  unresolved: 'no matching data', low_confidence: 'low confidence',
};
function summarizeSkips(details) {
  const counts = {};
  for (const d of details) if (d.action === 'skipped') counts[d.reason] = (counts[d.reason] || 0) + 1;
  const parts = Object.entries(counts).map(([reason, n]) => `${n} ${SKIP_LABEL[reason] || reason}`);
  return parts.length ? `Skipped: ${parts.join(', ')}.` : '';
}

export default function ApplicationPacketPanel({ applicationId, application }) {
  const [packet, setPacket] = useState(null);
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState(null);
  const { toast } = useToast();

  useEffect(() => {
    api.getPacket(applicationId).then(setPacket).catch((e) => toast(e.message, 'error'));
  }, [applicationId, toast]);

  function copy(text) {
    navigator.clipboard?.writeText(text).then(() => toast('Copied', 'success')).catch(() => {});
  }

  async function applyForMe() {
    if (!application?.url) { toast('No posting URL on this application', 'error'); return; }
    setBusy(true); setRun(null);
    try {
      const summary = await api.triggerApply(applicationId, application.url);
      setRun(summary);
      toast(summary.submitted ? 'Submitted' : `Filled ${summary.filledCount} field(s)`, 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  if (!packet) return <div className="empty">Loading packet…</div>;

  const grouped = ['public', 'contact', 'sensitive'].map((s) => ({
    sensitivity: s,
    fields: packet.candidate.fields.filter((f) => f.sensitivity === s),
  })).filter((g) => g.fields.length);

  return (
    <div>
      {grouped.map((g) => (
        <div key={g.sensitivity} className="field" style={{ marginTop: 10 }}>
          <label>{SENSITIVITY_LABEL[g.sensitivity]} fields</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {g.fields.map((f) => (
              <div key={f.label} className="job-meta" style={{ alignItems: 'center' }}>
                <span style={{ minWidth: 160 }}>{f.label}</span>
                <span className="muted" style={{ flex: 1 }}>{f.value}</span>
                <button className="btn small secondary" onClick={() => copy(f.value)}>Copy</button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {packet.documents.length > 0 && (
        <div className="field" style={{ marginTop: 10 }}>
          <label>Attached documents</label>
          {packet.documents.map((d) => (
            <div key={d.documentId} className="job-meta" style={{ alignItems: 'center' }}>
              <span className="badge source">{d.role}</span>
              <span style={{ flex: 1 }}>{d.label}{d.variantTag ? ` · ${d.variantTag}` : ''}</span>
              <a href={d.downloadUrl} target="_blank" rel="noreferrer">Download ↗</a>
            </div>
          ))}
        </div>
      )}

      {packet.answers.length > 0 && (
        <div className="field" style={{ marginTop: 10 }}>
          <label>Saved answers</label>
          {packet.answers.map((a, i) => (
            <div key={i} className="job-meta" style={{ alignItems: 'flex-start' }}>
              <span style={{ flex: 1 }}><strong>{a.question}</strong><br /><span className="muted">{a.answer}</span></span>
              <button className="btn small secondary" onClick={() => copy(a.answer)}>Copy</button>
            </div>
          ))}
        </div>
      )}

      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        {application?.url && <a className="btn small secondary" href={application.url} target="_blank" rel="noreferrer">Open posting ↗</a>}
        <button className="btn small" disabled={busy || !application?.url} onClick={applyForMe}>
          {busy ? 'Applying…' : '⚡ Apply for me'}
        </button>
      </div>

      {run && (
        <p className="muted" style={{ marginTop: 8 }}>
          {run.hostname}: filled {run.filledCount}, skipped {run.skippedCount}{run.submitted ? ', submitted ✓' : ''}.
        </p>
      )}
      {run?.details?.length > 0 && summarizeSkips(run.details) && (
        <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>{summarizeSkips(run.details)}</p>
      )}

      <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
        Auto-apply needs Chrome running with remote debugging
        (<code>google-chrome --remote-debugging-port=9222</code>) and the apply tab open.
        Sensitive/EEO fields are never auto-filled.
      </p>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../components/Toaster.jsx';

// Apply safety + extension settings (Unit 2.8). Safe defaults: the assistant
// fills and the human submits; sensitive/EEO fields are never auto-filled.
function Toggle({ checked, onChange, title, children }) {
  return (
    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', margin: '10px 0', cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: 3 }} />
      <span>
        <strong>{title}</strong>
        <div className="muted" style={{ fontSize: 13 }}>{children}</div>
      </span>
    </label>
  );
}

export default function Settings() {
  const [policy, setPolicy] = useState(null);
  const { toast } = useToast();

  useEffect(() => {
    api.getApplyPolicy().then(setPolicy).catch((e) => toast(e.message, 'error'));
  }, [toast]);

  async function update(patch) {
    try {
      setPolicy(await api.updateApplyPolicy(patch));
      toast('Settings saved', 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  return (
    <div>
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">Control how the apply assistant behaves. Safe by default: it fills, you submit.</p>

      {!policy ? (
        <div className="empty">Loading…</div>
      ) : (
        <>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Auto-apply safety</h3>

            <Toggle title="Auto-submit applications" checked={policy.canSubmit} onChange={(v) => update({ autoSubmit: v })}>
              Off by default. When on, the assistant submits <em>only</em> after every required field is filled and
              verified; anything it can’t verify is left flagged for your review. It never submits a partial or
              unverified form.
            </Toggle>

            <Toggle title="Fill fields that already have a value" checked={policy.fillExisting} onChange={(v) => update({ fillExisting: v })}>
              Off by default — the assistant never overwrites values already on the form.
            </Toggle>

            <Toggle title="Use my custom profile fields" checked={policy.includeCustomFields} onChange={(v) => update({ includeCustomFields: v })}>
              Include extra saved fields (e.g. license class, language proficiency) when filling.
            </Toggle>

            <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
              <strong>Never auto-filled:</strong> {policy.sensitiveDenylist.join(', ')}.
            </p>
          </div>

          <div className="card">
            <div className="section-actions">
              <h3 style={{ margin: 0 }}>Browser extension</h3>
              <span className="badge source">v{policy.extensionVersion}</span>
            </div>
            <p className="muted" style={{ fontSize: 13 }}>
              The extension is a trigger UI — it previews your packet and asks the portal to fill; it never scrapes or
              submits the page itself.
            </p>
            <p style={{ fontSize: 14, marginBottom: 4 }}><strong>Chrome / Arc / Edge (desktop)</strong></p>
            <ol style={{ marginTop: 0, fontSize: 13 }} className="muted">
              <li>In <code>extension-safari/</code> run <code>npm run build</code>, load <code>dist/chrome/</code> unpacked.</li>
              <li>Open the extension Options, set the portal URL, and Test connection.</li>
              <li>For auto-apply, launch Chrome with <code>--remote-debugging-port=9222</code>.</li>
            </ol>
            <p style={{ fontSize: 14, marginBottom: 4 }}><strong>Safari on iPad (primary mobile)</strong></p>
            <ol style={{ marginTop: 0, fontSize: 13 }} className="muted">
              <li>Run the portal with <code>HOST=0.0.0.0</code>; note your Mac’s LAN address.</li>
              <li>Build, then <code>./scripts/build-safari.sh</code>; run the Xcode project to your iPad.</li>
              <li>Enable under <em>Settings → Apps → Safari → Extensions</em>; set the portal URL to your LAN address.</li>
            </ol>
            <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
              Full steps: <code>extension-safari/README.md</code>.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

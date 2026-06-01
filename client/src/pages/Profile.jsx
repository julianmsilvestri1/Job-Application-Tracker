import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [experiences, setExperiences] = useState([]);
  const [education, setEducation] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [toast, setToast] = useState('');

  function notify(msg) { setToast(msg); setTimeout(() => setToast(''), 1600); }

  function load() {
    api.getProfile().then(({ profile, experiences, education }) => {
      setProfile(profile); setExperiences(experiences); setEducation(education);
    }).catch(() => {});
    api.getDocuments().then(setDocuments).catch(() => {});
  }
  useEffect(load, []);

  if (!profile) return <p className="spin">Loading…</p>;

  return (
    <div>
      <h1 className="page-title">My Profile</h1>
      <p className="page-sub">This powers autofill, cover letters and application answers.</p>

      <PersonalInfo profile={profile} setProfile={setProfile} notify={notify} />
      <SkillsCard profile={profile} setProfile={setProfile} notify={notify} />
      <ExperienceCard items={experiences} reload={load} notify={notify} />
      <EducationCard items={education} reload={load} notify={notify} />
      <DocumentsCard documents={documents} reload={load} notify={notify} />
      <CustomFieldsCard profile={profile} setProfile={setProfile} notify={notify} />

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function PersonalInfo({ profile, setProfile, notify }) {
  const [form, setForm] = useState(profile);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function save() {
    const saved = await api.updateProfile(form);
    setProfile(saved); setForm(saved); notify('Profile saved');
  }

  return (
    <div className="card">
      <h3>Personal information</h3>
      <div className="grid-2">
        <Field label="Full name"><input value={form.full_name} onChange={set('full_name')} /></Field>
        <Field label="Headline"><input value={form.headline} onChange={set('headline')} placeholder="Senior Frontend Engineer" /></Field>
        <Field label="Email"><input value={form.email} onChange={set('email')} /></Field>
        <Field label="Phone"><input value={form.phone} onChange={set('phone')} /></Field>
        <Field label="Location"><input value={form.location} onChange={set('location')} /></Field>
        <Field label="Years of experience"><input value={form.years_experience} onChange={set('years_experience')} /></Field>
        <Field label="LinkedIn URL"><input value={form.linkedin} onChange={set('linkedin')} /></Field>
        <Field label="GitHub URL"><input value={form.github} onChange={set('github')} /></Field>
        <Field label="Website / portfolio"><input value={form.website} onChange={set('website')} /></Field>
        <Field label="Desired salary"><input value={form.desired_salary} onChange={set('desired_salary')} /></Field>
        <Field label="Work authorization">
          <input value={form.work_authorization} onChange={set('work_authorization')} placeholder="e.g. US Citizen / H1-B" />
        </Field>
        <Field label="Require visa sponsorship?">
          <select value={form.needs_sponsorship ? 'yes' : 'no'}
            onChange={(e) => setForm({ ...form, needs_sponsorship: e.target.value === 'yes' })}>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </Field>
      </div>
      <Field label="Professional summary">
        <textarea value={form.summary} onChange={set('summary')} placeholder="2–3 sentences about you. Used in cover letters." />
      </Field>
      <button className="btn" onClick={save}>Save profile</button>
    </div>
  );
}

function SkillsCard({ profile, setProfile, notify }) {
  const [skills, setSkills] = useState(profile.skills || []);
  const [input, setInput] = useState('');

  async function persist(next) {
    setSkills(next);
    const saved = await api.updateProfile({ skills: next });
    setProfile(saved); notify('Skills updated');
  }
  function add(e) {
    e.preventDefault();
    const v = input.trim();
    if (v && !skills.includes(v)) persist([...skills, v]);
    setInput('');
  }

  return (
    <div className="card">
      <h3>Skills</h3>
      <div className="tag-input-tags">
        {skills.map((s) => (
          <span className="tag" key={s}>{s}
            <button onClick={() => persist(skills.filter((x) => x !== s))}>✕</button>
          </span>
        ))}
        {skills.length === 0 && <span className="muted">No skills yet.</span>}
      </div>
      <form className="row" onSubmit={add}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Add a skill and press Enter" style={{ maxWidth: 300 }} />
        <button className="btn secondary" type="submit">Add</button>
      </form>
    </div>
  );
}

function ExperienceCard({ items, reload, notify }) {
  const blank = { company: '', title: '', location: '', start_date: '', end_date: '', is_current: false, description: '' };
  const [draft, setDraft] = useState(blank);
  const set = (k) => (e) => setDraft({ ...draft, [k]: e.target.value });

  async function add() {
    if (!draft.company && !draft.title) return;
    await api.addExperience(draft); setDraft(blank); reload(); notify('Experience added');
  }
  async function del(id) { await api.deleteExperience(id); reload(); }

  return (
    <div className="card">
      <h3>Work experience</h3>
      {items.map((x) => (
        <div key={x.id} className="autofill-item">
          <div>
            <div>{x.title} {x.company && `· ${x.company}`}</div>
            <div className="autofill-label">
              {x.start_date} – {x.is_current ? 'Present' : x.end_date} {x.location && `· ${x.location}`}
            </div>
          </div>
          <button className="btn small danger" onClick={() => del(x.id)}>Remove</button>
        </div>
      ))}
      <div className="divider" />
      <div className="grid-2">
        <Field label="Title"><input value={draft.title} onChange={set('title')} /></Field>
        <Field label="Company"><input value={draft.company} onChange={set('company')} /></Field>
        <Field label="Start"><input value={draft.start_date} onChange={set('start_date')} placeholder="Jan 2022" /></Field>
        <Field label="End"><input value={draft.end_date} onChange={set('end_date')} placeholder="Present" disabled={draft.is_current} /></Field>
      </div>
      <div className="checkbox-row" style={{ marginBottom: 12 }}>
        <input id="cur" type="checkbox" checked={draft.is_current} onChange={(e) => setDraft({ ...draft, is_current: e.target.checked })} />
        <label htmlFor="cur">I currently work here</label>
      </div>
      <Field label="Description"><textarea value={draft.description} onChange={set('description')} /></Field>
      <button className="btn secondary" onClick={add}>+ Add experience</button>
    </div>
  );
}

function EducationCard({ items, reload, notify }) {
  const blank = { school: '', degree: '', field: '', start_date: '', end_date: '', gpa: '' };
  const [draft, setDraft] = useState(blank);
  const set = (k) => (e) => setDraft({ ...draft, [k]: e.target.value });

  async function add() {
    if (!draft.school) return;
    await api.addEducation(draft); setDraft(blank); reload(); notify('Education added');
  }
  async function del(id) { await api.deleteEducation(id); reload(); }

  return (
    <div className="card">
      <h3>Education</h3>
      {items.map((x) => (
        <div key={x.id} className="autofill-item">
          <div>
            <div>{x.degree} {x.field && `in ${x.field}`}</div>
            <div className="autofill-label">{x.school} · {x.start_date} – {x.end_date} {x.gpa && `· GPA ${x.gpa}`}</div>
          </div>
          <button className="btn small danger" onClick={() => del(x.id)}>Remove</button>
        </div>
      ))}
      <div className="divider" />
      <div className="grid-2">
        <Field label="School"><input value={draft.school} onChange={set('school')} /></Field>
        <Field label="Degree"><input value={draft.degree} onChange={set('degree')} placeholder="B.S." /></Field>
        <Field label="Field of study"><input value={draft.field} onChange={set('field')} /></Field>
        <Field label="GPA"><input value={draft.gpa} onChange={set('gpa')} /></Field>
        <Field label="Start"><input value={draft.start_date} onChange={set('start_date')} /></Field>
        <Field label="End"><input value={draft.end_date} onChange={set('end_date')} /></Field>
      </div>
      <button className="btn secondary" onClick={add}>+ Add education</button>
    </div>
  );
}

const EXTRACTION = {
  done: { label: '✓ text ready', cls: 'applied' },
  pending: { label: '… extracting', cls: 'saved' },
  failed: { label: '⚠ no text', cls: 'rejected' },
  unsupported: { label: '⚠ unsupported', cls: 'archived' },
};

function DocumentsCard({ documents, reload, notify }) {
  const [file, setFile] = useState(null);
  const [type, setType] = useState('resume');
  const [preview, setPreview] = useState(null); // { id, text }

  async function upload() {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('type', type);
    fd.append('is_default', documents.filter((d) => d.type === type).length === 0 ? '1' : '');
    try {
      await api.uploadDocument(fd); setFile(null); reload(); notify('Uploaded & text extracted');
    } catch (e) { notify(e.message); }
  }

  async function togglePreview(id) {
    if (preview?.id === id) { setPreview(null); return; }
    try {
      const r = await api.getDocumentText(id);
      setPreview({ id, text: r.text || '(no text extracted)' });
    } catch (e) { notify(e.message); }
  }

  async function reextract(id) {
    try { await api.reextractDocument(id); reload(); notify('Re-extracted'); }
    catch (e) { notify(e.message); }
  }

  return (
    <div className="card">
      <h3>Resume & documents</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        Text is extracted from each upload so the AI can tailor letters and answers to your real CV.
      </p>
      {documents.length === 0 && <p className="muted">No documents uploaded yet.</p>}
      {documents.map((d) => {
        const ex = EXTRACTION[d.extraction_status] || EXTRACTION.pending;
        return (
          <div key={d.id}>
            <div className="autofill-item">
              <div>
                <div>
                  {d.original_name} {d.is_default ? <span className="badge source">default {d.type}</span> : null}
                  {' '}<span className={`badge ${ex.cls}`} title={d.extraction_error || ''}>{ex.label}</span>
                </div>
                <div className="autofill-label">
                  {d.type} · {(d.size / 1024).toFixed(0)} KB
                  {d.text_chars > 0 && ` · ${d.text_chars.toLocaleString()} chars`}
                </div>
              </div>
              <div className="row">
                {d.extraction_status === 'done' && (
                  <button className="btn small ghost" onClick={() => togglePreview(d.id)}>
                    {preview?.id === d.id ? 'Hide text' : 'Preview text'}
                  </button>
                )}
                {(d.extraction_status === 'failed' || d.extraction_status === 'pending') && (
                  <button className="btn small ghost" onClick={() => reextract(d.id)}>Re-extract</button>
                )}
                <a className="btn small secondary" href={api.downloadUrl(d.id)}>Download</a>
                {!d.is_default && (
                  <button className="btn small ghost" onClick={async () => { await api.setDefaultDocument(d.id); reload(); }}>
                    Set default
                  </button>
                )}
                <button className="btn small danger" onClick={async () => { await api.deleteDocument(d.id); reload(); }}>Delete</button>
              </div>
            </div>
            {preview?.id === d.id && (
              <pre style={{ whiteSpace: 'pre-wrap', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, fontSize: 12, maxHeight: 240, overflow: 'auto', margin: '0 0 12px' }}>
                {preview.text}
              </pre>
            )}
          </div>
        );
      })}
      <div className="divider" />
      <div className="row">
        <select value={type} onChange={(e) => setType(e.target.value)} style={{ width: 'auto' }}>
          <option value="resume">Resume</option>
          <option value="cover_letter">Cover letter</option>
          <option value="other">Other</option>
        </select>
        <input type="file" accept=".pdf,.doc,.docx,.txt" onChange={(e) => setFile(e.target.files[0])} style={{ width: 'auto' }} />
        <button className="btn secondary" onClick={upload} disabled={!file}>Upload</button>
      </div>
      <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>PDF, DOCX or TXT extract text · DOC up to 10 MB.</p>
    </div>
  );
}

function CustomFieldsCard({ profile, setProfile, notify }) {
  const [fields, setFields] = useState(Object.entries(profile.custom_fields || {}));
  const [k, setK] = useState('');
  const [v, setV] = useState('');

  async function persist(next) {
    setFields(next);
    const obj = Object.fromEntries(next);
    const saved = await api.updateProfile({ custom_fields: obj });
    setProfile(saved); notify('Saved');
  }
  function add() {
    if (!k.trim()) return;
    persist([...fields.filter(([key]) => key !== k), [k, v]]); setK(''); setV('');
  }

  return (
    <div className="card">
      <h3>Custom answers</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        Reusable answers to common application questions. They appear in the autofill helper.
      </p>
      {fields.map(([key, val]) => (
        <div key={key} className="autofill-item">
          <div>
            <div className="autofill-label">{key}</div>
            <div className="autofill-value">{val}</div>
          </div>
          <button className="btn small danger" onClick={() => persist(fields.filter(([x]) => x !== key))}>Remove</button>
        </div>
      ))}
      <div className="divider" />
      <div className="grid-2">
        <Field label="Question / label"><input value={k} onChange={(e) => setK(e.target.value)} placeholder="Preferred start date" /></Field>
        <Field label="Answer"><input value={v} onChange={(e) => setV(e.target.value)} placeholder="Two weeks' notice" /></Field>
      </div>
      <button className="btn secondary" onClick={add}>+ Add answer</button>
    </div>
  );
}

function Field({ label, children }) {
  return <div className="field"><label>{label}</label>{children}</div>;
}

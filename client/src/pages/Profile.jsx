import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../components/Toaster.jsx';

export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [experiences, setExperiences] = useState([]);
  const [education, setEducation] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [preferences, setPreferences] = useState(null);
  const { toast } = useToast();
  const notify = useCallback((m) => toast(m, 'success'), [toast]);
  const notifyError = useCallback((e) => toast(e?.message || String(e), 'error'), [toast]);

  const load = useCallback(() => {
    api.getProfile().then(({ profile, experiences, education }) => {
      setProfile(profile); setExperiences(experiences); setEducation(education);
    }).catch((e) => toast(e.message, 'error'));
    api.getDocuments().then(setDocuments).catch((e) => toast(e.message, 'error'));
    api.getPreferences().then(setPreferences).catch((e) => toast(e.message, 'error'));
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  if (!profile) return <p className="spin">Loading…</p>;

  return (
    <div>
      <h1 className="page-title">My Profile</h1>
      <p className="page-sub">This powers autofill, cover letters and application answers.</p>

      <PersonalInfo profile={profile} setProfile={setProfile} notify={notify} notifyError={notifyError} />
      <SkillsCard profile={profile} setProfile={setProfile} notify={notify} notifyError={notifyError} />
      {preferences && (
        <PreferencesCard preferences={preferences} setPreferences={setPreferences} notify={notify} notifyError={notifyError} />
      )}
      <PositioningCard profile={profile} setProfile={setProfile} notify={notify} notifyError={notifyError} />
      <ExperienceCard items={experiences} reload={load} notify={notify} notifyError={notifyError} />
      <EducationCard items={education} reload={load} notify={notify} notifyError={notifyError} />
      <DocumentsCard documents={documents} reload={load} notify={notify} notifyError={notifyError} />
      <OrphanAnswersCard notify={notify} notifyError={notifyError} />
      <CustomFieldsCard profile={profile} setProfile={setProfile} notify={notify} notifyError={notifyError} />
    </div>
  );
}

function PersonalInfo({ profile, setProfile, notify, notifyError }) {
  const [form, setForm] = useState(profile);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function save() {
    try {
      const saved = await api.updateProfile(form);
      setProfile(saved); setForm(saved); notify('Profile saved');
    } catch (e) { notifyError(e); }
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

function SkillsCard({ profile, setProfile, notify, notifyError }) {
  const [skills, setSkills] = useState(profile.skills || []);
  const [input, setInput] = useState('');

  async function persist(next) {
    setSkills(next);
    try {
      const saved = await api.updateProfile({ skills: next });
      setProfile(saved); notify('Skills updated');
    } catch (e) { notifyError(e); }
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

function PreferencesCard({ preferences, setPreferences, notify, notifyError }) {
  const [form, setForm] = useState({
    ...preferences,
    titles: (preferences.titles || []).join(', '),
    locations: (preferences.locations || []).join(', '),
    keywords: (preferences.keywords || []).join(', '),
    sources: (preferences.sources || []).join(', '),
  });

  async function save() {
    try {
      const saved = await api.updatePreferences({
        titles: splitList(form.titles),
        locations: splitList(form.locations),
        keywords: splitList(form.keywords),
        sources: splitList(form.sources),
        remote_only: form.remote_only,
        min_salary: form.min_salary,
      });
      setPreferences(saved);
      setForm({
        ...saved,
        titles: (saved.titles || []).join(', '),
        locations: (saved.locations || []).join(', '),
        keywords: (saved.keywords || []).join(', '),
        sources: (saved.sources || []).join(', '),
      });
      notify('Job preferences saved');
    } catch (e) { notifyError(e); }
  }

  return (
    <div className="card">
      <h3>Job preferences</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        These power the Dashboard recommendations and fit-ranked discovery.
      </p>
      <div className="grid-2">
        <Field label="Target titles"><input value={form.titles} onChange={(e) => setForm({ ...form, titles: e.target.value })} placeholder="Product Manager, Growth Lead" /></Field>
        <Field label="Preferred locations"><input value={form.locations} onChange={(e) => setForm({ ...form, locations: e.target.value })} placeholder="Remote, New York" /></Field>
        <Field label="Keywords"><input value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} placeholder="AI, SaaS, customer success" /></Field>
        <Field label="Sources"><input value={form.sources} onChange={(e) => setForm({ ...form, sources: e.target.value })} placeholder="Optional: remotive,themuse" /></Field>
        <Field label="Minimum salary"><input value={form.min_salary || ''} onChange={(e) => setForm({ ...form, min_salary: e.target.value })} placeholder="$120k" /></Field>
        <div className="checkbox-row" style={{ alignSelf: 'center' }}>
          <input
            id="pref-remote"
            type="checkbox"
            checked={Boolean(form.remote_only)}
            onChange={(e) => setForm({ ...form, remote_only: e.target.checked })}
          />
          <label htmlFor="pref-remote">Remote only</label>
        </div>
      </div>
      <button className="btn" onClick={save}>Save preferences</button>
    </div>
  );
}

function PositioningCard({ profile, setProfile, notify, notifyError }) {
  const [positioning, setPositioning] = useState(null);
  const [loading, setLoading] = useState(false);

  async function load(refresh = false) {
    setLoading(true);
    try {
      setPositioning(await api.getPositioning(refresh));
    } catch (e) { notifyError(e); }
    setLoading(false);
  }

  async function applyProfile(update, message) {
    try {
      const saved = await api.updateProfile(update);
      setProfile(saved);
      notify(message);
    } catch (e) { notifyError(e); }
  }

  return (
    <div className="card">
      <div className="section-actions">
        <div>
          <h3 style={{ margin: 0 }}>Positioning</h3>
          <div className="autofill-label">AI-tailored headline, target title, and keyword guidance.</div>
        </div>
        <button className="btn small secondary" onClick={() => load(Boolean(positioning))} disabled={loading}>
          {loading ? 'Thinking…' : positioning ? 'Refresh' : 'Generate'}
        </button>
      </div>
      {!positioning ? (
        <p className="muted">Generate suggestions from your profile, work history, and default resume text.</p>
      ) : (
        <>
          {positioning.warning && <div className="banner">{positioning.warning}</div>}
          <label>Headline variants</label>
          <div className="suggestion-list">
            {(positioning.headlines || []).map((headline) => (
              <button key={headline} className="suggestion" onClick={() => applyProfile({ headline }, 'Headline applied')}>
                {headline}
              </button>
            ))}
          </div>
          <label>Target titles</label>
          <div className="tag-input-tags">
            {(positioning.targetTitles || []).map((title) => (
              <a key={title} className="tag" href={`/search?q=${encodeURIComponent(title)}`}>{title}</a>
            ))}
          </div>
          <label>Keyword strategy</label>
          <ul className="muted" style={{ marginTop: 0 }}>
            {(positioning.keywordStrategy || []).map((item) => <li key={item}>{item}</li>)}
          </ul>
          {positioning.summaryRewrite && (
            <>
              <Field label="Summary rewrite">
                <textarea value={positioning.summaryRewrite} readOnly />
              </Field>
              <button
                className="btn secondary"
                onClick={() => applyProfile({ summary: positioning.summaryRewrite }, 'Summary applied')}
              >
                Apply summary rewrite
              </button>
            </>
          )}
          <p className="autofill-label" style={{ marginBottom: 0 }}>Current headline: {profile.headline || 'Not set'}</p>
        </>
      )}
    </div>
  );
}

function splitList(value) {
  return String(value || '').split(',').map((v) => v.trim()).filter(Boolean);
}

const EXP_BLANK = { company: '', title: '', location: '', start_date: '', end_date: '', is_current: false, description: '' };

function ExperienceFields({ draft, setDraft, idPrefix }) {
  const set = (k) => (e) => setDraft({ ...draft, [k]: e.target.value });
  return (
    <>
      <div className="grid-2">
        <Field label="Title"><input value={draft.title} onChange={set('title')} /></Field>
        <Field label="Company"><input value={draft.company} onChange={set('company')} /></Field>
        <Field label="Start"><input value={draft.start_date} onChange={set('start_date')} placeholder="Jan 2022" /></Field>
        <Field label="End"><input value={draft.end_date} onChange={set('end_date')} placeholder="Present" disabled={draft.is_current} /></Field>
      </div>
      <div className="checkbox-row" style={{ marginBottom: 12 }}>
        <input id={`${idPrefix}-cur`} type="checkbox" checked={draft.is_current}
          onChange={(e) => setDraft({ ...draft, is_current: e.target.checked })} />
        <label htmlFor={`${idPrefix}-cur`}>I currently work here</label>
      </div>
      <Field label="Location"><input value={draft.location || ''} onChange={set('location')} /></Field>
      <Field label="Description"><textarea value={draft.description} onChange={set('description')} /></Field>
    </>
  );
}

function ExperienceCard({ items, reload, notify, notifyError }) {
  const [draft, setDraft] = useState(EXP_BLANK);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(EXP_BLANK);

  async function add() {
    if (!draft.company && !draft.title) return;
    try {
      await api.addExperience(draft); setDraft(EXP_BLANK); reload(); notify('Experience added');
    } catch (e) { notifyError(e); }
  }
  async function del(id) {
    try { await api.deleteExperience(id); reload(); }
    catch (e) { notifyError(e); }
  }
  function startEdit(x) { setEditingId(x.id); setEditDraft({ ...EXP_BLANK, ...x, is_current: !!x.is_current }); }
  async function saveEdit() {
    try {
      await api.updateExperience(editingId, editDraft); setEditingId(null); reload(); notify('Experience updated');
    } catch (e) { notifyError(e); }
  }

  return (
    <div className="card">
      <h3>Work experience</h3>
      {items.map((x) => editingId === x.id ? (
        <div key={x.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12, marginBottom: 12 }}>
          <ExperienceFields draft={editDraft} setDraft={setEditDraft} idPrefix={`exp-edit-${x.id}`} />
          <div className="row">
            <button className="btn small" onClick={saveEdit}>Save</button>
            <button className="btn small ghost" onClick={() => setEditingId(null)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div key={x.id} className="autofill-item">
          <div>
            <div>{x.title} {x.company && `· ${x.company}`}</div>
            <div className="autofill-label">
              {x.start_date} – {x.is_current ? 'Present' : x.end_date} {x.location && `· ${x.location}`}
            </div>
          </div>
          <div className="row">
            <button className="btn small ghost" onClick={() => startEdit(x)}>Edit</button>
            <button className="btn small danger" onClick={() => del(x.id)}>Remove</button>
          </div>
        </div>
      ))}
      <div className="divider" />
      <ExperienceFields draft={draft} setDraft={setDraft} idPrefix="exp-add" />
      <button className="btn secondary" onClick={add}>+ Add experience</button>
    </div>
  );
}

const EDU_BLANK = { school: '', degree: '', field: '', start_date: '', end_date: '', gpa: '' };

function EducationFields({ draft, setDraft }) {
  const set = (k) => (e) => setDraft({ ...draft, [k]: e.target.value });
  return (
    <div className="grid-2">
      <Field label="School"><input value={draft.school} onChange={set('school')} /></Field>
      <Field label="Degree"><input value={draft.degree} onChange={set('degree')} placeholder="B.S." /></Field>
      <Field label="Field of study"><input value={draft.field} onChange={set('field')} /></Field>
      <Field label="GPA"><input value={draft.gpa} onChange={set('gpa')} /></Field>
      <Field label="Start"><input value={draft.start_date} onChange={set('start_date')} /></Field>
      <Field label="End"><input value={draft.end_date} onChange={set('end_date')} /></Field>
    </div>
  );
}

function EducationCard({ items, reload, notify, notifyError }) {
  const [draft, setDraft] = useState(EDU_BLANK);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(EDU_BLANK);

  async function add() {
    if (!draft.school) return;
    try {
      await api.addEducation(draft); setDraft(EDU_BLANK); reload(); notify('Education added');
    } catch (e) { notifyError(e); }
  }
  async function del(id) {
    try { await api.deleteEducation(id); reload(); }
    catch (e) { notifyError(e); }
  }
  function startEdit(x) { setEditingId(x.id); setEditDraft({ ...EDU_BLANK, ...x }); }
  async function saveEdit() {
    try {
      await api.updateEducation(editingId, editDraft); setEditingId(null); reload(); notify('Education updated');
    } catch (e) { notifyError(e); }
  }

  return (
    <div className="card">
      <h3>Education</h3>
      {items.map((x) => editingId === x.id ? (
        <div key={x.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12, marginBottom: 12 }}>
          <EducationFields draft={editDraft} setDraft={setEditDraft} />
          <div className="row">
            <button className="btn small" onClick={saveEdit}>Save</button>
            <button className="btn small ghost" onClick={() => setEditingId(null)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div key={x.id} className="autofill-item">
          <div>
            <div>{x.degree} {x.field && `in ${x.field}`}</div>
            <div className="autofill-label">{x.school} · {x.start_date} – {x.end_date} {x.gpa && `· GPA ${x.gpa}`}</div>
          </div>
          <div className="row">
            <button className="btn small ghost" onClick={() => startEdit(x)}>Edit</button>
            <button className="btn small danger" onClick={() => del(x.id)}>Remove</button>
          </div>
        </div>
      ))}
      <div className="divider" />
      <EducationFields draft={draft} setDraft={setDraft} />
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

function OrphanAnswersCard({ notify, notifyError }) {
  const [answers, setAnswers] = useState([]);

  const load = useCallback(() => {
    api.getOrphanedAnswers().then(setAnswers).catch(notifyError);
  }, [notifyError]);
  useEffect(() => { load(); }, [load]);

  async function remove(id) {
    try {
      await api.deleteAnswer(id);
      setAnswers((prev) => prev.filter((a) => a.id !== id));
      notify('Answer removed');
    } catch (e) { notifyError(e); }
  }

  if (answers.length === 0) return null;

  return (
    <div className="card">
      <h3>Saved draft answers</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        Answers you saved from job search before adding the job to your tracker.
      </p>
      {answers.map((a) => (
        <div key={a.id} className="autofill-item">
          <div>
            <div className="autofill-label">
              {a.job_title || 'Role'}{a.company ? ` · ${a.company}` : ''}
            </div>
            <div style={{ fontWeight: 500, marginTop: 4 }}>{a.question}</div>
            <div className="autofill-value">{a.answer}</div>
          </div>
          <div className="row">
            <button className="btn small ghost" onClick={() => navigator.clipboard.writeText(a.answer)}>Copy</button>
            <button className="btn small danger" onClick={() => remove(a.id)}>Delete</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function DocumentsCard({ documents, reload, notify, notifyError }) {
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
      await api.uploadDocument(fd); setFile(null); reload(); notify('Uploaded — extracting text…');
    } catch (e) { notifyError(e); }
  }

  async function togglePreview(id) {
    if (preview?.id === id) { setPreview(null); return; }
    try {
      const r = await api.getDocumentText(id);
      setPreview({ id, text: r.text || '(no text extracted)' });
    } catch (e) { notifyError(e); }
  }

  async function reextract(id) {
    try { await api.reextractDocument(id); reload(); notify('Re-extracted'); }
    catch (e) { notifyError(e); }
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
        <input type="file" accept=".pdf,.docx,.txt" onChange={(e) => setFile(e.target.files[0])} style={{ width: 'auto' }} />
        <button className="btn secondary" onClick={upload} disabled={!file}>Upload</button>
      </div>
      <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>PDF, DOCX, or TXT · up to 10 MB. Text extracts in the background.</p>
    </div>
  );
}

function CustomFieldsCard({ profile, setProfile, notify, notifyError }) {
  const [fields, setFields] = useState(Object.entries(profile.custom_fields || {}));
  const [k, setK] = useState('');
  const [v, setV] = useState('');

  async function persist(next) {
    setFields(next);
    const obj = Object.fromEntries(next);
    try {
      const saved = await api.updateProfile({ custom_fields: obj });
      setProfile(saved); notify('Saved');
    } catch (e) { notifyError(e); }
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

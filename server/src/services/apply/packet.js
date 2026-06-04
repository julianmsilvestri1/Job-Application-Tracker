// Application packet (Unit 2.4): the canonical data contract the portal
// workspace and the Stagehand apply runner both consume. DB access is
// dependency-injected so it is unit-testable against an in-memory database.

// Categories that must NEVER be auto-filled or fabricated by the resolver.
export const REDACTED_FIELDS = [
  'SSN', 'Social Security Number', 'EEO', 'Race', 'Ethnicity', 'Gender',
  'Sexual orientation', 'Disability status', 'Veteran status', 'Date of birth', 'Age',
];

// Whole-word keyword triggers used to refuse fabricating EEO/PII fields
// regardless of how the form phrases them ("Are you a protected veteran?",
// "Do you have a disability?"). Broader than the display list above; matched
// with word boundaries so substrings like "age" in "Message" never trip.
export const REDACTED_MATCH = [
  'ssn', 'social security', 'eeo', 'race', 'ethnicity', 'ethnic', 'gender',
  'sexual orientation', 'disability', 'veteran', 'date of birth', 'birthdate',
  'birth date', 'age',
];

// Profile-derived autofill fields with form aliases + a sensitivity tag.
const FIELD_SPECS = [
  { key: 'full_name', label: 'Full name', aliases: ['name', 'full name', 'your name', 'legal name'], sensitivity: 'public' },
  { key: 'email', label: 'Email', aliases: ['email', 'e-mail', 'email address'], sensitivity: 'contact' },
  { key: 'phone', label: 'Phone', aliases: ['phone', 'phone number', 'mobile', 'telephone', 'cell'], sensitivity: 'contact' },
  { key: 'location', label: 'Location', aliases: ['location', 'city', 'address', 'current location'], sensitivity: 'contact' },
  { key: 'linkedin', label: 'LinkedIn', aliases: ['linkedin', 'linkedin url', 'linkedin profile'], sensitivity: 'public' },
  { key: 'github', label: 'GitHub', aliases: ['github', 'github url'], sensitivity: 'public' },
  { key: 'website', label: 'Website', aliases: ['website', 'portfolio', 'personal site', 'url'], sensitivity: 'public' },
  { key: 'headline', label: 'Headline', aliases: ['headline', 'current title'], sensitivity: 'public' },
  { key: 'years_experience', label: 'Years of experience', aliases: ['years of experience', 'experience'], sensitivity: 'public' },
  { key: 'desired_salary', label: 'Desired salary', aliases: ['salary', 'desired salary', 'compensation', 'expected salary'], sensitivity: 'sensitive' },
  { key: 'work_authorization', label: 'Work authorization', aliases: ['work authorization', 'authorized to work', 'visa status'], sensitivity: 'sensitive' },
];

function parseJson(s, fallback) {
  try { const v = JSON.parse(s); return v ?? fallback; } catch { return fallback; }
}

function loadProfile(db) {
  const p = db.prepare('SELECT * FROM profile WHERE id = 1').get() || {};
  p.skills = parseJson(p.skills, []);
  p.custom_fields = parseJson(p.custom_fields, {});
  p.needs_sponsorship = Boolean(p.needs_sponsorship);
  return p;
}

function humanize(key) {
  return String(key).replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// Build the candidate.fields list (only fields that have a value).
function candidateFields(profile) {
  const fields = [];
  for (const spec of FIELD_SPECS) {
    const value = profile[spec.key];
    if (value === undefined || value === null || value === '') continue;
    fields.push({ label: spec.label, value: String(value), aliases: spec.aliases, sensitivity: spec.sensitivity });
  }
  if (profile.needs_sponsorship !== undefined) {
    fields.push({
      label: 'Require sponsorship',
      value: profile.needs_sponsorship ? 'Yes' : 'No',
      aliases: ['require sponsorship', 'need sponsorship', 'visa sponsorship'],
      sensitivity: 'sensitive',
    });
  }
  for (const [key, value] of Object.entries(profile.custom_fields || {})) {
    if (!value) continue;
    fields.push({
      label: humanize(key),
      value: String(value),
      aliases: [key.toLowerCase(), humanize(key).toLowerCase()],
      sensitivity: 'sensitive',
    });
  }
  return fields;
}

function attachedDocuments(db, applicationId, { includeResumeText = false } = {}) {
  const rows = db.prepare(`
    SELECT ad.document_id, ad.role, ad.variant_tag, ad.label,
           d.original_name, d.extraction_status, d.extracted_text
    FROM application_documents ad
    JOIN documents d ON d.id = ad.document_id
    WHERE ad.application_id = ?
    ORDER BY ad.attached_at DESC
  `).all(applicationId);
  return rows.map((r) => ({
    documentId: r.document_id,
    role: r.role,
    variantTag: r.variant_tag,
    label: r.label || r.original_name,
    filename: r.original_name,
    downloadUrl: `/api/documents/${r.document_id}/download`,
    extractionStatus: r.extraction_status,
    // Raw resume text is omitted unless explicitly requested (privacy).
    ...(includeResumeText ? { extractedText: r.extracted_text || '' } : {}),
  }));
}

function storedApplyPlan(db, applicationId) {
  const row = db.prepare('SELECT * FROM apply_plans WHERE application_id = ?').get(applicationId);
  if (!row) return null;
  return {
    source: row.source,
    requirements: parseJson(row.requirements, []),
    suggested_tasks: parseJson(row.suggested_tasks, []),
    likely_questions: parseJson(row.likely_questions, []),
    warnings: parseJson(row.warnings, []),
  };
}

// Assemble the full packet for one application.
export function buildPacket(db, application, { includeResumeText = false } = {}) {
  const profile = loadProfile(db);
  const experiences = db.prepare('SELECT * FROM experiences ORDER BY sort_order, id DESC').all();
  const education = db.prepare('SELECT * FROM education ORDER BY sort_order, id DESC').all();
  const documents = attachedDocuments(db, application.id, { includeResumeText });
  const answers = db.prepare(
    'SELECT question, answer, source FROM application_answers WHERE application_id = ? ORDER BY created_at DESC',
  ).all(application.id);
  const tasks = db.prepare(
    'SELECT * FROM application_tasks WHERE application_id = ? ORDER BY sort_order, id',
  ).all(application.id);

  const resumeDocumentIds = documents.filter((d) => d.role === 'resume').map((d) => d.documentId);
  const variantTags = [...new Set(documents.map((d) => d.variantTag).filter(Boolean))];

  return {
    application: { ...application, remote: Boolean(application.remote) },
    candidate: { fields: candidateFields(profile), profile, experiences, education, skills: profile.skills },
    documents,
    answers,
    applyPlan: storedApplyPlan(db, application.id),
    tasks,
    retrievalScope: { resumeDocumentIds, variantTags },
    applyPolicy: {
      canAutofill: true,
      canAutoSubmit: true,
      redactedFields: REDACTED_FIELDS,
      requiresCdp: true,
    },
  };
}

import { useEffect, useState } from 'react';
import { api } from '../api.js';

// Tailored cover-letter writer + application-question answerer for one job.
// `job` is either an inline job object (from search) or a saved application.
export default function AssistantModal({ job, aiEnabled, onClose, onSaveCoverLetter }) {
  const [tab, setTab] = useState('cover');
  const [coverLetter, setCoverLetter] = useState(job.cover_letter || '');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [answerSource, setAnswerSource] = useState('ai');
  const [savedAnswers, setSavedAnswers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [warning, setWarning] = useState('');

  const jobPayload = job.id
    ? { jobId: job.id }
    : { job: { title: job.title, company: job.company, location: job.location, description: job.description } };

  // Load previously saved answers for a tracked application.
  useEffect(() => {
    if (job.id) api.getAnswers(job.id).then(setSavedAnswers).catch((e) => setWarning(e.message));
  }, [job.id]);

  async function genCover() {
    setLoading(true); setWarning('');
    try {
      const r = await api.generateCoverLetter(jobPayload);
      setCoverLetter(r.text);
      if (r.warning) setWarning(r.warning);
    } catch (e) { setWarning(e.message); }
    setLoading(false);
  }

  async function genAnswer() {
    if (!question.trim()) return;
    setLoading(true); setWarning('');
    try {
      const r = await api.answerQuestion({ ...jobPayload, question });
      setAnswer(r.text || '');
      setAnswerSource(r.source || 'ai');
      if (r.warning) setWarning(r.warning);
    } catch (e) { setWarning(e.message); }
    setLoading(false);
  }

  async function saveAnswer() {
    if (!question.trim() || !answer.trim()) return;
    const body = { question, answer, source: answerSource };
    try {
      if (job.id) {
        await api.saveAnswerForApp(job.id, body);
        setSavedAnswers(await api.getAnswers(job.id));
      } else {
        await api.saveAnswer({ ...body, job_title: job.title, company: job.company });
      }
      setQuestion(''); setAnswer('');
    } catch (e) { setWarning(e.message); }
  }

  async function removeAnswer(id) {
    try { await api.deleteAnswer(id); setSavedAnswers((prev) => prev.filter((a) => a.id !== id)); }
    catch (e) { setWarning(e.message); }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Application Assistant</h3>
          <button className="btn ghost" onClick={onClose}>✕</button>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          {job.title} · {job.company}
        </p>

        {!aiEnabled && (
          <div className="banner">
            AI is off. Add <code>ANTHROPIC_API_KEY</code> to the server <code>.env</code> for
            tailored, job-specific writing. A template is used in the meantime.
          </div>
        )}

        <div className="tabs">
          <div className={`tab ${tab === 'cover' ? 'active' : ''}`} onClick={() => setTab('cover')}>Cover Letter</div>
          <div className={`tab ${tab === 'qa' ? 'active' : ''}`} onClick={() => setTab('qa')}>Answer a Question</div>
        </div>

        {warning && <div className="banner">{warning}</div>}

        {tab === 'cover' && (
          <>
            <div className="row" style={{ marginBottom: 12 }}>
              <button className="btn" onClick={genCover} disabled={loading}>
                {loading ? 'Writing…' : coverLetter ? 'Regenerate' : 'Generate cover letter'}
              </button>
              {coverLetter && (
                <button className="btn secondary" onClick={() => navigator.clipboard.writeText(coverLetter)}>
                  Copy
                </button>
              )}
            </div>
            <textarea
              value={coverLetter}
              onChange={(e) => setCoverLetter(e.target.value)}
              style={{ minHeight: 260 }}
              placeholder="Your tailored cover letter will appear here…"
            />
            {onSaveCoverLetter && coverLetter && (
              <div className="row" style={{ marginTop: 12 }}>
                <button className="btn secondary" onClick={async () => {
                  try { await onSaveCoverLetter(coverLetter); }
                  catch (e) { setWarning(e.message); }
                }}>
                  Save to tracker
                </button>
              </div>
            )}
          </>
        )}

        {tab === 'qa' && (
          <>
            {savedAnswers.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <label>Saved answers</label>
                {savedAnswers.map((a) => (
                  <div key={a.id} className="autofill-item">
                    <div>
                      <div className="autofill-label">{a.question}</div>
                      <div className="autofill-value">{a.answer}</div>
                    </div>
                    <div className="row">
                      <button className="btn small ghost" onClick={() => navigator.clipboard.writeText(a.answer)}>Copy</button>
                      <button className="btn small danger" onClick={() => removeAnswer(a.id)}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="field">
              <label>Application question</label>
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g. Why do you want to work here? / Describe a challenge you overcame."
              />
            </div>
            <button className="btn" onClick={genAnswer} disabled={loading || !question.trim()}>
              {loading ? 'Thinking…' : 'Draft an answer'}
            </button>
            {answer && (
              <>
                <div className="field" style={{ marginTop: 16 }}>
                  <label>Suggested answer {answerSource === 'template' && <span className="muted">(template)</span>}</label>
                  <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} style={{ minHeight: 160 }} />
                </div>
                <div className="row">
                  <button className="btn secondary" onClick={saveAnswer}>Save answer</button>
                  <button className="btn ghost" onClick={() => navigator.clipboard.writeText(answer)}>Copy</button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Gemini provider — free-tier only, by design.
//
// Google AI Studio keys are free-tier by default: exceeding the free quota
// returns HTTP 429 (rate limited), it does not silently start billing. That
// only changes if Cloud Billing is explicitly enabled on the backing Google
// Cloud project (see server/.env.example). As a second layer of defense that
// doesn't depend on trusting Google's own enforcement, this module also
// enforces its own hard daily call cap and refuses to call out once reached.
//
// Model priority tries the strongest free model first and steps down to a
// higher-free-quota model on a 429/503 from the one above it, so a quota hit
// on the "best" model doesn't have to fall all the way to the template.
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

function modelPriority() {
  if (process.env.GEMINI_MODEL) return [process.env.GEMINI_MODEL];
  return ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'];
}

function dailyCallCap() {
  return Number(process.env.GEMINI_DAILY_CALL_CAP) || 200;
}

let dayKey = '';
let callsToday = 0;

function withinDailyCap() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== dayKey) { dayKey = today; callsToday = 0; }
  return callsToday < dailyCallCap();
}

/** Test-only: reset the in-memory daily counter. */
export function resetGeminiCallCounter() {
  dayKey = '';
  callsToday = 0;
}

export function geminiEnabled() {
  return Boolean(process.env.GEMINI_API_KEY);
}

// A 429 (quota/rate limit) or 503 (model overloaded) means "try a cheaper
// model, don't give up" — any other status (401/400/etc.) is a real problem
// that should surface immediately rather than being masked by a retry.
function isStepDownError(err) {
  return err?.status === 429 || err?.status === 503;
}

async function callModel(model, { system, user, maxTokens, jsonSchema }) {
  const body = {
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: {
      maxOutputTokens: maxTokens,
      ...(jsonSchema ? { responseMimeType: 'application/json' } : {}),
    },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  const res = await fetch(
    `${API_BASE}/${model}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    },
  );

  if (!res.ok) {
    const err = new Error(`Gemini ${model} ${res.status}: ${await res.text()}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
  if (jsonSchema) {
    try { return JSON.parse(text); } catch { throw new Error(`Gemini ${model} returned non-JSON output`); }
  }
  return text;
}

/**
 * Returns text, or (when jsonSchema is given) the parsed JSON object — the
 * same contract as the Anthropic `complete()` this mirrors, so orchestrator
 * task functions don't need to know which provider answered.
 */
export async function completeGemini({ system, user, maxTokens = 800, jsonSchema = null }) {
  if (!geminiEnabled()) throw new Error('GEMINI_API_KEY not set');
  if (!withinDailyCap()) {
    throw new Error(`Gemini daily call cap (${dailyCallCap()}) reached for today — using free fallback instead`);
  }

  let lastErr;
  for (const model of modelPriority()) {
    try {
      callsToday += 1;
      return await callModel(model, { system, user, maxTokens, jsonSchema });
    } catch (err) {
      lastErr = err;
      if (!isStepDownError(err)) throw err;
      // Quota/overloaded on this model — step down to the next, higher-quota one.
    }
  }
  throw lastErr;
}

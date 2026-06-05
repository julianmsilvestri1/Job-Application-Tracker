import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import './db.js'; // initialize schema on boot
import { backfillPendingExtractions } from './services/documents/extractionQueue.js';
import profileRouter from './routes/profile.js';
import documentsRouter from './routes/documents.js';
import jobsRouter from './routes/jobs.js';
import applicationsRouter from './routes/applications.js';
import answersRouter from './routes/answers.js';
import assistantRouter from './routes/assistant.js';
import preferencesRouter from './routes/preferences.js';
import extensionRouter from './routes/extension.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));

// The extension bridge owns its own STRICT CORS + token gate. Mount it BEFORE
// the general CORS so disallowed origins (and their preflight) can never be
// permitted for /api/extension/*.
app.use('/api/extension', extensionRouter);

// The portal web app is SAME-ORIGIN (served by this server in prod; Vite proxies
// in dev), so the general API needs no cross-origin access. Lock it down so
// arbitrary websites cannot read/mutate /api/* (set WEB_ORIGINS to opt specific
// front-end origins back in). The extension uses /api/extension/* exclusively.
const WEB_ORIGINS = (process.env.WEB_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({ origin: WEB_ORIGINS.length ? WEB_ORIGINS : false }));

// Defense-in-depth CSRF guard: reject state-changing requests that carry a
// FOREIGN cross-origin header. Same-origin, loopback (dev/Vite proxy), tools
// without an Origin, and configured WEB_ORIGINS all pass; a real website
// (evil.com) is blocked.
const LOOPBACK = /^(localhost|127\.0\.0\.1|\[?::1\]?)$/;
app.use('/api', (req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (!origin) return next();
  let url;
  try { url = new URL(origin); } catch { return res.status(403).json({ error: 'Cross-origin request rejected.' }); }
  const ok = url.host === req.headers.host || LOOPBACK.test(url.hostname) || WEB_ORIGINS.includes(origin);
  if (!ok) return res.status(403).json({ error: 'Cross-origin request rejected.' });
  return next();
});

app.use('/api/profile', profileRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/applications', applicationsRouter);
app.use('/api/answers', answersRouter);
app.use('/api/assistant', assistantRouter);
app.use('/api/preferences', preferencesRouter);

// Serve the built client in production (npm run build && npm start).
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Centralized error handler (e.g. multer upload errors).
// Express identifies error middleware by its 4-arg signature, so the unused
// args are kept (underscore-prefixed to satisfy lint).
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 400).json({ error: err.message || 'Server error' });
});

backfillPendingExtractions();

const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || '127.0.0.1';
app.listen(PORT, HOST, () => {
  const where = HOST === '0.0.0.0' ? `http://0.0.0.0:${PORT} (LAN devices, e.g. iPad extension)` : `http://localhost:${PORT}`;
  console.log(`Job Application Tracker API listening on ${where}`);
});

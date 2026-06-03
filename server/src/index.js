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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));

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

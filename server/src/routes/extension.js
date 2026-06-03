import { Router } from 'express';
import { runApply } from '../services/apply/stagehandRunner.js';

// Extension bridge (Unit 2.4). The extension is a thin Trigger UI: it sends the
// chosen application + the current tab URL, and the backend Stagehand service
// does all extraction / resolution / filling / submission over CDP.
//
// NOTE: origin-locking this router to the extension IDs is part of the 2.7/2.8
// hardening pass; for now it relies on the app-level CORS config.
const router = Router();

// POST /api/extension/trigger-apply  { applicationId, url }
router.post('/trigger-apply', async (req, res) => {
  const { applicationId, url } = req.body || {};
  if (!applicationId || !url) {
    return res.status(400).json({ error: 'applicationId and url are required.' });
  }
  try {
    const summary = await runApply({ applicationId: Number(applicationId), url: String(url) });
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

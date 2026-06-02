import { Router } from 'express';
import db from '../db.js';
import { getSearchPreferences, saveSearchPreferences } from '../services/searchPreferences.js';

const router = Router();

router.get('/', (req, res) => {
  res.json(getSearchPreferences(db));
});

router.put('/', (req, res) => {
  res.json(saveSearchPreferences(db, req.body || {}));
});

export default router;

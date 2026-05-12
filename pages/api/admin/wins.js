// Admin CRUD for the public track record (/wins).
//
// Auth: Firebase ID token + email must be present in ADMIN_EMAILS env var
// (comma-separated). The page UI lives at /admin/wins.

import {
  verifyIdToken,
  isFirebaseAdminConfigured,
  listTrackRecordEntries,
  createTrackRecordEntry,
  updateTrackRecordEntry,
  deleteTrackRecordEntry
} from '../../../lib/firebase-admin';

const RESULT_VALUES = new Set(['win', 'loss', 'flat']);

function getAdminEmails() {
  return String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

async function requireAdmin(req) {
  if (!isFirebaseAdminConfigured()) {
    const err = new Error('Server not configured (Firebase admin missing).');
    err.statusCode = 503;
    throw err;
  }
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    const err = new Error('Sign in required');
    err.statusCode = 401;
    throw err;
  }
  const verified = await verifyIdToken(token);
  if (!verified.success) {
    const err = new Error('Invalid auth token');
    err.statusCode = 401;
    throw err;
  }

  const admins = getAdminEmails();
  if (admins.length === 0) {
    const err = new Error('No admins configured. Set ADMIN_EMAILS env var.');
    err.statusCode = 503;
    throw err;
  }
  const email = String(verified.email || '').toLowerCase();
  if (!email || !admins.includes(email)) {
    const err = new Error('Not authorized');
    err.statusCode = 403;
    throw err;
  }

  return { uid: verified.uid, email };
}

function parseEntry(raw) {
  if (!raw || typeof raw !== 'object') {
    const err = new Error('Body must be an object');
    err.statusCode = 400;
    throw err;
  }

  const date = String(raw.date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const err = new Error('date must be YYYY-MM-DD');
    err.statusCode = 400;
    throw err;
  }

  const ticker = String(raw.ticker || '').toUpperCase().trim();
  if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(ticker)) {
    const err = new Error('ticker must be a valid symbol');
    err.statusCode = 400;
    throw err;
  }

  const result = String(raw.result || 'flat').toLowerCase();
  if (!RESULT_VALUES.has(result)) {
    const err = new Error('result must be one of: win, loss, flat');
    err.statusCode = 400;
    throw err;
  }

  const num = (v, def = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
  };

  return {
    date,
    ticker,
    result,
    volume_ratio: num(raw.volume_ratio, 0),
    total_value: num(raw.total_value, 0),
    avg_price: num(raw.avg_price, 0),
    estimated_return_pct: num(raw.estimated_return_pct, 0),
    note: String(raw.note || '').slice(0, 280)
  };
}

export default async function handler(req, res) {
  try {
    const admin = await requireAdmin(req);

    if (req.method === 'GET') {
      const { entries } = await listTrackRecordEntries({ limit: 500 });
      return res.status(200).json({ entries, admin: admin.email });
    }

    if (req.method === 'POST') {
      const entry = parseEntry(req.body);
      const result = await createTrackRecordEntry(entry);
      if (!result.success) return res.status(500).json({ error: result.error });
      return res.status(201).json({ id: result.id, entry });
    }

    if (req.method === 'PUT') {
      const id = String(req.query.id || req.body?.id || '').trim();
      if (!id) return res.status(400).json({ error: 'Missing id' });
      const entry = parseEntry(req.body);
      const result = await updateTrackRecordEntry(id, entry);
      if (!result.success) return res.status(500).json({ error: result.error });
      return res.status(200).json({ id, entry });
    }

    if (req.method === 'DELETE') {
      const id = String(req.query.id || req.body?.id || '').trim();
      if (!id) return res.status(400).json({ error: 'Missing id' });
      const result = await deleteTrackRecordEntry(id);
      if (!result.success) return res.status(500).json({ error: result.error });
      return res.status(200).json({ id, deleted: true });
    }

    res.setHeader('Allow', 'GET, POST, PUT, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    const status = err.statusCode || 500;
    console.error('[api/admin/wins]', status, err.message);
    return res.status(status).json({ error: err.message });
  }
}

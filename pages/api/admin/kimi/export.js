// GET /api/admin/kimi/export?user_id=...&from=YYYY-MM-DD&to=YYYY-MM-DD&format=csv|json
// Compliance export of a user's retained messages for a date range (audit-logged).

import { allowMethods, HttpError, requireAdmin, sendError } from '../../../../lib/kimi/auth.js';
import { exportMessages } from '../../../../lib/kimi/admin.js';
import { addDays, startOfLocalDay } from '../../../../lib/kimi/runtime.js';

const COLUMNS = ['at', 'user_id', 'phone_masked', 'direction', 'channel', 'kind', 'status', 'dry_run', 'intent', 'body', 'related_alert_id', 'related_backtest_id', 'retain_until'];

function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;
  try {
    const admin = await requireAdmin(req);
    const userId = String(req.query.user_id || '');
    if (!userId) throw new HttpError(400, 'user_id is required');
    const day = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : null);
    const from = day(req.query.from) ? startOfLocalDay(day(req.query.from), 'America/New_York').toISOString() : null;
    const to = day(req.query.to) ? startOfLocalDay(addDays(day(req.query.to), 1), 'America/New_York').toISOString() : null;
    const rows = await exportMessages({ userId, actor: admin, from, to });
    res.setHeader('Cache-Control', 'no-store');
    if (req.query.format === 'json') return res.status(200).json({ user_id: userId, from, to, messages: rows });
    const csv = [COLUMNS.join(','), ...rows.map((r) => COLUMNS.map((c) => csvCell(r[c])).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="kimi-messages-${userId}.csv"`);
    return res.status(200).send(csv);
  } catch (err) {
    return sendError(res, err);
  }
}

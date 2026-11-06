// GET /api/admin/kimi/users/:id -> profile summary, activity timeline, deliveries,
// backtests and audit history. Message bodies are only returned by the
// audit-logged transcript endpoint.

import { allowMethods, requireAdmin, sendError } from '../../../../../lib/kimi/auth.js';
import { getUserDetail } from '../../../../../lib/kimi/admin.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;
  try {
    await requireAdmin(req);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(await getUserDetail(String(req.query.id || '')));
  } catch (err) {
    return sendError(res, err);
  }
}

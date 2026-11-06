// POST /api/admin/kimi/flags { user_id } -> mark a flagged conversation reviewed.

import { allowMethods, HttpError, requireAdmin, sendError } from '../../../../lib/kimi/auth.js';
import { resolveFlag } from '../../../../lib/kimi/admin.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  try {
    const admin = await requireAdmin(req);
    const userId = String(req.body?.user_id || '');
    if (!userId) throw new HttpError(400, 'user_id is required');
    await resolveFlag({ userId, actor: admin });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return sendError(res, err);
  }
}

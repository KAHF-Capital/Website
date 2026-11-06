// POST /api/admin/kimi/transcript { user_id, from?, to? }
// Returns a user's messages. Writes an audit log entry (viewer, user,
// timestamp) before returning anything.

import { allowMethods, HttpError, requireAdmin, sendError } from '../../../../lib/kimi/auth.js';
import { viewTranscript } from '../../../../lib/kimi/admin.js';

const iso = (v) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  try {
    const admin = await requireAdmin(req);
    const userId = String(req.body?.user_id || '');
    if (!userId) throw new HttpError(400, 'user_id is required');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(await viewTranscript({ userId, actor: admin, from: iso(req.body?.from), to: iso(req.body?.to) }));
  } catch (err) {
    return sendError(res, err);
  }
}

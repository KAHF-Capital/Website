// POST /api/admin/kimi/rollups { from, to } -> rebuild daily rollups for a range.

import { allowMethods, requireAdmin, sendError } from '../../../../lib/kimi/auth.js';
import { runRollups } from '../../../../lib/kimi/jobs.js';
import { recordAudit } from '../../../../lib/kimi/store.js';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  try {
    const admin = await requireAdmin(req);
    const result = await runRollups({ from: req.body?.from || null, to: req.body?.to || null });
    await recordAudit({ actorUid: admin.uid, actorEmail: admin.email, action: 'rebuild_rollups', metadata: result });
    return res.status(200).json(result);
  } catch (err) {
    return sendError(res, err);
  }
}

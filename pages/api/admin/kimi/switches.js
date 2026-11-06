// GET  /api/admin/kimi/switches -> kill switch and dry-run state
// POST /api/admin/kimi/switches { alerts_enabled?: boolean|null, dry_run?: boolean|null }
// null clears the dashboard override and falls back to the env default.
// KIMI_DRY_RUN=true cannot be overridden from here.

import { allowMethods, requireAdmin, sendError } from '../../../../lib/kimi/auth.js';
import { getSystemState, setSystemOverrides } from '../../../../lib/kimi/store.js';

const asSwitch = (v) => (v === true || v === false || v === null ? v : undefined);

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;
  try {
    const admin = await requireAdmin(req);
    if (req.method === 'GET') return res.status(200).json(await getSystemState());
    const state = await setSystemOverrides({ alertsEnabled: asSwitch(req.body?.alerts_enabled), dryRun: asSwitch(req.body?.dry_run) }, admin);
    return res.status(200).json(state);
  } catch (err) {
    return sendError(res, err);
  }
}

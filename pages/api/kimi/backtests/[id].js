// GET /api/kimi/backtests/:id -> full job, owner only (403 for anyone else).

import { allowMethods, requireUser, sendError } from '../../../../lib/kimi/auth.js';
import { getOwnedBacktest } from '../../../../lib/kimi/backtests.js';
import { KIMI_CONFIG } from '../../../../lib/kimi/kimi.config.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;
  try {
    const user = await requireUser(req);
    const job = await getOwnedBacktest(user.uid, String(req.query.id || ''));
    return res.status(200).json({ backtest: job, disclaimer: KIMI_CONFIG.disclaimers.resultsPage });
  } catch (err) {
    return sendError(res, err);
  }
}

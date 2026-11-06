// GET /api/admin/kimi/dashboard?tab=overview|funnel|alerts|backtests|conversations|users|health
//     &from=YYYY-MM-DD&to=YYYY-MM-DD&channel=all|imessage|sms|web&plan=all|pro|free&ticker=NVDA

import { allowMethods, requireAdmin, sendError } from '../../../../lib/kimi/auth.js';
import { getDashboard } from '../../../../lib/kimi/analytics.js';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;
  try {
    const admin = await requireAdmin(req);
    const { tab = 'overview', from, to, channel, plan, ticker } = req.query;
    const result = await getDashboard({ tab: String(tab), from, to, channel, plan, ticker });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ...result, admin: { email: admin.email } });
  } catch (err) {
    return sendError(res, err);
  }
}

// GET /api/kimi/alerts -> alerts Kimi sent the signed-in user, newest first.

import { allowMethods, requireUser, sendError } from '../../../../lib/kimi/auth.js';
import { getAlert, queryDeliveries } from '../../../../lib/kimi/store.js';
import { alertSummary } from '../../../../lib/kimi/views.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;
  try {
    const user = await requireUser(req);
    const deliveries = (await queryDeliveries({ userId: user.uid }))
      .filter((d) => d.status === 'sent' || d.status === 'delivered')
      .sort((a, b) => String(b.sent_at).localeCompare(String(a.sent_at)))
      .slice(0, 100);
    const alerts = await Promise.all(deliveries.map((d) => getAlert(d.alert_id)));
    return res.status(200).json({ alerts: alerts.map((a, i) => (a ? alertSummary(a, deliveries[i]) : null)).filter(Boolean) });
  } catch (err) {
    return sendError(res, err);
  }
}

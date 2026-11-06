// GET /api/admin/kimi/alerts/:id -> backend signal payload (unmodified),
// revisions, and every recipient with delivery status or suppression reason.

import { allowMethods, HttpError, requireAdmin, sendError } from '../../../../../lib/kimi/auth.js';
import { getAlert, getProfile, queryDeliveries } from '../../../../../lib/kimi/store.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;
  try {
    await requireAdmin(req);
    const alert = await getAlert(String(req.query.id || ''));
    if (!alert) throw new HttpError(404, 'Alert not found');
    const deliveries = await queryDeliveries({ alertId: alert.id });
    const recipients = await Promise.all(
      deliveries.map(async (d) => {
        const p = await getProfile(d.user_id);
        return {
          user_id: d.user_id,
          phone_masked: p?.phone_masked || null,
          plan: p?.plan || null,
          status: d.status,
          reason: d.suppression_reason || null,
          cap_window: d.cap_window || null,
          dry_run: Boolean(d.dry_run),
          channel: d.channel || null,
          sent_at: d.sent_at || null,
          delivered_at: d.delivered_at || null,
          signal_to_text_ms: d.signal_to_text_ms ?? d.signal_to_send_ms ?? null,
          replied_at: d.replied_at || null,
          clicked_at: d.clicked_at || null,
          backtest_at: d.backtest_at || null,
          error_code: d.error_code || null
        };
      })
    );
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ alert, recipients });
  } catch (err) {
    return sendError(res, err);
  }
}

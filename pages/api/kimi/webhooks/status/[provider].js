// POST /api/kimi/webhooks/status/:provider
//
// Delivery receipts. Kimi passes this URL (with a signed token) as the status
// callback on every send. Verified by that token or the provider's signature.

import { getMessagingProvider, isMockProviderAllowed, PROVIDER_NAMES } from '../../../../../lib/kimi/messaging/index.js';
import { recordDeliveryReceipt } from '../../../../../lib/kimi/alert-engine.js';
import { emitEvent, findMessageByProviderId } from '../../../../../lib/kimi/store.js';
import { callbackToken, timingSafeEqualStr } from '../../../../../lib/kimi/crypto.js';
import { parseBody, readRawBody } from '../../../../../lib/kimi/http.js';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const providerName = String(req.query.provider || '').toLowerCase();
  if (!PROVIDER_NAMES.includes(providerName) || (providerName === 'mock' && !isMockProviderAllowed())) {
    return res.status(404).json({ error: 'Unknown provider' });
  }
  const rawBody = await readRawBody(req).catch(() => '');
  const signed = { headers: req.headers, url: req.url, rawBody, body: parseBody(rawBody, req.headers['content-type']) };
  const adapter = getMessagingProvider(providerName);
  const tokenOk = timingSafeEqualStr(String(req.query.token || ''), callbackToken(providerName));
  if (!tokenOk && !adapter.verifySignature(signed)) {
    await emitEvent('webhook_rejected', { properties: { provider: providerName, reason: 'invalid_status_signature' } });
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const status = adapter.parseStatus(signed);
  if (!status.providerMessageId) return res.status(200).json({ ok: true });
  const message = await findMessageByProviderId(status.providerMessageId);
  if (status.status === 'failed') {
    await emitEvent('send_failed', {
      userId: message?.user_id || null,
      channel: status.channel,
      properties: { provider: providerName, error_code: status.errorCode || 'UNKNOWN', stage: 'carrier', kind: message?.kind || null }
    });
  }
  if (message) {
    await recordDeliveryReceipt({
      messageId: message.id,
      userId: message.user_id,
      alertId: message.kind === 'alert' ? message.related_alert_id : null,
      status: status.status,
      errorCode: status.errorCode
    });
  }
  return res.status(200).json({ ok: true });
}

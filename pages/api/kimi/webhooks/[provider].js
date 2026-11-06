// POST /api/kimi/webhooks/:provider  (sendblue | twilio | mock outside production)
//
// Verifies the provider signature over the raw body and rejects anything
// unsigned, persists the message as a queue job keyed on the provider message
// id (provider retries are dropped), responds 200 right away, then processes
// the job after the response.

import { getMessagingProvider, isMockProviderAllowed, PROVIDER_NAMES } from '../../../../lib/kimi/messaging/index.js';
import { enqueueInbound, runInboundJob } from '../../../../lib/kimi/queue.js';
import { emitEvent } from '../../../../lib/kimi/store.js';
import { parseBody, readRawBody } from '../../../../lib/kimi/http.js';
import { waitUntil } from '../../../../lib/kimi/runtime.js';

export const config = { api: { bodyParser: false }, maxDuration: 60 };

function ack(res, provider) {
  if (provider === 'twilio') {
    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send('<Response></Response>');
  }
  return res.status(200).json({ ok: true });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const providerName = String(req.query.provider || '').toLowerCase();
  if (!PROVIDER_NAMES.includes(providerName) || (providerName === 'mock' && !isMockProviderAllowed())) {
    return res.status(404).json({ error: 'Unknown provider' });
  }

  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }
  const signed = { headers: req.headers, url: req.url, rawBody, body: parseBody(rawBody, req.headers['content-type']) };
  const adapter = getMessagingProvider(providerName);

  if (!adapter.verifySignature(signed)) {
    waitUntil(emitEvent('webhook_rejected', { properties: { provider: providerName, reason: 'invalid_signature' } }));
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const inbound = adapter.parseInbound(signed);
  if (inbound.isOutboundEcho) return ack(res, providerName);
  if (!inbound.providerMessageId || !inbound.from) {
    waitUntil(emitEvent('webhook_rejected', { properties: { provider: providerName, reason: 'unparseable_payload' } }));
    return res.status(400).json({ error: 'Missing message id or sender' });
  }

  const { duplicate, jobId, external } = await enqueueInbound(providerName, inbound);
  waitUntil(emitEvent('webhook_received', { channel: inbound.channel, properties: { provider: providerName, duplicate } }));
  if (!duplicate && !external) waitUntil(runInboundJob(jobId));
  return ack(res, providerName);
}

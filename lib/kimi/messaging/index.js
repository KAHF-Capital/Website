// MessagingProvider interface and the single outbound path for Kimi.
//
// Every adapter implements:
//   send(to, text, mediaUrl?, { statusCallback? }) -> { providerMessageId, status, channel }
//   sendTypingIndicator?(to)                       -> boolean
//   verifySignature(req)                           -> boolean   (req: { headers, body, rawBody, url })
//   parseInbound(req) -> { providerMessageId, from, text, media[], receivedAt, channel }
//   parseStatus(req)  -> { providerMessageId, status, errorCode, channel }
//
// Select the default adapter with MESSAGING_PROVIDER=sendblue|twilio.

import { KIMI_CONFIG } from '../kimi.config.js';
import { callbackToken, hashPhone, maskPhone, normalizePhone } from '../crypto.js';
import { appendMessage, addUsage, emitEvent, getPhoneRecord, getProfile, getSystemState } from '../store.js';
import { checkGlobalSpend } from '../spend.js';
import { SendblueProvider } from './sendblue.js';
import { TwilioProvider } from './twilio.js';
import { MockMessagingProvider } from './mock.js';

export { SendblueProvider, TwilioProvider, MockMessagingProvider };

export const PROVIDER_NAMES = ['sendblue', 'twilio', 'mock'];

let providerOverride = null;
let sharedMock = null;

export function setMessagingProviderForTests(provider) {
  providerOverride = provider;
}

export function isMockProviderAllowed() {
  return process.env.NODE_ENV !== 'production' || process.env.KIMI_ENABLE_MOCK_PROVIDER === 'true';
}

export function getMessagingProvider(name = null) {
  if (providerOverride) return providerOverride;
  const key = String(name || KIMI_CONFIG.messaging.provider || 'sendblue').toLowerCase();
  if (key === 'twilio') return new TwilioProvider();
  if (key === 'mock') {
    if (!isMockProviderAllowed()) throw new Error('The mock messaging provider is disabled in production');
    if (!sharedMock) sharedMock = new MockMessagingProvider();
    return sharedMock;
  }
  return new SendblueProvider();
}

/** The number users text, for the configured provider. */
export function kimiNumber(providerName = null) {
  const key = String(providerName || KIMI_CONFIG.messaging.provider || 'sendblue').toLowerCase();
  const raw = key === 'twilio' ? process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_PHONE_NUMBER : process.env.SENDBLUE_FROM_NUMBER;
  return normalizePhone(raw) || null;
}

function statusCallbackUrl(providerName) {
  const base = KIMI_CONFIG.publicBaseUrl;
  if (!/^https:\/\//.test(base) || /localhost|127\.0\.0\.1/.test(base) || providerName === 'mock') return null;
  return `${base}/api/kimi/webhooks/status/${providerName}?token=${callbackToken(providerName)}`;
}

/** Strip markdown and layout so replies read like a text message. */
export function cleanForText(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1 $2')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(^|\s)\*([^*\n]+)\*(?=[\s.,!?]|$)/g, '$1$2')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function truncateWords(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, Math.max(1, max - 1));
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:]+$/, '')}…`;
}

/**
 * Split a reply into at most `maxMessages` short texts. Long content is cut at
 * sentence boundaries and the link (the place for full detail) goes last.
 */
export function splitOutboundText(text, linkUrl = null, { maxChars = null, maxMessages = null } = {}) {
  const limit = maxChars || KIMI_CONFIG.messaging.maxCharsPerMessage;
  const maxCount = maxMessages || KIMI_CONFIG.messaging.maxMessagesPerReply;
  const body = cleanForText(text);
  const link = linkUrl && !body.includes(linkUrl) ? linkUrl : null;
  const whole = link ? `${body} ${link}`.trim() : body;
  if (!whole) return [];
  if (whole.length <= limit) return [whole];

  // Split on sentence ends followed by whitespace so "$51.57" stays intact.
  const sentences = body.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const chunks = [];
  let current = '';
  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length <= limit) {
      current = candidate;
      continue;
    }
    if (current) chunks.push(current);
    current = truncateWords(sentence, limit);
  }
  if (current) chunks.push(current);

  const out = chunks.slice(0, maxCount);
  if (chunks.length > maxCount) out[out.length - 1] = truncateWords(`${out[out.length - 1]} ${chunks[maxCount]}`, limit);
  if (link) {
    const last = out.length - 1;
    const withLink = `${out[last]} ${link}`;
    out[last] = withLink.length <= limit ? withLink : `${truncateWords(out[last], Math.max(20, limit - link.length - 1))} ${link}`;
  }
  return out;
}

/**
 * Send (or, in dry run, only log) a text. Logs every message and event,
 * enforces the message-count limit, and refuses to text opted-out numbers
 * unless `compliance` is set (STOP/HELP/START confirmations).
 */
export async function sendKimiMessage({
  userId = null,
  to,
  text,
  linkUrl = null,
  mediaUrl = null,
  kind = 'reply',
  provider = null,
  channel = null,
  relatedAlertId = null,
  relatedBacktestId = null,
  replyToMessageId = null,
  intent = null,
  latencyMs = 0,
  tokensIn = 0,
  tokensOut = 0,
  llmCostUsd = 0,
  fallback = false,
  redactedBody = null,
  compliance = false,
  maxChars = null,
  profile = undefined
}) {
  const phone = normalizePhone(to);
  if (!phone) throw Object.assign(new Error('Invalid recipient phone number'), { code: 'INVALID_RECIPIENT' });
  const adapter = provider && typeof provider === 'object' ? provider : getMessagingProvider(provider);

  if (!compliance) {
    const [record, prof] = await Promise.all([
      getPhoneRecord(phone),
      profile !== undefined ? profile : userId ? getProfile(userId) : null
    ]);
    if (record?.opted_out_at || prof?.opted_out_at) {
      await emitEvent('send_blocked', { userId, properties: { reason: 'opted_out', kind } });
      return { blocked: true, reason: 'opted_out', dryRun: false, chunks: [], results: [] };
    }
  }

  const { dry_run: dryRun } = await getSystemState();
  const chunks = splitOutboundText(text, linkUrl, { maxChars });
  const phoneHash = hashPhone(phone);
  const phoneMasked = maskPhone(phone);
  const results = [];
  let spent = 0;

  for (let i = 0; i < chunks.length; i += 1) {
    let providerMessageId = null;
    let status = dryRun ? 'dry_run' : 'sent';
    let errorCode = null;
    let sendChannel = channel || adapter.channel;
    if (!dryRun) {
      try {
        const res = await adapter.send(phone, chunks[i], i === 0 ? mediaUrl : null, { statusCallback: statusCallbackUrl(adapter.name) });
        providerMessageId = res.providerMessageId || null;
        sendChannel = channel || res.channel || sendChannel;
      } catch (err) {
        status = 'failed';
        errorCode = err.code || 'SEND_ERROR';
        await emitEvent('send_failed', {
          userId,
          channel: sendChannel,
          properties: { provider: adapter.name, error_code: errorCode, error: String(err.message || '').slice(0, 300), kind }
        });
      }
    }
    const cost = status === 'sent' ? KIMI_CONFIG.messaging.costPerMessageUsd[adapter.name] || 0 : 0;
    spent += cost;
    const { id } = await appendMessage({
      user_id: userId,
      phone_hash: phoneHash,
      phone_masked: phoneMasked,
      direction: 'outbound',
      channel: sendChannel,
      provider: adapter.name,
      provider_message_id: providerMessageId,
      body: redactedBody ?? chunks[i],
      redacted: Boolean(redactedBody),
      kind,
      intent,
      related_alert_id: relatedAlertId,
      related_backtest_id: relatedBacktestId,
      reply_to_message_id: replyToMessageId,
      latency_ms: i === 0 ? latencyMs : 0,
      tokens_in: i === 0 ? tokensIn : 0,
      tokens_out: i === 0 ? tokensOut : 0,
      llm_cost_usd: i === 0 ? llmCostUsd : 0,
      messaging_cost_usd: cost,
      fallback,
      dry_run: dryRun,
      status,
      error_code: errorCode
    });
    results.push({ messageId: id, providerMessageId, status, errorCode, channel: sendChannel });
    if (status === 'failed') break;
  }

  if (spent > 0) {
    await addUsage(userId, { messagingCostUsd: spent, messagesOut: results.length });
    await checkGlobalSpend();
  }
  return { dryRun, chunks, results, failed: results.some((r) => r.status === 'failed') };
}

export async function sendTypingIndicator(adapter, to) {
  if (!adapter || typeof adapter.sendTypingIndicator !== 'function') return false;
  const { dry_run: dryRun } = await getSystemState();
  if (dryRun) return false;
  return adapter.sendTypingIndicator(to).catch(() => false);
}

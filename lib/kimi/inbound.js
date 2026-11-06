// Inbound text pipeline (runs from the job queue, never inside the webhook).
//
// Order of checks:
//   1. Exactly once per provider message id.
//   2. Opted-out numbers get nothing, except replies to START or HELP.
//   3. Reserved keywords (STOP, START, HELP, PAUSE, RESUME), before the LLM.
//   4. Unknown or unverified numbers get one signup-link reply per 24h and no
//      agent or tools.
//   5. Plan gate (optional), per-user inbound rate limits.
//   6. Typing indicator, then the agent.

import { KIMI_CONFIG } from './kimi.config.js';
import { hashPhone, maskPhone, normalizePhone } from './crypto.js';
import { handleKeyword, matchKeyword } from './keywords.js';
import { handleAgentTurn } from './agent.js';
import { sendKimiMessage, sendTypingIndicator } from './messaging/index.js';
import {
  appendMessage,
  claimSignupLinkSlot,
  consumeRateLimit,
  emitEvent,
  getMessage,
  getPhoneRecord,
  getProfile,
  inboundMessageId
} from './store.js';
import { clockNow } from './runtime.js';

export async function processInbound({ adapter, inbound, now = clockNow() }) {
  const phone = normalizePhone(inbound.from);
  if (!phone || !inbound.providerMessageId) return { status: 'ignored', reason: 'missing_sender_or_id' };
  if (inbound.isOutboundEcho) return { status: 'ignored', reason: 'outbound_echo' };

  const inboundId = inboundMessageId(adapter.name, inbound.providerMessageId);
  if (await getMessage(inboundId)) return { status: 'duplicate' };

  const receivedAt = inbound.receivedAt ? new Date(inbound.receivedAt) : now;
  const channel = inbound.channel || adapter.channel;
  const text = String(inbound.text || '').slice(0, 2000);
  const record = await getPhoneRecord(phone);
  const profile = record?.user_id ? await getProfile(record.user_id) : null;
  const keyword = matchKeyword(text);
  const optedOut = Boolean(record?.opted_out_at || profile?.opted_out_at);
  const linked = Boolean(profile?.sms_enabled);

  const logInbound = (intent) =>
    appendMessage({
      id: inboundId,
      user_id: linked ? profile.user_id : null,
      phone_hash: hashPhone(phone),
      phone_masked: maskPhone(phone),
      direction: 'inbound',
      channel,
      provider: adapter.name,
      provider_message_id: inbound.providerMessageId,
      body: text,
      media: inbound.media || [],
      intent,
      created_at: receivedAt.toISOString()
    });

  if (optedOut && keyword !== 'OPT_IN' && keyword !== 'HELP') {
    const logged = await logInbound('opted_out');
    return { status: logged.created ? 'ignored_opted_out' : 'duplicate' };
  }

  if (keyword) {
    const logged = await logInbound('keyword');
    if (!logged.created) return { status: 'duplicate' };
    if (!linked && keyword !== 'OPT_OUT' && keyword !== 'OPT_IN' && keyword !== 'HELP') {
      return replySignupLink({ adapter, phone, channel, now, reason: 'keyword_from_unknown' });
    }
    const result = await handleKeyword({ keyword, profile: linked ? profile : null, phone, channel, now });
    await sendKimiMessage({
      userId: linked ? profile.user_id : null,
      to: phone,
      text: result.replyText,
      kind: 'keyword',
      provider: adapter,
      channel,
      intent: 'keyword',
      replyToMessageId: inboundId,
      latencyMs: clockNow().getTime() - receivedAt.getTime(),
      compliance: result.compliance
    });
    return { status: 'keyword', action: result.action };
  }

  if (!linked) {
    const logged = await logInbound('unknown_sender');
    if (!logged.created) return { status: 'duplicate' };
    return replySignupLink({ adapter, phone, channel, now, reason: profile ? 'unverified' : 'unknown' });
  }

  if (KIMI_CONFIG.access.requireProPlan && profile.plan !== 'pro') {
    const logged = await logInbound('plan_gate');
    if (!logged.created) return { status: 'duplicate' };
    if ((await consumeRateLimit(`plan-gate:${profile.user_id}`, { windowMs: 24 * 3600 * 1000, max: 1 }, now)).allowed) {
      await sendKimiMessage({ userId: profile.user_id, to: phone, text: KIMI_CONFIG.templates.notActive(), kind: 'system', provider: adapter, channel, profile });
    }
    return { status: 'plan_required' };
  }

  const userId = profile.user_id;
  const minute = await consumeRateLimit(`inbound:${userId}:m`, { windowMs: 60000, max: KIMI_CONFIG.agent.inboundPerMinute }, now);
  const hour = minute.allowed ? await consumeRateLimit(`inbound:${userId}:h`, { windowMs: 3600000, max: KIMI_CONFIG.agent.inboundPerHour }, now) : { allowed: false };
  if (!minute.allowed || !hour.allowed) {
    const logged = await logInbound('rate_limited');
    if (!logged.created) return { status: 'duplicate' };
    await emitEvent('rate_limited', { userId, channel, properties: { window: minute.allowed ? 'hour' : 'minute' } });
    if ((await consumeRateLimit(`inbound-notice:${userId}`, { windowMs: 600000, max: 1 }, now)).allowed) {
      await sendKimiMessage({ userId, to: phone, text: KIMI_CONFIG.templates.rateLimited(), kind: 'system', provider: adapter, channel, profile });
    }
    return { status: 'rate_limited' };
  }

  await sendTypingIndicator(adapter, phone);
  const turn = await handleAgentTurn({
    userId,
    text,
    channel,
    provider: adapter,
    phone,
    inboundId,
    providerMessageId: inbound.providerMessageId,
    receivedAt,
    media: inbound.media || []
  });
  return { status: turn.duplicate ? 'duplicate' : 'replied', ...turn };
}

async function replySignupLink({ adapter, phone, channel, now, reason }) {
  await emitEvent('unknown_sender', { channel, properties: { reason, phone_masked: maskPhone(phone) } });
  if (!(await claimSignupLinkSlot(phone, now))) return { status: 'unknown_sender_suppressed' };
  await sendKimiMessage({
    to: phone,
    text: KIMI_CONFIG.templates.unknownSender(`${KIMI_CONFIG.publicBaseUrl}/kimi`),
    kind: 'signup_link',
    provider: adapter,
    channel
  });
  return { status: 'unknown_sender_replied' };
}

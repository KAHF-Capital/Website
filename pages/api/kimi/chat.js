// Web chat with Kimi. Same conversation, memory and tools as the text thread.
//
// GET  /api/kimi/chat?after=<iso>         -> messages (all channels)
// POST /api/kimi/chat { text, client_id } -> runs one agent turn
// POST /api/kimi/chat { action: 'feedback', message_id, rating: 'up'|'down', comment }

import { allowMethods, requireUser, sendError, HttpError } from '../../../lib/kimi/auth.js';
import { handleAgentTurn } from '../../../lib/kimi/agent.js';
import { loadProfileForUser } from '../../../lib/kimi/onboarding.js';
import { sha256Hex } from '../../../lib/kimi/crypto.js';
import { consumeRateLimit, emitEvent, flagConversation, getMessage, listUserMessages, queryBacktests } from '../../../lib/kimi/store.js';
import { KIMI_CONFIG } from '../../../lib/kimi/kimi.config.js';

export const config = { maxDuration: 60 };

const HIDDEN_KINDS = new Set(['otp']);

function view(m) {
  return {
    id: m.id,
    at: m.created_at,
    direction: m.direction,
    channel: m.channel,
    kind: m.kind,
    body: m.body,
    related_alert_id: m.related_alert_id || null,
    related_backtest_id: m.related_backtest_id || null,
    dry_run: Boolean(m.dry_run),
    status: m.status
  };
}

async function thread(uid, after = null) {
  const messages = after ? await listUserMessages(uid, { limit: 0, from: after }) : await listUserMessages(uid, { limit: 80 });
  const running = (await queryBacktests({ userId: uid })).filter((j) => j.status === 'queued' || j.status === 'running').map((j) => j.id);
  return { messages: messages.filter((m) => !HIDDEN_KINDS.has(m.kind) && (!after || m.created_at > after)).map(view), running_backtests: running };
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;
  try {
    const user = await requireUser(req);
    if (req.method === 'GET') {
      const after = typeof req.query.after === 'string' && !Number.isNaN(Date.parse(req.query.after)) ? new Date(req.query.after).toISOString() : null;
      return res.status(200).json(await thread(user.uid, after));
    }

    if (req.body?.action === 'feedback') {
      const message = await getMessage(String(req.body.message_id || ''));
      if (!message || message.user_id !== user.uid || message.direction !== 'outbound') throw new HttpError(404, 'Message not found');
      const rating = req.body.rating === 'down' ? 'down' : 'up';
      await emitEvent('feedback_given', {
        userId: user.uid,
        channel: 'web',
        properties: { message_id: message.id, rating, comment: req.body.comment ? String(req.body.comment).slice(0, 500) : null, kind: message.kind }
      });
      if (rating === 'down') await flagConversation(user.uid, 'negative_feedback', message.id);
      return res.status(200).json({ ok: true });
    }

    const text = String(req.body?.text || '').trim();
    if (!text) throw new HttpError(400, 'Type a message first.');
    if (text.length > 2000) throw new HttpError(400, 'That message is too long.');
    await loadProfileForUser(user);

    const minute = await consumeRateLimit(`inbound:${user.uid}:m`, { windowMs: 60000, max: KIMI_CONFIG.agent.inboundPerMinute });
    const hour = minute.allowed ? await consumeRateLimit(`inbound:${user.uid}:h`, { windowMs: 3600000, max: KIMI_CONFIG.agent.inboundPerHour }) : { allowed: false };
    if (!minute.allowed || !hour.allowed) {
      await emitEvent('rate_limited', { userId: user.uid, channel: 'web', properties: { window: minute.allowed ? 'hour' : 'minute' } });
      throw new HttpError(429, KIMI_CONFIG.templates.rateLimited());
    }

    const clientId = typeof req.body?.client_id === 'string' ? req.body.client_id.slice(0, 80) : null;
    const turn = await handleAgentTurn({
      userId: user.uid,
      text,
      channel: 'web',
      inboundId: clientId ? `in_web_${sha256Hex(`${user.uid}:${clientId}`).slice(0, 32)}` : null,
      receivedAt: new Date()
    });
    return res.status(200).json({ reply: turn.duplicate ? null : turn.replyText, duplicate: Boolean(turn.duplicate), ...(await thread(user.uid)) });
  } catch (err) {
    return sendError(res, err);
  }
}

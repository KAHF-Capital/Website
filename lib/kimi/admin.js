// Admin views of individual users. Every transcript view and message export
// writes to kimi_audit_log (viewer, user, timestamp) before data is returned.

import { HttpError } from './auth.js';
import {
  getAlert,
  getConversation,
  getProfile,
  listUserMessages,
  queryAudit,
  queryBacktests,
  queryDeliveries,
  queryEvents,
  recordAudit,
  resolveConversationFlag
} from './store.js';

function maskIp(ip) {
  if (!ip) return null;
  if (ip.includes('.')) return ip.split('.').slice(0, 3).join('.') + '.x';
  return ip.split(':').slice(0, 3).join(':') + ':…';
}

function describeEvent(e) {
  const p = e.properties || {};
  switch (e.type) {
    case 'message_inbound':
      return `Inbound ${e.channel || ''} message${p.intent ? ` (${p.intent})` : ''}`;
    case 'message_outbound':
      return `Outbound ${p.kind || 'message'}${p.dry_run ? ' (dry run)' : ''}${p.status === 'failed' ? ' FAILED' : ''}`;
    case 'alert_sent':
      return `Alert sent: ${p.alert_id}${p.digest ? ' (digest)' : ''}`;
    case 'alert_suppressed':
      return `Alert suppressed: ${p.alert_id} (${p.reason})`;
    case 'backtest_requested':
      return `Backtest requested: $${e.ticker} (${p.source})`;
    case 'backtest_completed':
      return `Backtest completed: $${e.ticker}, winner ${p.winner}`;
    case 'backtest_failed':
      return `Backtest failed: $${e.ticker} (${p.error})`;
    case 'tool_called':
    case 'tool_failed':
      return `${e.type === 'tool_failed' ? 'Tool failed' : 'Tool'}: ${p.tool}${p.error ? ` (${p.error})` : ''}`;
    case 'llm_call':
      return `LLM ${p.purpose || ''} call, ${p.tokens_in + p.tokens_out} tokens, $${Number(p.cost_usd || 0).toFixed(4)}`;
    case 'prefs_updated':
      return `Preferences updated (${(p.fields || []).join(', ')})`;
    default:
      return e.type.replace(/_/g, ' ');
  }
}

export async function getUserDetail(userId) {
  const profile = await getProfile(userId);
  if (!profile) throw new HttpError(404, 'User not found');
  const [conversation, deliveries, backtests, events, audit] = await Promise.all([
    getConversation(userId),
    queryDeliveries({ userId }),
    queryBacktests({ userId }),
    queryEvents({ userId }),
    queryAudit({ targetUserId: userId, limit: 25 })
  ]);
  const sent = deliveries.filter((d) => d.status === 'sent' || d.status === 'delivered');
  const recentDeliveries = deliveries.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 40);
  const alerts = await Promise.all(recentDeliveries.map((d) => getAlert(d.alert_id)));
  return {
    profile: {
      user_id: profile.user_id,
      email: profile.email || null,
      plan: profile.plan || 'free',
      phone_masked: profile.phone_masked || null,
      phone_verified_at: profile.phone_verified_at || null,
      consent: profile.consent_at
        ? { version: profile.consent_version, at: profile.consent_at, ip_masked: maskIp(profile.consent_ip), text: profile.consent_text }
        : null,
      opted_out_at: profile.opted_out_at || null,
      paused_until: profile.paused_until || null,
      timezone: profile.timezone,
      preferences: profile.preferences,
      created_at: profile.created_at || null,
      last_active_at: profile.last_active_at || null
    },
    stats: {
      messages: conversation.message_count || 0,
      alerts_received: sent.length,
      alerts_suppressed: deliveries.filter((d) => d.status === 'suppressed').length,
      backtests: backtests.length,
      active_days: Object.keys(profile.active_days || {}).length
    },
    conversation: {
      summary: conversation.summary || '',
      flagged: Boolean(conversation.flagged),
      flag_reasons: conversation.flag_reasons || [],
      last_flag: conversation.last_flag || null
    },
    timeline: events
      .slice(-300)
      .reverse()
      .map((e) => ({ at: e.created_at, type: e.type, channel: e.channel, ticker: e.ticker, summary: describeEvent(e) })),
    deliveries: recentDeliveries.map((d, i) => ({
      alert_id: d.alert_id,
      ticker: d.ticker,
      status: d.status,
      reason: d.suppression_reason || null,
      dry_run: Boolean(d.dry_run),
      sent_at: d.sent_at || null,
      replied_at: d.replied_at || null,
      clicked_at: d.clicked_at || null,
      backtest_at: d.backtest_at || null,
      signal_date: alerts[i]?.signal_date || null
    })),
    backtests: backtests.slice(0, 25).map((j) => ({ id: j.id, ticker: j.ticker, source: j.source, status: j.status, winner: j.winner || null, created_at: j.created_at, error: j.error || null })),
    audit: audit.map((a) => ({ at: a.created_at, actor: a.actor_email, action: a.action, metadata: a.metadata }))
  };
}

function transcriptRow(m) {
  return {
    id: m.id,
    at: m.created_at,
    direction: m.direction,
    channel: m.channel,
    kind: m.kind,
    body: m.body,
    redacted: Boolean(m.redacted),
    intent: m.intent || null,
    status: m.status,
    dry_run: Boolean(m.dry_run),
    latency_ms: m.latency_ms || null,
    fallback: Boolean(m.fallback),
    flagged: Boolean(m.flagged),
    related_alert_id: m.related_alert_id || null,
    related_backtest_id: m.related_backtest_id || null
  };
}

export async function viewTranscript({ userId, actor, from = null, to = null }) {
  const profile = await getProfile(userId);
  if (!profile) throw new HttpError(404, 'User not found');
  const audit = await recordAudit({
    actorUid: actor.uid,
    actorEmail: actor.email,
    action: 'view_transcript',
    targetUserId: userId,
    metadata: { from, to }
  });
  const messages = await listUserMessages(userId, { limit: 0, from, to });
  return { audit_id: audit.id, viewed_at: audit.created_at, messages: messages.map(transcriptRow) };
}

export async function exportMessages({ userId, actor, from = null, to = null }) {
  const profile = await getProfile(userId);
  if (!profile) throw new HttpError(404, 'User not found');
  await recordAudit({ actorUid: actor.uid, actorEmail: actor.email, action: 'export_messages', targetUserId: userId, metadata: { from, to } });
  const messages = await listUserMessages(userId, { limit: 0, from, to });
  return messages.map((m) => ({ ...transcriptRow(m), user_id: userId, phone_masked: m.phone_masked || profile.phone_masked || null, retain_until: m.retain_until }));
}

export async function resolveFlag({ userId, actor }) {
  await resolveConversationFlag(userId, actor);
  await recordAudit({ actorUid: actor.uid, actorEmail: actor.email, action: 'resolve_flag', targetUserId: userId });
}

// Kimi's brain: one turn of conversation, shared by text and web chat.
//
// 1. Load memory: last N messages, rolling summary, profile, recent alerts and
//    backtests (one thread per user across iMessage, SMS and web).
// 2. Classify intent with the fast model (rules fallback) and log the inbound
//    message (immutable, deduplicated on the provider message id).
// 3. Deterministic fast paths for MORE / BT / mute, otherwise a tool-use loop
//    with a max iteration count, a turn timeout and per-user daily caps.
// 4. Send the reply, then start any backtests it acknowledged and refresh the
//    rolling summary in the background.

import { KIMI_CONFIG } from './kimi.config.js';
import { formatInTimeZone, newId, waitUntil, clockNow } from './runtime.js';
import { backend } from './backend.js';
import { TOOL_DEFINITIONS, executeTool, serializeToolResult, applyPreferenceChanges } from './tools.js';
import { callLlm, classifyInbound, getLlmProvider, summarizeConversation, textOf } from './llm.js';
import { runBacktestJob, submitBacktest } from './backtests.js';
import { sendKimiMessage, cleanForText } from './messaging/index.js';
import {
  appendMessage,
  emitEvent,
  flagConversation,
  getAlert,
  getConversation,
  getMessage,
  getProfile,
  getUsage,
  listUserMessages,
  queryBacktests,
  queryDeliveries,
  setConversationSummary,
  updateDeliveryIf
} from './store.js';

const AGENT = KIMI_CONFIG.agent;

function fmtUsd(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const abs = Math.abs(v);
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(abs >= 1e10 ? 0 : 1)}B`;
  if (abs >= 1e6) return `$${Math.round(v / 1e6)}M`;
  if (abs >= 1e3) return `$${Math.round(v / 1e3)}K`;
  return `$${v.toFixed(2)}`;
}

function fmtDate(iso) {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : null;
}

export function extractTicker(text) {
  const dollar = String(text || '').match(/\$([A-Za-z]{1,5})\b/);
  if (dollar) return dollar[1].toUpperCase();
  const stop = new Set(['BT', 'MORE', 'MUTE', 'UNMUTE', 'THE', 'AND', 'FOR', 'THIS', 'THAT', 'WITH', 'WHAT', 'WHY', 'HOW', 'CALL', 'CALLS', 'PUT', 'PUTS', 'ATM', 'DTE', 'ALL', 'ON', 'IT', 'ME', 'BY', 'VS', 'SHARPE', 'WIN', 'RATE', 'AVG', 'RUN', 'TEST', 'BACKTEST', 'PLEASE', 'PLS']);
  const words = String(text || '').match(/\b[A-Za-z]{1,5}\b/g) || [];
  const upperWord = words.find((w) => w === w.toUpperCase() && w.length >= 2 && !stop.has(w));
  return upperWord || null;
}

const RANK_ALIASES = [
  [/^sharpe$/i, 'sharpe'],
  [/^win\s?rate$/i, 'win_rate'],
  [/^(avg|average)\s+return$|^returns?$/i, 'avg_return'],
  [/^(max\s+)?(drawdown|dd)$/i, 'max_drawdown']
];

/**
 * Short text commands answered without the LLM: MORE [$T], BT [$T] [by metric],
 * MUTE $T, UNMUTE $T. Anything richer returns { complex: true } for the LLM.
 */
export function parseCommand(text) {
  const raw = String(text || '').trim().replace(/[.!?]+$/, '');
  let m = raw.match(/^more(?:\s+(?:on|about))?(?:\s+\$?([a-z]{1,5}))?$/i);
  if (m) return { type: 'more', ticker: m[1] ? m[1].toUpperCase() : null };
  m = raw.match(/^(un)?mute\s+\$?([a-z]{1,5})$/i);
  if (m) return { type: m[1] ? 'unmute' : 'mute', ticker: m[2].toUpperCase() };
  m = raw.match(/^(?:bt|backtest)(?:\s+(?:this|it|that))?(?:\s+(.*))?$/i);
  if (!m) return null;
  let rest = (m[1] || '').trim();
  let rankBy = null;
  const rank = rest.match(/(?:^|\s)(?:ranked\s+by|rank\s+by|by)\s+(.+)$/i);
  if (rank) {
    const hit = RANK_ALIASES.find(([re]) => re.test(rank[1].trim()));
    if (!hit) return { type: 'bt', complex: true };
    rankBy = hit[1];
    rest = rest.slice(0, rank.index).trim();
  }
  if (!rest) return { type: 'bt', ticker: null, rankBy };
  const t = rest.match(/^\$?([a-z]{1,5})$/i);
  return t ? { type: 'bt', ticker: t[1].toUpperCase(), rankBy } : { type: 'bt', complex: true, ticker: extractTicker(rest) };
}

/** "MORE": explain the alert using only the backend signal's own fields. */
export function explainSignal(alert) {
  const s = alert?.signal_payload || {};
  const parts = [];
  const head = [`$${alert.ticker}`];
  if (fmtDate(s.date)) head.push(fmtDate(s.date));
  let lead = fmtUsd(s.dark_pool_value) ? `${fmtUsd(s.dark_pool_value)} traded off-exchange` : 'unusual dark pool activity';
  if (typeof s.dark_pool_avg_price === 'number') lead += ` at a $${s.dark_pool_avg_price.toFixed(2)} average`;
  if (typeof s.volume_ratio === 'number') lead += `, ${s.volume_ratio.toFixed(1)}x its 7-day dark pool volume`;
  parts.push(`${head.join(', ')}: ${lead}.`);
  if (s.structure) {
    const lean = s.direction && s.structure !== 'straddle' ? `${s.direction} ` : '';
    const label = s.structure === 'call' ? `a ${lean}long call` : s.structure === 'put' ? `a ${lean}long put` : 'an ATM straddle';
    const bits = [];
    if (typeof s.strike === 'number') bits.push(`$${s.strike} strike`);
    if (fmtDate(s.expiration)) bits.push(`exp ${fmtDate(s.expiration)}`);
    if (typeof s.entry_premium === 'number') bits.push(`$${s.entry_premium.toFixed(2)} entry`);
    let read = `The backend's read was ${label}${bits.length ? ` (${bits.join(', ')})` : ''}`;
    if (typeof s.asof_hit_rate === 'number') {
      read += ` with a ${Math.round(s.asof_hit_rate)}% historical hit rate${typeof s.asof_samples === 'number' ? ` over ${s.asof_samples} one-month windows` : ''} using only history before the signal`;
    }
    parts.push(`${read}.`);
  }
  parts.push('Reply BT to backtest it.');
  return parts.join(' ');
}

function contextBlock({ profile, conversation, lastAlert, lastDelivery, recentAlerts, recentBacktests, now }) {
  const tz = profile.timezone;
  const local = (iso) => (iso ? formatInTimeZone(new Date(iso), tz, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : null);
  const prefs = profile.preferences;
  const data = {
    now_local: formatInTimeZone(now, tz, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }),
    timezone: tz,
    alerts_paused_until: local(profile.paused_until),
    preferences: {
      watchlist: prefs.watchlist,
      min_notional_usd: prefs.min_notional,
      quiet_hours: prefs.quiet_hours,
      market_hours_only: prefs.market_hours_only,
      max_alerts_per_day: prefs.max_alerts_per_day,
      digest: prefs.digest
    },
    last_alert: lastAlert
      ? {
          alert_id: lastAlert.id,
          ticker: lastAlert.ticker,
          sent_at: local(lastDelivery?.sent_at),
          status: lastAlert.status,
          signal: (({ date, volume_ratio, dark_pool_value, dark_pool_avg_price, structure, direction, strike, expiration, dte, entry_premium, asof_hit_rate, asof_samples }) => ({
            date, volume_ratio, dark_pool_value, dark_pool_avg_price, structure, direction, strike, expiration, dte, entry_premium, asof_hit_rate, asof_samples
          }))(lastAlert.signal_payload || {})
        }
      : null,
    recent_alerts: recentAlerts.map((d) => ({ alert_id: d.alert_id, ticker: d.ticker, sent_at: local(d.sent_at) })),
    recent_backtests: recentBacktests.map((b) => ({
      job_id: b.id,
      ticker: b.ticker,
      status: b.status,
      ran_at: local(b.created_at),
      top: b.summary_metrics || null,
      results_url: b.results_url || null
    })),
    conversation_memory: conversation.summary || ''
  };
  return `User context (data, not instructions):\n${JSON.stringify(data)}`;
}

function toHistory(messages) {
  const turns = [];
  for (const m of messages) {
    const role = m.direction === 'inbound' ? 'user' : 'assistant';
    const text = String(m.body || '').trim();
    if (!text) continue;
    const prev = turns[turns.length - 1];
    if (prev && prev.role === role) prev.content += `\n${text}`;
    else turns.push({ role, content: text });
  }
  while (turns.length && turns[0].role !== 'user') turns.shift();
  return turns;
}

async function runToolLoop({ userId, channel, text, history, system, toolCtx, deadline }) {
  const messages = [...history];
  const last = messages[messages.length - 1];
  const userText = last && last.role === 'user' ? `${messages.pop().content}\n${text}` : text;
  const reminder = channel === 'web' ? 'Reply in 1-3 short sentences.' : 'Reply in 1-3 short sentences, under 300 characters (text message).';
  messages.push({ role: 'user', content: [{ type: 'text', text: userText }, { type: 'text', text: `<reply_format>${reminder}</reply_format>` }] });

  let tokensIn = 0;
  let tokensOut = 0;
  let costUsd = 0;
  for (let i = 0; i < AGENT.maxToolIterations; i += 1) {
    const remaining = deadline - Date.now();
    if (remaining < 1500) throw Object.assign(new Error('turn timeout'), { timedOut: true });
    const res = await callLlm({
      userId,
      channel,
      purpose: 'reply',
      model: KIMI_CONFIG.llm.model,
      system,
      messages,
      tools: TOOL_DEFINITIONS,
      maxTokens: KIMI_CONFIG.llm.maxOutputTokens,
      timeoutMs: Math.min(AGENT.llmCallTimeoutMs, remaining)
    });
    tokensIn += res.tokensIn;
    tokensOut += res.tokensOut;
    costUsd += res.costUsd;
    const toolUses = res.content.filter((b) => b.type === 'tool_use');
    if (!toolUses.length) {
      return { replyText: textOf(res.content), tokensIn, tokensOut, costUsd };
    }
    messages.push({ role: 'assistant', content: res.content });
    const results = [];
    for (const use of toolUses) {
      try {
        const output = await executeTool(use.name, use.input, toolCtx);
        results.push({ type: 'tool_result', tool_use_id: use.id, content: serializeToolResult(output) });
      } catch (err) {
        results.push({ type: 'tool_result', tool_use_id: use.id, is_error: true, content: serializeToolResult({ error: err.toolMessage || err.message }) });
      }
    }
    messages.push({ role: 'user', content: results });
  }
  throw Object.assign(new Error('tool iteration limit reached'), { code: 'MAX_ITERATIONS' });
}

async function deterministicReply({ text, intent, toolCtx }) {
  const ticker = extractTicker(text);
  if (intent === 'settings') {
    const prefs = await executeTool('get_preferences', {}, toolCtx);
    const wl = prefs.watchlist.mode === 'all' ? 'every signal' : `${[...prefs.watchlist.tickers, ...prefs.watchlist.sectors].join(', ') || 'nothing yet'}`;
    return `You get alerts for ${wl}, up to ${prefs.max_alerts_per_day}/day. Change anything at ${prefs.settings_url}`;
  }
  if (ticker) {
    const prints = await executeTool('get_recent_dark_pool_prints', { ticker }, toolCtx);
    const latest = prints.sessions?.[0];
    if (!latest) return `I don't have recent dark pool prints for $${ticker}. Reply "BT $${ticker}" to backtest structures.`;
    const bits = [fmtUsd(latest.notional_usd), latest.avg_price ? `$${latest.avg_price} avg` : null, latest.volume_ratio_vs_7d ? `${latest.volume_ratio_vs_7d}x 7-day volume` : null].filter(Boolean);
    return `$${ticker} dark pool on ${fmtDate(latest.date) || latest.date}: ${bits.join(', ')}. Reply "BT $${ticker}" to backtest structures.`;
  }
  return 'Text me a ticker like $NVDA for dark pool prints, "BT $NVDA" to backtest structures, or MORE after an alert.';
}

/**
 * Handle one inbound message for a verified user.
 * Returns { duplicate } when the provider message was already processed.
 */
export async function handleAgentTurn({
  userId,
  text,
  channel = 'sms',
  provider = null,
  phone = null,
  inboundId = null,
  providerMessageId = null,
  receivedAt = clockNow(),
  media = []
}) {
  const startedAt = Date.now();
  const now = clockNow();
  const received = new Date(receivedAt);
  const deadline = startedAt + AGENT.turnTimeoutMs;
  const isWeb = channel === 'web';

  const profile = await getProfile(userId);
  if (!profile) throw new Error('Profile not found');
  const inboundMsgId = inboundId || newId('in');
  if (await getMessage(inboundMsgId)) return { duplicate: true };

  const command = parseCommand(text);
  // Warm the prints lookup for a mentioned ticker while the model starts; the
  // tool shares the same in-flight request.
  const mentioned = !command && (String(text).match(/\$([A-Za-z]{1,5})\b/) || [])[1];
  if (mentioned) backend().getRecentPrints({ ticker: mentioned.toUpperCase(), since: null, minNotional: 0, limit: 10 }).catch(() => null);

  const lastAlertPromise = profile.last_alert_id ? getAlert(profile.last_alert_id) : Promise.resolve(null);
  // Classification runs alongside the turn; the inbound message is written
  // with its intent before any reply goes out.
  const classificationPromise = lastAlertPromise.then((a) => classifyInbound({ userId, channel, text, hasRecentAlert: Boolean(a) }));
  const [conversation, history, deliveries, backtests, lastAlert, usage] = await Promise.all([
    getConversation(userId),
    listUserMessages(userId, { limit: AGENT.historyMessages }),
    queryDeliveries({ userId }),
    queryBacktests({ userId }),
    lastAlertPromise,
    getUsage(userId, now)
  ]);

  const sentDeliveries = deliveries
    .filter((d) => (d.status === 'sent' || d.status === 'delivered') && d.sent_at)
    .sort((a, b) => (a.sent_at < b.sent_at ? 1 : -1));
  const lastDelivery = lastAlert ? sentDeliveries.find((d) => d.alert_id === lastAlert.id) || null : null;
  if (lastDelivery && !lastDelivery.replied_at && received - new Date(lastDelivery.sent_at) <= 3600 * 1000) {
    const marked = await updateDeliveryIf(lastDelivery.alert_id, userId, (d) => d && !d.replied_at, { replied_at: received.toISOString() });
    if (marked.updated) {
      await emitEvent('alert_replied', { userId, channel, ticker: lastDelivery.ticker, properties: { alert_id: lastDelivery.alert_id, seconds_after: Math.round((received - new Date(lastDelivery.sent_at)) / 1000) } });
    }
  }

  const pendingJobs = [];
  const toolCtx = { userId, timezone: profile.timezone, channel, providerName: provider?.name || null, messageId: inboundMsgId, pendingJobs };
  let replyText = '';
  let fallback = false;
  let relatedBacktestId = null;
  let relatedAlertId = null;
  let tokensIn = 0;
  let tokensOut = 0;
  let llmCostUsd = 0;
  let path = 'llm';

  const llmAvailable = Boolean(getLlmProvider());
  const capped = usage.tokens >= AGENT.dailyTokenCapPerUser || usage.llm_cost_usd >= AGENT.dailyCostCapUsdPerUser;

  try {
    if (command?.type === 'more') {
      path = 'more';
      const ticker = command.ticker;
      let target = lastAlert;
      if (ticker && (!target || target.ticker !== ticker)) {
        const match = sentDeliveries.find((d) => d.ticker === ticker);
        target = match ? await getAlert(match.alert_id) : null;
      }
      if (target) {
        await executeTool('get_alert', { alert_id: target.id }, toolCtx).catch(() => null);
        replyText = explainSignal(target);
        relatedAlertId = target.id;
      } else {
        replyText = ticker ? `I haven't sent you an alert on $${ticker}. Text "$${ticker}" for its latest dark pool prints.` : 'No recent alert to explain yet. Text a ticker like $NVDA for its latest dark pool prints.';
      }
    } else if (command?.type === 'bt' && (!command.complex || !llmAvailable || capped)) {
      path = 'bt';
      const ticker = command.ticker;
      const fromAlert = !ticker && lastAlert && lastDelivery;
      const rank = command.rankBy ? { rank_by: command.rankBy } : {};
      try {
        const { job, ack } = await submitBacktest({
          userId,
          request: fromAlert ? { alert_id: lastAlert.id, ...rank } : { ticker: ticker || undefined, ...rank },
          source: fromAlert ? 'alert' : isWeb ? 'web' : 'free_form',
          channel,
          provider: provider?.name || null
        });
        pendingJobs.push(job.id);
        replyText = ack;
        relatedBacktestId = job.id;
        relatedAlertId = fromAlert ? lastAlert.id : null;
      } catch (err) {
        if (!err.userFacing) throw err;
        replyText = err.message;
      }
    } else if (command?.type === 'mute' || command?.type === 'unmute') {
      path = 'mute';
      const ticker = command.ticker;
      const unmute = command.type === 'unmute';
      await executeTool('update_preferences', unmute ? { unmute_tickers: [ticker] } : { mute_tickers: [ticker] }, toolCtx);
      replyText = unmute ? `$${ticker} unmuted. You'll get its alerts again.` : `Muted $${ticker}. Text "UNMUTE $${ticker}" to undo.`;
    } else if (capped) {
      path = 'capped';
      replyText = KIMI_CONFIG.templates.spendCap();
      await emitEvent('spend_cap_hit', { userId, channel, properties: { tokens: usage.tokens, llm_cost_usd: usage.llm_cost_usd } });
    } else if (llmAvailable) {
      const system = [
        { type: 'text', text: KIMI_CONFIG.systemPrompt, cache_control: { type: 'ephemeral' } },
        {
          type: 'text',
          text: contextBlock({
            profile,
            conversation,
            lastAlert,
            lastDelivery,
            recentAlerts: sentDeliveries.slice(0, 5),
            recentBacktests: backtests.slice(0, 5),
            now
          })
        },
        {
          type: 'text',
          text: isWeb
            ? 'This reply shows in web chat. Keep it to 1-3 short sentences.'
            : 'This reply goes out as a text message. Keep it to 1-3 short sentences, under 300 characters.'
        }
      ];
      const out = await runToolLoop({ userId, channel, text, history: toHistory(history), system, toolCtx, deadline });
      replyText = out.replyText;
      tokensIn = out.tokensIn;
      tokensOut = out.tokensOut;
      llmCostUsd = out.costUsd;
      relatedBacktestId = pendingJobs[pendingJobs.length - 1] || null;
        } else {
      path = 'rules';
      replyText = await deterministicReply({ text, intent: (await classificationPromise).intent, toolCtx });
    }
  } catch (err) {
    console.error('[kimi/agent] turn failed:', err.message);
    await emitEvent(err.timedOut ? 'agent_timeout' : 'agent_error', { userId, channel, properties: { error: String(err.message).slice(0, 300), path } });
    fallback = true;
  }

  const classification = await classificationPromise;
  const intent = classification.intent;
  const inbound = await appendMessage({
    id: inboundMsgId,
    user_id: userId,
    phone_hash: profile.phone_hash,
    phone_masked: profile.phone_masked,
    direction: 'inbound',
      channel,
    provider: provider?.name || (isWeb ? 'web' : null),
    provider_message_id: providerMessageId,
    body: text,
    media,
    intent,
    related_alert_id: profile.last_alert_id || null,
    flagged: classification.frustrated,
    flag_reason: classification.frustrated ? 'user_frustration' : null,
    created_at: received.toISOString()
  });
  if (!inbound.created) return { duplicate: true };
  if (classification.frustrated) await flagConversation(userId, 'user_frustration', inbound.id);
  if (classification.adviceRequest) await flagConversation(userId, 'boundary_refusal', inbound.id);

  replyText = cleanForText(replyText);
  if (!replyText) {
    fallback = true;
    replyText = KIMI_CONFIG.templates.fallback();
  }
  if (fallback) {
    await emitEvent('agent_fallback', { userId, channel, properties: { message_id: inbound.id, intent, path } });
    await flagConversation(userId, 'agent_error', inbound.id);
  }

  const latencyMs = clockNow().getTime() - received.getTime();
  let outboundIds = [];
  if (isWeb) {
    const out = await appendMessage({
      user_id: userId,
      direction: 'outbound',
      channel: 'web',
      provider: 'web',
      body: replyText,
      kind: 'reply',
      intent,
      related_alert_id: relatedAlertId,
      related_backtest_id: relatedBacktestId,
      reply_to_message_id: inbound.id,
      latency_ms: latencyMs,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      llm_cost_usd: llmCostUsd,
      fallback
    });
    outboundIds = [out.id];
  } else if (phone) {
    const sent = await sendKimiMessage({
      userId,
      to: phone,
      text: replyText,
      kind: 'reply',
      provider,
      intent,
      relatedAlertId,
      relatedBacktestId,
      replyToMessageId: inbound.id,
      latencyMs,
      tokensIn,
      tokensOut,
      llmCostUsd,
      fallback,
      profile
    });
    outboundIds = sent.results.map((r) => r.messageId);
  }

  for (const jobId of pendingJobs) waitUntil(runBacktestJob(jobId));
  waitUntil(maybeRefreshSummary(userId));

  return {
    duplicate: false,
    inboundId: inbound.id,
    outboundIds,
    replyText,
    intent,
    path,
    fallback,
    latencyMs,
    tokensIn,
    tokensOut,
    llmCostUsd,
    pendingJobs,
    processingMs: Date.now() - startedAt
  };
}

export async function maybeRefreshSummary(userId) {
  const conversation = await getConversation(userId);
  const count = conversation.message_count || 0;
  if (count - (conversation.summary_message_count || 0) < AGENT.summaryEveryMessages) return false;
  const messages = await listUserMessages(userId, { limit: AGENT.summaryEveryMessages * 2 });
  const summary = await summarizeConversation({ userId, previousSummary: conversation.summary || '', messages });
  await setConversationSummary(userId, summary, count);
  return true;
}

/** Website preference edits reuse the same validation as the agent tool. */
export { applyPreferenceChanges };

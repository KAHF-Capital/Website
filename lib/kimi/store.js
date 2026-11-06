// Kimi data model and repositories. Collections (Firestore names):
//
//   kimi_profiles            user_id -> phone (encrypted), consent, preferences
//   kimi_phones              phone hash -> owning user, opt-out, signup-link limit
//   kimi_conversations       user_id -> rolling summary, flags, counts
//   kimi_messages            immutable inbound/outbound log (create-only)
//   kimi_alerts              backend_signal_id -> unmodified signal payload
//   kimi_alert_deliveries    alert_id__user_id -> sent / suppressed + reason
//   kimi_backtests           backtest jobs and results
//   kimi_tool_calls          every tool execution
//   kimi_links               short code -> target, click tracking
//   kimi_events              analytics events
//   kimi_daily_rollups       per-day aggregates for charts
//   kimi_audit_log           admin actions (transcript views, exports, switches)
//   kimi_system              kill switch / dry-run overrides, job bookkeeping
//   kimi_jobs                durable queue for inbound webhooks
//   kimi_usage               per-user and global daily token / cost counters
//   kimi_rate_limits         fixed-window counters
//   kimi_ticker_meta         cached sector lookups for watchlist matching
//
// Messages are never updated or deleted by application code.

import { getDb, increment } from './db.js';
import { KIMI_CONFIG } from './kimi.config.js';
import { encryptPhone, decryptPhone, hashPhone, maskPhone, normalizePhone, sha256Hex, randomCode } from './crypto.js';
import { newId, usageDay, clockNow } from './runtime.js';

export const COL = {
  profiles: 'kimi_profiles',
  phones: 'kimi_phones',
  conversations: 'kimi_conversations',
  messages: 'kimi_messages',
  alerts: 'kimi_alerts',
  deliveries: 'kimi_alert_deliveries',
  backtests: 'kimi_backtests',
  toolCalls: 'kimi_tool_calls',
  links: 'kimi_links',
  events: 'kimi_events',
  rollups: 'kimi_daily_rollups',
  audit: 'kimi_audit_log',
  system: 'kimi_system',
  jobs: 'kimi_jobs',
  usage: 'kimi_usage',
  rateLimits: 'kimi_rate_limits',
  tickerMeta: 'kimi_ticker_meta'
};

const nowIso = () => clockNow().toISOString();

function inRange(value, from, to) {
  if (!value) return false;
  if (from && value < from) return false;
  if (to && value >= to) return false;
  return true;
}

// ---------------------------------------------------------------------------
// System state: kill switch and dry run
// ---------------------------------------------------------------------------

export async function getSystemState() {
  const doc = (await getDb().get(COL.system, 'state')) || {};
  const envAlerts = KIMI_CONFIG.delivery.alertsEnabled;
  const envDryRun = KIMI_CONFIG.delivery.dryRun;
  const alertsOverride = typeof doc.alerts_enabled_override === 'boolean' ? doc.alerts_enabled_override : null;
  const dryRunOverride = typeof doc.dry_run_override === 'boolean' ? doc.dry_run_override : null;
  return {
    alerts_enabled: alertsOverride ?? envAlerts,
    // KIMI_DRY_RUN=true is a floor the dashboard cannot lower.
    dry_run: envDryRun || dryRunOverride === true,
    env: { alerts_enabled: envAlerts, dry_run: envDryRun },
    overrides: { alerts_enabled: alertsOverride, dry_run: dryRunOverride },
    updated_at: doc.updated_at || null,
    updated_by: doc.updated_by || null,
    last_tick_at: doc.last_tick_at || null,
    last_tick: doc.last_tick || null,
    last_rollup_at: doc.last_rollup_at || null,
    last_forward_returns_at: doc.last_forward_returns_at || null,
    spend_alert_day: doc.spend_alert_day || null
  };
}

export async function setSystemOverrides({ alertsEnabled, dryRun }, actor) {
  const patch = { updated_at: nowIso(), updated_by: actor?.email || actor?.uid || 'system' };
  if (alertsEnabled === null || typeof alertsEnabled === 'boolean') patch.alerts_enabled_override = alertsEnabled;
  if (dryRun === null || typeof dryRun === 'boolean') patch.dry_run_override = dryRun;
  await getDb().update(COL.system, 'state', patch);
  await recordAudit({
    actorUid: actor?.uid || null,
    actorEmail: actor?.email || null,
    action: 'update_switches',
    metadata: { alerts_enabled: alertsEnabled, dry_run: dryRun }
  });
  await emitEvent('switches_changed', { properties: { alerts_enabled: alertsEnabled, dry_run: dryRun, actor: patch.updated_by } });
  return getSystemState();
}

export async function updateSystemMeta(patch) {
  await getDb().update(COL.system, 'state', patch);
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export async function emitEvent(type, { userId = null, channel = null, ticker = null, properties = {}, at = null } = {}) {
  const createdAt = at ? new Date(at).toISOString() : nowIso();
  const id = newId('evt');
  const doc = {
    type,
    user_id: userId || null,
    channel: channel || null,
    ticker: ticker ? String(ticker).toUpperCase() : null,
    properties: properties || {},
    created_at: createdAt,
    day: usageDay(new Date(createdAt))
  };
  await getDb().set(COL.events, id, doc);
  return { id, ...doc };
}

/** Events in [from, to). Filters other than time run in memory to avoid composite indexes. */
export async function queryEvents({ from = null, to = null, types = null, userId = null } = {}) {
  const typeSet = types ? new Set(Array.isArray(types) ? types : [types]) : null;
  let docs;
  if (userId) {
    docs = await getDb().query(COL.events, { where: [['user_id', '==', userId]] });
    docs = docs.filter((e) => (!from && !to) || inRange(e.created_at, from, to));
  } else {
    const where = [];
    if (from) where.push(['created_at', '>=', from]);
    if (to) where.push(['created_at', '<', to]);
    docs = await getDb().query(COL.events, { where });
  }
  if (typeSet) docs = docs.filter((e) => typeSet.has(e.type));
  return docs.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

export function defaultPreferences() {
  const d = KIMI_CONFIG.delivery;
  return {
    watchlist: { mode: 'all', tickers: [], sectors: [], muted: [] },
    min_notional: d.defaultMinNotional,
    quiet_hours: { ...d.defaultQuietHours },
    market_hours_only: d.defaultMarketHoursOnly,
    max_alerts_per_hour: d.defaultMaxAlertsPerHour,
    max_alerts_per_day: d.defaultMaxAlertsPerDay,
    digest: { ...d.defaultDigest }
  };
}

export function withDefaultPreferences(prefs = {}) {
  const base = defaultPreferences();
  return {
    ...base,
    ...prefs,
    watchlist: { ...base.watchlist, ...(prefs.watchlist || {}) },
    quiet_hours: { ...base.quiet_hours, ...(prefs.quiet_hours || {}) },
    digest: { ...base.digest, ...(prefs.digest || {}) }
  };
}

export async function getProfile(userId) {
  if (!userId) return null;
  const doc = await getDb().get(COL.profiles, userId);
  return doc ? { ...doc, preferences: withDefaultPreferences(doc.preferences) } : null;
}

export async function ensureProfile(userId, { email = null, plan = null, at = null } = {}) {
  const createdAt = at || nowIso();
  const fresh = {
    user_id: userId,
    email: email || null,
    plan: plan || 'free',
    phone_encrypted: null,
    phone_hash: null,
    phone_masked: null,
    phone_verified_at: null,
    consent_version: null,
    consent_text: null,
    consent_at: null,
    consent_ip: null,
    opted_out_at: null,
    paused_until: null,
    timezone: KIMI_CONFIG.delivery.defaultTimezone,
    preferences: defaultPreferences(),
    sms_enabled: false,
    last_alert_id: null,
    last_alert_at: null,
    created_at: createdAt,
    updated_at: createdAt
  };
  const { created } = await getDb().create(COL.profiles, userId, fresh);
  if (created) {
    await emitEvent('signup_started', { userId, at: createdAt });
    return { ...fresh, id: userId };
  }
  const existing = await getProfile(userId);
  const patch = {};
  if (email && existing.email !== email) patch.email = email;
  if (plan && existing.plan !== plan) patch.plan = plan;
  if (Object.keys(patch).length) return updateProfile(userId, patch);
  return existing;
}

export async function updateProfile(userId, patch) {
  const current = await getProfile(userId);
  const merged = { ...(current || {}), ...patch };
  if (patch.preferences) merged.preferences = withDefaultPreferences({ ...(current?.preferences || {}), ...patch.preferences });
  const smsEnabled = Boolean(merged.phone_hash && merged.phone_verified_at && merged.consent_at);
  const write = { ...patch, sms_enabled: smsEnabled, updated_at: nowIso() };
  if (patch.preferences) write.preferences = merged.preferences;
  // Preferences are replaced as a whole so removed tickers/sectors stay removed.
  if (current && patch.preferences) {
    await getDb().set(COL.profiles, userId, { ...current, ...write }, { merge: false });
  } else {
    await getDb().update(COL.profiles, userId, write);
  }
  return getProfile(userId);
}

export async function listProfiles({ smsEnabledOnly = false } = {}) {
  const docs = smsEnabledOnly
    ? await getDb().query(COL.profiles, { where: [['sms_enabled', '==', true]] })
    : await getDb().query(COL.profiles);
  return docs.map((p) => ({ ...p, preferences: withDefaultPreferences(p.preferences) }));
}

export function profilePhone(profile) {
  return profile?.phone_encrypted ? decryptPhone(profile.phone_encrypted) : null;
}

export function phoneFields(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) throw new Error('Invalid phone number');
  return {
    phone_encrypted: encryptPhone(normalized),
    phone_hash: hashPhone(normalized),
    phone_masked: maskPhone(normalized)
  };
}

/**
 * Record that a user was active (sent a message or ran a backtest) for the
 * funnel and retention views: a set of active ET days plus first-time markers.
 */
export async function markUserActivity(userId, { at = clockNow().toISOString(), kind = 'text' } = {}) {
  if (!userId) return;
  const day = usageDay(new Date(at));
  await getDb().update(COL.profiles, userId, { active_days: { [day]: true }, last_active_at: at });
  const marker = kind === 'text' ? 'first_inbound_text_at' : kind === 'backtest' ? 'first_backtest_at' : null;
  if (marker) await getDb().updateIf(COL.profiles, userId, (p) => p && !p[marker], { [marker]: at });
}

// ---------------------------------------------------------------------------
// Phone registry: ownership, phone-level opt-out, signup-link rate limit
// ---------------------------------------------------------------------------

export async function getPhoneRecord(phone) {
  const h = hashPhone(phone);
  return h ? getDb().get(COL.phones, h) : null;
}

export async function findProfileByPhone(phone) {
  const record = await getPhoneRecord(phone);
  return record?.user_id ? getProfile(record.user_id) : null;
}

/** Bind a verified phone to a user. Fails when another account owns it. */
export async function claimPhone(userId, phone) {
  const h = hashPhone(phone);
  if (!h) throw new Error('Invalid phone number');
  const now = nowIso();
  const res = await getDb().updateIf(
    COL.phones,
    h,
    (cur) => !cur || !cur.user_id || cur.user_id === userId,
    (cur) => ({
      phone_hash: h,
      phone_masked: maskPhone(phone),
      user_id: userId,
      claimed_at: now,
      created_at: cur?.created_at || now,
      updated_at: now
    })
  );
  return res.updated;
}

export async function releasePhone(userId, phoneHash) {
  if (!phoneHash) return;
  await getDb().updateIf(COL.phones, phoneHash, (cur) => cur?.user_id === userId, { user_id: null, updated_at: nowIso() });
}

export async function setPhoneOptOut(phone, optedOut) {
  const h = hashPhone(phone);
  if (!h) return;
  const now = nowIso();
  await getDb().update(COL.phones, h, {
    phone_hash: h,
    phone_masked: maskPhone(phone),
    opted_out_at: optedOut ? now : null,
    updated_at: now
  });
}

/** True at most once per cooldown window per phone (atomic). */
export async function claimSignupLinkSlot(phone, now = clockNow()) {
  const h = hashPhone(phone);
  if (!h) return false;
  const cooldownMs = KIMI_CONFIG.messaging.unknownSenderReplyCooldownHours * 3600 * 1000;
  const res = await getDb().updateIf(
    COL.phones,
    h,
    (cur) => !cur?.last_signup_link_at || now.getTime() - new Date(cur.last_signup_link_at).getTime() >= cooldownMs,
    (cur) => ({
      phone_hash: h,
      phone_masked: maskPhone(phone),
      user_id: cur?.user_id || null,
      last_signup_link_at: now.toISOString(),
      signup_link_count: increment(1),
      created_at: cur?.created_at || now.toISOString(),
      updated_at: now.toISOString()
    })
  );
  return res.updated;
}

// ---------------------------------------------------------------------------
// Conversations and immutable messages
// ---------------------------------------------------------------------------

export async function getConversation(userId) {
  return (await getDb().get(COL.conversations, userId)) || {
    id: userId,
    user_id: userId,
    message_count: 0,
    summary: '',
    summary_message_count: 0,
    flagged: false,
    flag_reasons: []
  };
}

export async function setConversationSummary(userId, summary, messageCount) {
  await getDb().update(COL.conversations, userId, {
    user_id: userId,
    summary,
    summary_message_count: messageCount,
    summary_updated_at: nowIso()
  });
}

export async function flagConversation(userId, reason, messageId = null) {
  const conv = await getConversation(userId);
  const reasons = new Set(conv.flag_reasons || []);
  reasons.add(reason);
  await getDb().update(COL.conversations, userId, {
    user_id: userId,
    flagged: true,
    flag_reasons: [...reasons],
    flagged_at: nowIso(),
    last_flag: { reason, message_id: messageId, at: nowIso() },
    resolved_at: null
  });
  await emitEvent('conversation_flagged', { userId, properties: { reason, message_id: messageId } });
}

export async function resolveConversationFlag(userId, actor) {
  await getDb().update(COL.conversations, userId, { flagged: false, resolved_at: nowIso(), resolved_by: actor?.email || null });
}

export async function queryFlaggedConversations() {
  return getDb().query(COL.conversations, { where: [['flagged', '==', true]] });
}

export function inboundMessageId(provider, providerMessageId) {
  return `in_${provider}_${sha256Hex(`${provider}:${providerMessageId}`).slice(0, 32)}`;
}

/**
 * Append an immutable message. Returns { created: false } when the id already
 * exists, which is how inbound provider retries are deduplicated.
 */
export async function appendMessage(msg) {
  const direction = msg.direction === 'inbound' ? 'inbound' : 'outbound';
  const id = msg.id || newId(direction === 'inbound' ? 'in' : 'out');
  const createdAt = msg.created_at || nowIso();
  const retainUntil = new Date(new Date(createdAt).getTime() + KIMI_CONFIG.retention.messageRetentionDays * 86400000).toISOString();
  const doc = {
    conversation_id: msg.user_id || (msg.phone_hash ? `anon:${msg.phone_hash}` : 'anon:unknown'),
    user_id: msg.user_id || null,
    phone_hash: msg.phone_hash || null,
    phone_masked: msg.phone_masked || null,
    direction,
    channel: msg.channel || 'sms',
    provider: msg.provider || null,
    provider_message_id: msg.provider_message_id || null,
    body: String(msg.body ?? ''),
    redacted: Boolean(msg.redacted),
    media: Array.isArray(msg.media) ? msg.media : [],
    kind: msg.kind || (direction === 'inbound' ? 'user' : 'reply'),
    intent: msg.intent || null,
    related_alert_id: msg.related_alert_id || null,
    related_backtest_id: msg.related_backtest_id || null,
    reply_to_message_id: msg.reply_to_message_id || null,
    tokens_in: Number(msg.tokens_in) || 0,
    tokens_out: Number(msg.tokens_out) || 0,
    llm_cost_usd: Number(msg.llm_cost_usd) || 0,
    messaging_cost_usd: Number(msg.messaging_cost_usd) || 0,
    latency_ms: Number(msg.latency_ms) || 0,
    fallback: Boolean(msg.fallback),
    flagged: Boolean(msg.flagged),
    flag_reason: msg.flag_reason || null,
    dry_run: Boolean(msg.dry_run),
    status: msg.status || (direction === 'inbound' ? 'received' : 'sent'),
    error_code: msg.error_code || null,
    created_at: createdAt,
    retain_until: retainUntil
  };
  const { created } = await getDb().create(COL.messages, id, doc);
  if (!created) return { created: false, id };

  if (doc.user_id) {
    await getDb().update(COL.conversations, doc.user_id, {
      user_id: doc.user_id,
      message_count: increment(1),
      last_message_at: createdAt,
      [`last_${direction}_at`]: createdAt
    });
    if (direction === 'inbound') await markUserActivity(doc.user_id, { at: createdAt, kind: doc.channel === 'web' ? 'web' : 'text' });
  }
  await emitEvent(direction === 'inbound' ? 'message_inbound' : 'message_outbound', {
    userId: doc.user_id,
    channel: doc.channel,
    ticker: (doc.body.match(/\$([A-Z]{1,5})\b/) || [])[1] || null,
    at: createdAt,
    properties: {
      message_id: id,
      kind: doc.kind,
      intent: doc.intent,
      provider: doc.provider,
      latency_ms: doc.latency_ms,
      tokens_in: doc.tokens_in,
      tokens_out: doc.tokens_out,
      llm_cost_usd: doc.llm_cost_usd,
      messaging_cost_usd: doc.messaging_cost_usd,
      fallback: doc.fallback,
      dry_run: doc.dry_run,
      status: doc.status,
      related_alert_id: doc.related_alert_id,
      related_backtest_id: doc.related_backtest_id
    }
  });
  return { created: true, id, message: { ...doc, id } };
}

export async function getMessage(id) {
  return getDb().get(COL.messages, id);
}

export async function findMessageByProviderId(providerMessageId) {
  if (!providerMessageId) return null;
  const docs = await getDb().query(COL.messages, { where: [['provider_message_id', '==', String(providerMessageId)]], limit: 1 });
  return docs[0] || null;
}

/** Chronological messages for one user (most recent `limit`). */
export async function listUserMessages(userId, { limit = 50, from = null, to = null } = {}) {
  let docs = await getDb().query(COL.messages, {
    where: [['user_id', '==', userId]],
    orderBy: ['created_at', 'desc'],
    limit: from || to ? null : limit
  });
  if (from || to) docs = docs.filter((m) => inRange(m.created_at, from, to));
  docs.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.direction === 'inbound' ? -1 : 1));
  return limit ? docs.slice(-limit) : docs;
}

export async function queryMessages({ from = null, to = null } = {}) {
  const where = [];
  if (from) where.push(['created_at', '>=', from]);
  if (to) where.push(['created_at', '<', to]);
  return getDb().query(COL.messages, { where });
}

// ---------------------------------------------------------------------------
// Alerts and deliveries
// ---------------------------------------------------------------------------

export async function getAlert(id) {
  return id ? getDb().get(COL.alerts, id) : null;
}

export async function createAlert(id, data) {
  return getDb().create(COL.alerts, id, { ...data, backend_signal_id: id });
}

export async function updateAlert(id, patch) {
  await getDb().update(COL.alerts, id, patch);
}

export async function queryAlerts({ status = null, from = null, to = null } = {}) {
  if (status) {
    const docs = await getDb().query(COL.alerts, { where: [['status', '==', status]] });
    return docs.filter((a) => (!from && !to) || inRange(a.received_at, from, to));
  }
  const where = [];
  if (from) where.push(['received_at', '>=', from]);
  if (to) where.push(['received_at', '<', to]);
  return getDb().query(COL.alerts, { where });
}

export function deliveryKey(alertId, userId) {
  return `${alertId}__${userId}`;
}

export async function getDelivery(alertId, userId) {
  return getDb().get(COL.deliveries, deliveryKey(alertId, userId));
}

/** Exactly one delivery record per (alert, user). */
export async function createDelivery(alertId, userId, data) {
  const now = nowIso();
  return getDb().create(COL.deliveries, deliveryKey(alertId, userId), {
    alert_id: alertId,
    user_id: userId,
    created_at: now,
    updated_at: now,
    ...data
  });
}

export async function updateDelivery(alertId, userId, patch) {
  await getDb().update(COL.deliveries, deliveryKey(alertId, userId), { ...patch, updated_at: nowIso() });
}

export async function updateDeliveryIf(alertId, userId, predicate, patch) {
  return getDb().updateIf(COL.deliveries, deliveryKey(alertId, userId), predicate, patch);
}

export async function queryDeliveries({ userId = null, alertId = null, status = null, from = null, to = null } = {}) {
  let docs;
  if (userId) docs = await getDb().query(COL.deliveries, { where: [['user_id', '==', userId]] });
  else if (alertId) docs = await getDb().query(COL.deliveries, { where: [['alert_id', '==', alertId]] });
  else if (status) docs = await getDb().query(COL.deliveries, { where: [['status', '==', status]] });
  else {
    const where = [];
    if (from) where.push(['created_at', '>=', from]);
    if (to) where.push(['created_at', '<', to]);
    return getDb().query(COL.deliveries, { where });
  }
  return docs.filter(
    (d) =>
      (!alertId || d.alert_id === alertId) &&
      (!status || d.status === status) &&
      ((!from && !to) || inRange(d.created_at, from, to))
  );
}

// ---------------------------------------------------------------------------
// Backtests
// ---------------------------------------------------------------------------

export async function createBacktest(job) {
  const id = job.id || newId('bt');
  const now = nowIso();
  await getDb().set(COL.backtests, id, { ...job, job_id: id, created_at: job.created_at || now, updated_at: now });
  return { ...job, id, job_id: id, created_at: job.created_at || now };
}

export async function updateBacktest(id, patch) {
  await getDb().update(COL.backtests, id, { ...patch, updated_at: nowIso() });
}

export async function updateBacktestIf(id, predicate, patch) {
  return getDb().updateIf(COL.backtests, id, predicate, patch);
}

export async function getBacktest(id) {
  return id ? getDb().get(COL.backtests, id) : null;
}

export async function queryBacktests({ userId = null, status = null, from = null, to = null } = {}) {
  let docs;
  if (userId) docs = await getDb().query(COL.backtests, { where: [['user_id', '==', userId]] });
  else if (status) docs = await getDb().query(COL.backtests, { where: [['status', '==', status]] });
  else {
    const where = [];
    if (from) where.push(['created_at', '>=', from]);
    if (to) where.push(['created_at', '<', to]);
    return getDb().query(COL.backtests, { where });
  }
  return docs
    .filter((b) => (!status || b.status === status) && ((!from && !to) || inRange(b.created_at, from, to)))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

// ---------------------------------------------------------------------------
// Tool calls
// ---------------------------------------------------------------------------

export async function recordToolCall({ userId, channel = null, messageId = null, tool, args = {}, latencyMs = 0, success = true, error = null, at = null }) {
  const id = newId('tool');
  const createdAt = at || nowIso();
  await getDb().set(COL.toolCalls, id, {
    user_id: userId,
    channel,
    message_id: messageId,
    tool,
    args,
    latency_ms: latencyMs,
    success,
    error,
    created_at: createdAt
  });
  await emitEvent(success ? 'tool_called' : 'tool_failed', {
    userId,
    channel,
    at: createdAt,
    properties: { tool, latency_ms: latencyMs, error, message_id: messageId }
  });
}

export async function queryToolCalls({ from = null, to = null } = {}) {
  const where = [];
  if (from) where.push(['created_at', '>=', from]);
  if (to) where.push(['created_at', '<', to]);
  return getDb().query(COL.toolCalls, { where });
}

// ---------------------------------------------------------------------------
// Tracked short links (/k/:code)
// ---------------------------------------------------------------------------

export async function createShortLink({ targetPath, kind, userId = null, alertId = null, deliveryId = null, backtestId = null }) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = randomCode(7);
    const { created } = await getDb().create(COL.links, code, {
      code,
      target_path: targetPath,
      kind,
      user_id: userId,
      alert_id: alertId,
      delivery_id: deliveryId,
      backtest_id: backtestId,
      clicks: 0,
      first_clicked_at: null,
      last_clicked_at: null,
      created_at: nowIso()
    });
    if (created) return { code, path: `/k/${code}`, url: `${KIMI_CONFIG.publicBaseUrl}/k/${code}` };
  }
  throw new Error('Could not allocate a short link code');
}

export async function resolveShortLink(code) {
  const link = await getDb().get(COL.links, code);
  if (!link) return null;
  const now = nowIso();
  const first = !link.first_clicked_at;
  await getDb().update(COL.links, code, {
    clicks: increment(1),
    last_clicked_at: now,
    ...(first ? { first_clicked_at: now } : {})
  });
  if (link.alert_id && link.user_id) {
    await updateDeliveryIf(link.alert_id, link.user_id, (d) => d && !d.clicked_at, { clicked_at: now, updated_at: now });
  }
  await emitEvent(link.kind === 'backtest' ? 'backtest_link_clicked' : 'alert_link_clicked', {
    userId: link.user_id,
    properties: { code, kind: link.kind, alert_id: link.alert_id, backtest_id: link.backtest_id, first_click: first }
  });
  return link;
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export async function recordAudit({ actorUid = null, actorEmail = null, action, targetUserId = null, metadata = {} }) {
  const id = newId('audit');
  const entry = {
    actor_uid: actorUid,
    actor_email: actorEmail,
    action,
    target_user_id: targetUserId,
    metadata,
    created_at: nowIso()
  };
  await getDb().set(COL.audit, id, entry);
  return { id, ...entry };
}

export async function queryAudit({ targetUserId = null, limit = 100 } = {}) {
  const docs = targetUserId
    ? await getDb().query(COL.audit, { where: [['target_user_id', '==', targetUserId]] })
    : await getDb().query(COL.audit);
  return docs.sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, limit);
}

// ---------------------------------------------------------------------------
// Daily rollups
// ---------------------------------------------------------------------------

export async function saveRollup(day, data) {
  await getDb().set(COL.rollups, day, { ...data, day, updated_at: nowIso() });
}

export async function queryRollups({ from = null, to = null } = {}) {
  const where = [];
  if (from) where.push(['day', '>=', from]);
  if (to) where.push(['day', '<=', to]);
  const docs = await getDb().query(COL.rollups, { where });
  return docs.sort((a, b) => (a.day < b.day ? -1 : 1));
}

// ---------------------------------------------------------------------------
// Usage counters, spend caps, rate limits
// ---------------------------------------------------------------------------

export async function addUsage(userId, { tokensIn = 0, tokensOut = 0, llmCostUsd = 0, messagingCostUsd = 0, llmCalls = 0, messagesOut = 0 } = {}, at = clockNow()) {
  const day = usageDay(at);
  const patch = {
    day,
    tokens_in: increment(tokensIn),
    tokens_out: increment(tokensOut),
    llm_cost_usd: increment(llmCostUsd),
    messaging_cost_usd: increment(messagingCostUsd),
    llm_calls: increment(llmCalls),
    messages_out: increment(messagesOut)
  };
  const writes = [getDb().update(COL.usage, `${day}__global`, { ...patch, scope: 'global' })];
  if (userId) writes.push(getDb().update(COL.usage, `${day}__${userId}`, { ...patch, scope: 'user', user_id: userId }));
  await Promise.all(writes);
}

export async function getUsage(scope, at = clockNow()) {
  const day = usageDay(at);
  const doc = await getDb().get(COL.usage, `${day}__${scope}`);
  return {
    day,
    tokens: (doc?.tokens_in || 0) + (doc?.tokens_out || 0),
    llm_cost_usd: doc?.llm_cost_usd || 0,
    messaging_cost_usd: doc?.messaging_cost_usd || 0
  };
}

/** Fixed-window counter. Returns { allowed } atomically. */
export async function consumeRateLimit(key, { windowMs, max }, now = clockNow()) {
  const windowStart = Math.floor(now.getTime() / windowMs) * windowMs;
  const id = `${sha256Hex(key).slice(0, 24)}__${windowStart}`;
  const res = await getDb().updateIf(
    COL.rateLimits,
    id,
    (cur) => (cur?.count || 0) < max,
    { key_hash: sha256Hex(key).slice(0, 24), window_start: new Date(windowStart).toISOString(), count: increment(1) }
  );
  return { allowed: res.updated };
}

// ---------------------------------------------------------------------------
// Ticker metadata cache (sector lookups for watchlist matching)
// ---------------------------------------------------------------------------

export async function getTickerMeta(ticker) {
  return getDb().get(COL.tickerMeta, String(ticker).toUpperCase());
}

export async function setTickerMeta(ticker, data) {
  await getDb().set(COL.tickerMeta, String(ticker).toUpperCase(), { ...data, ticker: String(ticker).toUpperCase(), fetched_at: nowIso() });
}

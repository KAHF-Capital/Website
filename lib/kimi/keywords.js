// Reserved keywords, handled before the LLM and case-insensitively.
//
//   STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT  -> opt out, confirm once
//   START, UNSTOP                                  -> opt back in
//   HELP                                           -> program, support, STOP
//   PAUSE                                          -> pause alerts for 24h
//   RESUME                                         -> resume alerts
//
// STOP variants are honored even when the provider also handles them.

import { KIMI_CONFIG } from './kimi.config.js';
import { formatInTimeZone, clockNow } from './runtime.js';
import { emitEvent, queryDeliveries, setPhoneOptOut, updateDelivery, updateProfile } from './store.js';

const OPT_OUT_PHRASE =
  /^(PLEASE\s+)?(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT|OPT\s?OUT|OPTOUT)(\s+(ME|IT|ALL|THIS|NOW|PLEASE|TEXTING|MESSAGING|SENDING|MESSAGES|TEXTS|ALERTS|KIMI))*$/;

export function normalizeKeywordText(text) {
  return String(text || '')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

export function matchKeyword(text) {
  const token = normalizeKeywordText(text);
  if (!token) return null;
  const k = KIMI_CONFIG.keywords;
  if (k.optOut.includes(token) || OPT_OUT_PHRASE.test(token)) return 'OPT_OUT';
  if (k.optIn.includes(token)) return 'OPT_IN';
  if (k.help.includes(token)) return 'HELP';
  if (k.pause.includes(token)) return 'PAUSE';
  if (k.resume.includes(token)) return 'RESUME';
  return null;
}

/** Mark alerts sent in the last 24h as followed by a mute or opt-out. */
export async function markRecentAlerts(userId, field, now = clockNow(), { ticker = null } = {}) {
  if (!userId) return;
  const cutoff = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
  const deliveries = await queryDeliveries({ userId });
  await Promise.all(
    deliveries
      .filter((d) => d.sent_at && d.sent_at >= cutoff && !d[field] && (!ticker || d.ticker === ticker))
      .map((d) => updateDelivery(d.alert_id, userId, { [field]: now.toISOString() }))
  );
}

/**
 * Apply a keyword. Returns { action, replyText, compliance } where `compliance`
 * marks replies that may go to an opted-out number.
 */
export async function handleKeyword({ keyword, profile = null, phone, channel = null, now = clockNow() }) {
  const userId = profile?.user_id || null;
  const nowIso = now.toISOString();

  switch (keyword) {
    case 'OPT_OUT': {
      await setPhoneOptOut(phone, true);
      if (userId) {
        await updateProfile(userId, { opted_out_at: nowIso });
        await markRecentAlerts(userId, 'opted_out_after_at', now);
      }
      await emitEvent('opted_out', { userId, channel, at: nowIso, properties: { source: 'keyword' } });
      return { action: 'opted_out', replyText: KIMI_CONFIG.templates.optOutConfirm(), compliance: true };
    }
    case 'OPT_IN': {
      await setPhoneOptOut(phone, false);
      if (userId) await updateProfile(userId, { opted_out_at: null });
      await emitEvent('opted_in', { userId, channel, at: nowIso, properties: { source: 'keyword' } });
      return { action: 'opted_in', replyText: KIMI_CONFIG.templates.optInConfirm(), compliance: true };
    }
    case 'HELP':
      return { action: 'help', replyText: KIMI_CONFIG.templates.help(), compliance: true };
    case 'PAUSE': {
      const until = new Date(now.getTime() + KIMI_CONFIG.messaging.pauseHours * 3600 * 1000);
      if (userId) {
        await updateProfile(userId, { paused_until: until.toISOString() });
        await markRecentAlerts(userId, 'muted_after_at', now);
        await emitEvent('prefs_updated', { userId, channel, at: nowIso, properties: { source: 'keyword', fields: ['paused_until'] } });
      }
      const label = formatInTimeZone(until, profile?.timezone, { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
      return { action: 'paused', replyText: KIMI_CONFIG.templates.pauseConfirm(label), compliance: false };
    }
    case 'RESUME': {
      if (userId) {
        await updateProfile(userId, { paused_until: null });
        await emitEvent('prefs_updated', { userId, channel, at: nowIso, properties: { source: 'keyword', fields: ['paused_until'] } });
      }
      return { action: 'resumed', replyText: KIMI_CONFIG.templates.resumeConfirm(), compliance: false };
    }
    default:
      return null;
  }
}

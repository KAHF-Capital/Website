// Website onboarding: phone entry -> OTP -> explicit consent -> welcome text.
//
// The number being verified is kept as a pending phone until the code checks
// out, so changing numbers never inherits the old verification. Consent stores
// the exact text and version shown, the timestamp and the IP.

import { KIMI_CONFIG } from './kimi.config.js';
import { SECTORS } from './backend.js';
import { HttpError } from './auth.js';
import { decryptPhone, generateOtp, hashOtp, hashPhone, normalizePhone, timingSafeEqualStr } from './crypto.js';
import { isProduction, clockNow } from './runtime.js';
import { getFirestoreAdmin, isFirebaseAdminConfigured } from '../firebase-admin.js';
import { isProStatus } from '../subscription-access.js';
import { kimiNumber, sendKimiMessage } from './messaging/index.js';
import {
  claimPhone,
  consumeRateLimit,
  emitEvent,
  ensureProfile,
  getPhoneRecord,
  getProfile,
  phoneFields,
  releasePhone,
  setPhoneOptOut,
  updateProfile
} from './store.js';

const OTP = KIMI_CONFIG.onboarding;

export const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Toronto',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'UTC'
];

export function publicConfig() {
  const number = kimiNumber();
  return {
    programName: KIMI_CONFIG.programName,
    supportEmail: KIMI_CONFIG.supportEmail,
    kimiNumber: number,
    smsHref: number ? `sms:${number}` : null,
    consent: KIMI_CONFIG.consent,
    disclaimers: {
      onboarding: KIMI_CONFIG.disclaimers.onboarding,
      resultsPage: KIMI_CONFIG.disclaimers.resultsPage,
      alertPage: KIMI_CONFIG.disclaimers.alertPage
    },
    sectors: SECTORS,
    timezones: TIMEZONES,
    bounds: {
      maxAlertsPerDay: KIMI_CONFIG.delivery.maxAlertsPerDayBounds,
      digestInterval: KIMI_CONFIG.delivery.digestIntervalBounds
    },
    backtests: {
      structures: KIMI_CONFIG.backtests.defaultStructures,
      rankMetrics: KIMI_CONFIG.backtests.rankMetrics
    }
  };
}

async function syncPlan(userId, profile) {
  if (!isFirebaseAdminConfigured()) return profile;
  try {
    const snap = await getFirestoreAdmin().collection('users').doc(userId).get();
    const plan = isProStatus(snap.exists ? snap.data()?.subscription?.status : null) ? 'pro' : 'free';
    return plan !== profile.plan ? updateProfile(userId, { plan }) : profile;
  } catch (err) {
    console.warn('[kimi/onboarding] plan sync skipped:', err.message);
    return profile;
  }
}

export function profileView(profile, now = clockNow()) {
  return {
    user_id: profile.user_id,
    email: profile.email || null,
    plan: profile.plan || 'free',
    phone_masked: profile.phone_masked || null,
    phone_verified: Boolean(profile.phone_verified_at),
    consented: Boolean(profile.consent_at),
    consent_version: profile.consent_version || null,
    consent_at: profile.consent_at || null,
    sms_enabled: Boolean(profile.sms_enabled),
    opted_out: Boolean(profile.opted_out_at),
    paused_until: profile.paused_until && new Date(profile.paused_until) > now ? profile.paused_until : null,
    timezone: profile.timezone,
    preferences: profile.preferences,
    pending_phone_masked: profile.pending_phone_masked || null,
    otp_pending: Boolean(profile.otp_hash && profile.otp_expires_at && new Date(profile.otp_expires_at) > now)
  };
}

export async function loadProfileForUser(user) {
  const profile = await ensureProfile(user.uid, { email: user.email || null });
  return syncPlan(user.uid, profile);
}

export async function startPhoneVerification({ user, phone, now = clockNow() }) {
  const normalized = normalizePhone(phone);
  if (!normalized) throw new HttpError(400, 'Enter a valid mobile number, e.g. (415) 555-0199.');
  await ensureProfile(user.uid, { email: user.email || null });

  const record = await getPhoneRecord(normalized);
  if (record?.user_id && record.user_id !== user.uid) throw new HttpError(409, 'That number is linked to another KAHF account.');
  if (record?.opted_out_at) {
    const number = kimiNumber();
    throw new HttpError(409, `This number opted out of Kaia texts. Text START${number ? ` to ${number}` : ' to Kaia'} first, then request a code.`);
  }

  const perUser = await consumeRateLimit(`otp:user:${user.uid}`, { windowMs: 3600000, max: OTP.otpSendsPerHour }, now);
  const perPhone = perUser.allowed
    ? await consumeRateLimit(`otp:phone:${hashPhone(normalized)}`, { windowMs: 86400000, max: OTP.otpSendsPerDayPerPhone }, now)
    : { allowed: false };
  if (!perUser.allowed || !perPhone.allowed) throw new HttpError(429, 'Too many codes requested. Try again later.');

  const code = generateOtp(OTP.otpLength);
  const pending = phoneFields(normalized);
  const expiresAt = new Date(now.getTime() + OTP.otpTtlMinutes * 60000).toISOString();
  await updateProfile(user.uid, {
    pending_phone_encrypted: pending.phone_encrypted,
    pending_phone_hash: pending.phone_hash,
    pending_phone_masked: pending.phone_masked,
    otp_hash: hashOtp(user.uid, code),
    otp_expires_at: expiresAt,
    otp_attempts: 0,
    otp_sent_at: now.toISOString()
  });

  const sent = await sendKimiMessage({
    userId: user.uid,
    to: normalized,
    text: KIMI_CONFIG.templates.otp(code, OTP.otpTtlMinutes),
    redactedBody: KIMI_CONFIG.templates.otp('••••••', OTP.otpTtlMinutes),
    kind: 'otp'
  });
  if (sent.blocked || sent.failed) throw new HttpError(502, 'We couldn\'t text that number. Check it and try again.');
  await emitEvent('otp_sent', { userId: user.uid, properties: { dry_run: sent.dryRun } });
  return {
    phone_masked: pending.phone_masked,
    expires_at: expiresAt,
    dry_run: sent.dryRun,
    // Local development only: dry run sends nothing, so surface the code.
    dev_code: sent.dryRun && !isProduction() ? code : undefined
  };
}

export async function confirmPhoneVerification({ user, code, consent, consentVersion, ip = null, userAgent = null, now = clockNow() }) {
  const profile = await getProfile(user.uid);
  if (!profile?.pending_phone_hash || !profile.otp_hash) throw new HttpError(400, 'Request a code first.');
  if (new Date(profile.otp_expires_at) < now) throw new HttpError(400, 'That code expired. Request a new one.');
  if ((profile.otp_attempts || 0) >= OTP.otpMaxAttempts) throw new HttpError(429, 'Too many attempts. Request a new code.');
  if (!timingSafeEqualStr(hashOtp(user.uid, String(code || '').trim()), profile.otp_hash)) {
    await updateProfile(user.uid, { otp_attempts: (profile.otp_attempts || 0) + 1 });
    await emitEvent('otp_failed', { userId: user.uid });
    throw new HttpError(400, 'That code isn\'t right.');
  }
  if (consent !== true) throw new HttpError(400, 'Check the box to agree to recurring automated texts.');
  if (consentVersion !== KIMI_CONFIG.consent.version) throw new HttpError(409, 'The consent terms changed. Reload the page and try again.');

  const phone = decryptPhone(profile.pending_phone_encrypted);
  if (!phone || !(await claimPhone(user.uid, phone))) throw new HttpError(409, 'That number is linked to another KAHF account.');
  if (profile.phone_hash && profile.phone_hash !== profile.pending_phone_hash) await releasePhone(user.uid, profile.phone_hash);
  await setPhoneOptOut(phone, false);

  const at = now.toISOString();
  const updated = await updateProfile(user.uid, {
    phone_encrypted: profile.pending_phone_encrypted,
    phone_hash: profile.pending_phone_hash,
    phone_masked: profile.pending_phone_masked,
    phone_verified_at: at,
    pending_phone_encrypted: null,
    pending_phone_hash: null,
    pending_phone_masked: null,
    otp_hash: null,
    otp_expires_at: null,
    otp_attempts: 0,
    consent_version: KIMI_CONFIG.consent.version,
    consent_text: KIMI_CONFIG.consent.text,
    consent_at: at,
    consent_ip: ip,
    consent_user_agent: userAgent ? String(userAgent).slice(0, 300) : null,
    opted_out_at: null
  });
  await emitEvent('phone_verified', { userId: user.uid, at });
  await emitEvent('consent_given', { userId: user.uid, at, properties: { consent_version: KIMI_CONFIG.consent.version } });

  const welcome = await sendKimiMessage({ userId: user.uid, to: phone, text: KIMI_CONFIG.templates.welcome(), kind: 'welcome', profile: updated });
  return { profile: profileView(updated, now), welcome_dry_run: welcome.dryRun };
}

/** Website opt-out / opt-in toggles mirror the STOP and START keywords. */
export async function setOptOut({ user, optedOut }) {
  const profile = await getProfile(user.uid);
  if (!profile?.phone_encrypted) throw new HttpError(400, 'No verified number on file.');
  const phone = decryptPhone(profile.phone_encrypted);
  await setPhoneOptOut(phone, optedOut);
  const updated = await updateProfile(user.uid, { opted_out_at: optedOut ? clockNow().toISOString() : null });
  await emitEvent(optedOut ? 'opted_out' : 'opted_in', { userId: user.uid, channel: 'web', properties: { source: 'website' } });
  return profileView(updated);
}

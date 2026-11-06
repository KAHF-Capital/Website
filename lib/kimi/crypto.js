// Phone normalization, encryption at rest (AES-256-GCM), deterministic lookup
// hashing (HMAC-SHA256), masking for logs and the dashboard, and small HMAC
// helpers. Keys derive from KIMI_PHONE_ENCRYPTION_KEY, which is required in
// production.

import crypto from 'crypto';

const DEV_ONLY_SECRET = 'kimi-dev-only-secret-do-not-use-in-production';

let cachedKeys = null;
let cachedSecret = null;

function getKeys() {
  const secret = process.env.KIMI_PHONE_ENCRYPTION_KEY || '';
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('KIMI_PHONE_ENCRYPTION_KEY must be set in production');
  }
  const material = secret || DEV_ONLY_SECRET;
  if (cachedKeys && cachedSecret === material) return cachedKeys;
  const derive = (info) => Buffer.from(crypto.hkdfSync('sha256', material, 'kimi-phone-v1', info, 32));
  cachedKeys = { aes: derive('aes-256-gcm'), hmac: derive('hmac-sha256'), token: derive('callback-token') };
  cachedSecret = material;
  return cachedKeys;
}

/** Normalize to E.164. Ten-digit numbers are treated as US. Returns null when invalid. */
export function normalizePhone(input) {
  if (input === null || input === undefined) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (raw.startsWith('+')) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

export function hashPhone(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  return crypto.createHmac('sha256', getKeys().hmac).update(normalized).digest('hex');
}

/** Format: v1:<iv>:<tag>:<ciphertext> (hex). */
export function encryptPhone(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) throw new Error('Invalid phone number');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKeys().aes, iv);
  const data = Buffer.concat([cipher.update(normalized, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${data.toString('hex')}`;
}

export function decryptPhone(payload) {
  if (typeof payload !== 'string') return null;
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') return null;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKeys().aes, Buffer.from(parts[1], 'hex'));
    decipher.setAuthTag(Buffer.from(parts[2], 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(parts[3], 'hex')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** "+14155554821" -> "+1 ••• •••-4821" */
export function maskPhone(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return 'unknown';
  const digits = normalized.slice(1);
  const country = digits.length > 10 ? digits.slice(0, digits.length - 10) : '1';
  return `+${country} ••• •••-${digits.slice(-4)}`;
}

export function hashOtp(userId, code) {
  return crypto.createHmac('sha256', getKeys().hmac).update(`otp:${userId}:${String(code).trim()}`).digest('hex');
}

export function generateOtp(length = 6) {
  let out = '';
  for (let i = 0; i < length; i += 1) out += String(crypto.randomInt(0, 10));
  return out;
}

/** Stable token embedded in provider status-callback URLs. */
export function callbackToken(provider) {
  return crypto.createHmac('sha256', getKeys().token).update(`status:${provider}`).digest('hex').slice(0, 32);
}

export function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(String(a ?? ''), 'utf8');
  const bufB = Buffer.from(String(b ?? ''), 'utf8');
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function randomCode(length = 7) {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < length; i += 1) out += alphabet[crypto.randomInt(0, alphabet.length)];
  return out;
}

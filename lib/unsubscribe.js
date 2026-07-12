// Email unsubscribe: signed per-recipient links + a Blob-backed suppression
// list (the filesystem store doesn't persist on Vercel, Blob does).
//
// Token = HMAC-SHA256(email, UNSUBSCRIBE_SECRET) so nobody can unsubscribe
// someone else by guessing their email. Set UNSUBSCRIBE_SECRET in .env.local
// AND in Vercel env vars (the cron builds links there).

const crypto = require('crypto');
const { put, list, get } = require('@vercel/blob');

const SITE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.kahfcapital.com';
const BLOB_KEY = 'subscribers/unsubscribes.json';

function getSecret() {
  return process.env.UNSUBSCRIBE_SECRET || null;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function unsubscribeToken(email) {
  const secret = getSecret();
  if (!secret) return null;
  return crypto.createHmac('sha256', secret).update(normalizeEmail(email)).digest('hex').slice(0, 32);
}

function verifyUnsubscribeToken(email, token) {
  const expected = unsubscribeToken(email);
  if (!expected || !token || token.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(token)));
}

// Per-recipient link for email footers. Null when the secret isn't configured
// (callers fail soft and omit the link rather than break the send).
function buildUnsubscribeUrl(email) {
  const token = unsubscribeToken(email);
  if (!token) return null;
  return `${SITE_URL}/api/unsubscribe?email=${encodeURIComponent(normalizeEmail(email))}&token=${token}`;
}

// --- Blob-backed suppression list ------------------------------------------

async function loadUnsubscribes() {
  try {
    const { blobs } = await list({ prefix: BLOB_KEY });
    const match = blobs.find((b) => b.pathname === BLOB_KEY);
    if (!match) return [];
    const result = await get(match.url, { access: 'private' });
    if (!result || result.statusCode !== 200) return [];
    const text = await new Response(result.stream).text();
    const parsed = JSON.parse(text);
    return Array.isArray(parsed.emails) ? parsed.emails : [];
  } catch {
    return [];
  }
}

// Set of lowercased emails that must not receive marketing/digest email.
async function getUnsubscribedSet() {
  return new Set(await loadUnsubscribes());
}

async function addUnsubscribedEmail(email) {
  const normalized = normalizeEmail(email);
  const emails = await loadUnsubscribes();
  if (emails.includes(normalized)) return { added: false, total: emails.length };
  emails.push(normalized);
  await put(BLOB_KEY, JSON.stringify({ updated_at: new Date().toISOString(), emails }, null, 2), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true
  });
  return { added: true, total: emails.length };
}

module.exports = {
  normalizeEmail,
  unsubscribeToken,
  verifyUnsubscribeToken,
  buildUnsubscribeUrl,
  getUnsubscribedSet,
  addUnsubscribedEmail
};

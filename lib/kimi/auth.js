// Auth for Kimi API routes.
//
//   requireUser   Firebase ID token (Authorization: Bearer <token>)
//   requireAdmin  Firebase ID token whose email is in ADMIN_EMAILS, or
//                 Authorization: Bearer <ADMIN_SECRET>
//   requireCron   Authorization: Bearer <CRON_SECRET | KIMI_CRON_SECRET | ADMIN_SECRET>
//
// Under `next dev` only (never in production builds), an `x-kimi-dev-user`
// header or `x-kimi-dev-admin: 1` stands in for a token so the UI works
// without Firebase Admin credentials locally. Set KIMI_DEV_AUTH=false to
// disable that.

import { verifyIdToken, isFirebaseAdminConfigured } from '../firebase-admin.js';
import { timingSafeEqualStr } from './crypto.js';

export class HttpError extends Error {
  constructor(status, message, code = null) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function devAuthAllowed() {
  return process.env.NODE_ENV !== 'production' && process.env.KIMI_DEV_AUTH !== 'false';
}

function bearer(req) {
  const header = String(req.headers?.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function adminEmails() {
  return String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export async function requireUser(req) {
  const token = bearer(req);
  if (token && isFirebaseAdminConfigured()) {
    const verified = await verifyIdToken(token);
    if (verified.success) return { uid: verified.uid, email: verified.email || null, via: 'firebase' };
    if (!devAuthAllowed()) throw new HttpError(401, 'Your session expired. Please sign in again.');
  }
  if (devAuthAllowed()) {
    const devUser = String(req.headers?.['x-kimi-dev-user'] || '');
    if (/^[A-Za-z0-9_-]{3,128}$/.test(devUser)) return { uid: devUser, email: req.headers?.['x-kimi-dev-email'] || null, via: 'dev' };
  }
  throw new HttpError(401, 'Sign in required');
}

export async function requireAdmin(req) {
  const secret = process.env.ADMIN_SECRET;
  if (secret && timingSafeEqualStr(String(req.headers?.authorization || ''), `Bearer ${secret}`)) {
    return { uid: 'admin_secret', email: 'admin-secret', via: 'secret' };
  }
  const token = bearer(req);
  if (token && isFirebaseAdminConfigured()) {
    const verified = await verifyIdToken(token);
    if (verified.success) {
      const admins = adminEmails();
      if (!admins.length) throw new HttpError(503, 'No admins configured. Set ADMIN_EMAILS.');
      const email = String(verified.email || '').toLowerCase();
      if (email && admins.includes(email)) return { uid: verified.uid, email, via: 'firebase' };
      throw new HttpError(403, 'Not authorized');
    }
  }
  if (devAuthAllowed() && req.headers?.['x-kimi-dev-admin'] === '1') return { uid: 'dev_admin', email: 'dev-admin@localhost', via: 'dev' };
  throw new HttpError(401, 'Admin sign-in required');
}

export function requireCron(req) {
  const header = String(req.headers?.authorization || '');
  const secrets = [process.env.CRON_SECRET, process.env.KIMI_CRON_SECRET, process.env.ADMIN_SECRET].filter(Boolean);
  if (secrets.some((s) => timingSafeEqualStr(header, `Bearer ${s}`))) return true;
  if (devAuthAllowed()) return true;
  throw new HttpError(401, 'Unauthorized');
}

export function clientIp(req) {
  const xff = req.headers?.['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) return xff.split(',')[0].trim();
  return req.headers?.['x-real-ip'] || req.socket?.remoteAddress || null;
}

export function sendError(res, err) {
  const status =
    err.status ||
    err.statusCode ||
    (err.code === 'FORBIDDEN' ? 403 : err.code === 'NOT_FOUND' ? 404 : err.userFacing ? 400 : 500);
  if (status >= 500) console.error('[kimi/api]', err);
  const message = status >= 500 && process.env.NODE_ENV === 'production' ? 'Something went wrong. Try again shortly.' : err.message;
  return res.status(status).json({ error: message, code: err.code || null });
}

export function allowMethods(req, res, methods) {
  if (methods.includes(req.method)) return true;
  res.setHeader('Allow', methods.join(', '));
  res.status(405).json({ error: 'Method not allowed' });
  return false;
}

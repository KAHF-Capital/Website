import { useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';

const DEV = process.env.NODE_ENV !== 'production';

function devUserId(user) {
  if (!DEV || typeof window === 'undefined') return null;
  if (user?.uid) return user.uid;
  let id = window.localStorage.getItem('kimi_dev_user');
  if (!id) {
    id = 'dev_user';
    window.localStorage.setItem('kimi_dev_user', id);
  }
  return id;
}

/**
 * Fetch helper for Kimi API routes. Sends the Firebase ID token; outside
 * production it also sends dev identity headers so the UI works without
 * Firebase Admin credentials (the server ignores them in production).
 */
export function useKimiApi({ admin = false } = {}) {
  const { user, loading } = useAuth();

  const api = useCallback(
    async (path, { method = 'GET', body, raw = false } = {}) => {
      const headers = {};
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (user?.getIdToken) {
        try {
          headers.Authorization = `Bearer ${await user.getIdToken()}`;
        } catch {
          // Token refresh failed; the server will answer 401.
        }
      }
      if (DEV) {
        if (admin) headers['x-kimi-dev-admin'] = '1';
        const dev = devUserId(user);
        if (dev) headers['x-kimi-dev-user'] = dev;
        if (user?.email) headers['x-kimi-dev-email'] = user.email;
      }
      const res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      if (raw) return res;
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status, code: data.code });
      return data;
    },
    [user, admin]
  );

  return { api, user, ready: !loading, signedIn: Boolean(user) || DEV, devBypass: DEV && !user };
}

export const fmt = {
  usd(v, digits = 0) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
    const abs = Math.abs(v);
    if (abs >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `$${Math.round(v / 1e6)}M`;
    return `$${v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
  },
  pct(v, digits = 1, signed = false) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
    return `${signed && v > 0 ? '+' : ''}${v.toFixed(digits)}%`;
  },
  num(v, digits = 0) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
    return v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  },
  ms(v) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
    if (v >= 60000) return `${(v / 60000).toFixed(1)}m`;
    if (v >= 1000) return `${(v / 1000).toFixed(1)}s`;
    return `${Math.round(v)}ms`;
  },
  date(iso) {
    if (!iso) return '—';
    const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: /^\d{4}-\d{2}-\d{2}$/.test(iso) ? 'UTC' : undefined });
  },
  dateTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
};

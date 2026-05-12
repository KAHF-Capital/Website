// PostHog wrapper. No-ops gracefully when env keys are missing.
// Usage:
//   import { initAnalytics, track, identify } from '../../lib/analytics';

let posthog = null;
let initialized = false;
let initPromise = null;

const hasKey = () =>
  typeof window !== 'undefined' && !!process.env.NEXT_PUBLIC_POSTHOG_KEY;

export async function initAnalytics() {
  if (initialized || typeof window === 'undefined') return posthog;
  if (!hasKey()) {
    initialized = true;
    return null;
  }
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const mod = await import('posthog-js');
      const ph = mod.default || mod;
      ph.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
        person_profiles: 'identified_only',
        capture_pageview: true,
        capture_pageleave: true,
        autocapture: true,
        loaded: () => {}
      });
      posthog = ph;
      initialized = true;
      return ph;
    } catch (err) {
      // posthog-js not installed; silent no-op so the site keeps working.
      console.warn('[analytics] posthog-js not available — running in no-op mode');
      initialized = true;
      return null;
    }
  })();

  return initPromise;
}

export function track(event, properties = {}) {
  if (typeof window === 'undefined') return;
  if (!posthog) return;
  try {
    posthog.capture(event, properties);
  } catch {}
}

export function identify(distinctId, properties = {}) {
  if (typeof window === 'undefined') return;
  if (!posthog) return;
  try {
    posthog.identify(distinctId, properties);
  } catch {}
}

export function reset() {
  if (!posthog) return;
  try { posthog.reset(); } catch {}
}

// Capture and persist a referral code from the URL (?ref=XYZ).
export function captureReferral() {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref') || params.get('referral');
    if (ref) {
      const expires = new Date();
      expires.setTime(expires.getTime() + 90 * 24 * 60 * 60 * 1000); // 90 days
      document.cookie = `kahf_ref=${encodeURIComponent(ref)};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
      return ref;
    }
    return readReferralCookie();
  } catch {
    return null;
  }
}

export function readReferralCookie() {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)kahf_ref=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

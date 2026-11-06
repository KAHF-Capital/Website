// Runtime helpers shared across Kimi: background work after a response is
// sent, ids, and timezone-aware time math.

import crypto from 'crypto';

const pending = new Set();

/**
 * Keep work running after the HTTP response. On Vercel this hands the promise
 * to the platform's request context (the mechanism behind @vercel/functions'
 * waitUntil); elsewhere the promise simply runs in-process.
 */
export function waitUntil(promise) {
  const tracked = Promise.resolve(promise)
    .catch((err) => console.error('[kimi] background task failed:', err?.message || err))
    .finally(() => pending.delete(tracked));
  pending.add(tracked);
  try {
    const ctx = globalThis[Symbol.for('@vercel/request-context')]?.get?.();
    if (ctx?.waitUntil) ctx.waitUntil(tracked);
  } catch {
    // Not on Vercel.
  }
  return tracked;
}

/** Await all background work started via waitUntil (tests and scripts). */
export async function flushBackgroundTasks() {
  while (pending.size > 0) {
    await Promise.allSettled([...pending]);
  }
}

/** Current time. The seed script and tests can install a simulated clock. */
export function clockNow() {
  const fn = globalThis.__kimiClock;
  return fn ? new Date(fn()) : new Date();
}

export function setClock(fn) {
  globalThis.__kimiClock = typeof fn === 'function' ? fn : null;
}

export function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(5).toString('hex')}`;
}

export function isProduction() {
  return process.env.NODE_ENV === 'production';
}

// Intl.DateTimeFormat construction is expensive; reuse one per timezone/options.
const formatterCache = new Map();

function formatter(timeZone, options) {
  const key = `${timeZone}|${JSON.stringify(options)}`;
  let f = formatterCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone, ...options });
    formatterCache.set(key, f);
  }
  return f;
}

const validZones = new Map();

export function isValidTimeZone(tz) {
  if (!tz || typeof tz !== 'string') return false;
  if (!validZones.has(tz)) {
    try {
      formatter(tz, {});
      validZones.set(tz, true);
    } catch {
      validZones.set(tz, false);
    }
  }
  return validZones.get(tz);
}

const PARTS_OPTIONS = { hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit' };
const OFFSET_OPTIONS = { hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' };

/** Local calendar parts of `date` in `timeZone` (DST-aware via Intl). */
export function localParts(date, timeZone) {
  const tz = isValidTimeZone(timeZone) ? timeZone : 'America/New_York';
  const parts = formatter(tz, PARTS_OPTIONS).formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const hour = Number(map.hour) % 24;
  const minute = Number(map.minute);
  return {
    timeZone: tz,
    date: `${map.year}-${map.month}-${map.day}`,
    weekday: map.weekday,
    hour,
    minute,
    minutesOfDay: hour * 60 + minute
  };
}

export function parseHhMm(value) {
  const m = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Offset (ms) between `timeZone` wall-clock and UTC at `date`. */
function tzOffsetMs(date, timeZone) {
  const parts = formatter(timeZone, OFFSET_OPTIONS).formatToParts(date);
  const m = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(Number(m.year), Number(m.month) - 1, Number(m.day), Number(m.hour) % 24, Number(m.minute), Number(m.second));
  return asUtc - date.getTime();
}

/** UTC instant of local midnight starting `localDate` (YYYY-MM-DD) in `timeZone`. */
export function startOfLocalDay(localDate, timeZone) {
  const tz = isValidTimeZone(timeZone) ? timeZone : 'America/New_York';
  const [y, mo, d] = localDate.split('-').map(Number);
  const guess = new Date(Date.UTC(y, mo - 1, d, 0, 0, 0));
  let ts = guess.getTime() - tzOffsetMs(guess, tz);
  // Re-check once in case the offset changed between the guess and the result (DST).
  ts = guess.getTime() - tzOffsetMs(new Date(ts), tz);
  return new Date(ts);
}

export function formatInTimeZone(date, timeZone, options) {
  const tz = isValidTimeZone(timeZone) ? timeZone : 'America/New_York';
  return formatter(tz, options).format(date);
}

export function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function utcDay(date = clockNow()) {
  return new Date(date).toISOString().slice(0, 10);
}

/** Day key used for usage caps ("today" in ET, the market's clock). */
export function usageDay(date = clockNow()) {
  return localParts(date, 'America/New_York').date;
}

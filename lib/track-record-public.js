// Public track record for /wins and KAHF AI. One cache so the page and the
// chat mark the same reads and do not each hit the options API.

import { markReads, READS_DISCLAIMER, structureLabel } from './reads-live.js';
import { isExcluded, isPublishedOnSignalSession } from './read-filters.js';
import { getReadsJson } from './blob-data';
import bundled from '../track-record-reads.json';

const CACHE = { data: null, ts: 0 };
const TTL = 15 * 60 * 1000;

function holdingDays(from, to) {
  if (!from || !to) return null;
  const a = new Date(`${from}T12:00:00Z`).getTime();
  const b = new Date(`${to}T12:00:00Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.round((b - a) / 86400000));
}

export function toTrackRecordRow(read, today) {
  const end = read.status === 'closed'
    ? read.exitDate
    : read.status === 'open'
      ? today
      : read.expiration;
  const days = holdingDays(read.date, end);
  let holdingPeriod = days == null ? null : `${days} days`;
  if (days != null && read.status === 'open') holdingPeriod = `${days} days, still open`;
  else if (days != null && read.status === 'closed') holdingPeriod = `${days} days, ${read.exitReason} on ${read.exitDate}`;
  else if (days != null) holdingPeriod = `${days} days, held to expiry ${read.expiration}`;

  return {
    ticker: read.ticker,
    signalDate: read.date,
    structure: read.structureLabel || structureLabel(read.structure),
    holdingDays: days,
    holdingPeriod,
    status: read.status,
    returnPct: read.returnPct ?? null
  };
}

export async function getPublicTrackRecord() {
  if (CACHE.data && Date.now() - CACHE.ts < TTL) return CACHE.data;

  const fromBlob = await getReadsJson('track-record-reads.json').catch(() => null);
  const file = fromBlob && Array.isArray(fromBlob.reads) ? fromBlob : bundled;
  const reads = (Array.isArray(file.reads) ? file.reads : []).filter(
    (r) => !isExcluded(r.ticker) && isPublishedOnSignalSession(r.date, r.found_at)
  );
  const { marked, summary } = await markReads(reads);
  const today = new Date().toISOString().slice(0, 10);
  const data = {
    generatedAt: new Date().toISOString(),
    disclaimer: READS_DISCLAIMER,
    summary,
    marked,
    rows: marked.map((r) => toTrackRecordRow(r, today))
  };
  CACHE.data = data;
  CACHE.ts = Date.now();
  return data;
}

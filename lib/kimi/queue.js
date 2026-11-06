// Durable job queue for inbound webhooks.
//
// Each provider message becomes one kimi_jobs document keyed on the provider
// message id (atomic create, so provider retries are dropped). The webhook
// returns 200 immediately and processes the job in the background; the tick
// worker drains anything left queued or stuck. When REDIS_URL is set and the
// optional `bullmq` package is installed, jobs are also pushed to BullMQ and a
// separate worker (scripts/kimi-worker.js) processes them.

import { getDb } from './db.js';
import { decryptPhone, encryptPhone } from './crypto.js';
import { COL, emitEvent, inboundMessageId } from './store.js';
import { getMessagingProvider } from './messaging/index.js';
import { processInbound } from './inbound.js';
import { clockNow } from './runtime.js';

const LEASE_MS = 2 * 60 * 1000;
const MAX_ATTEMPTS = 3;
export const BULLMQ_QUEUE_NAME = 'kimi-inbound';

let bullQueuePromise = null;

async function getBullQueue() {
  if (!process.env.REDIS_URL) return null;
  if (!bullQueuePromise) {
    bullQueuePromise = import(/* webpackIgnore: true */ 'bullmq')
      .then(({ Queue }) => new Queue(BULLMQ_QUEUE_NAME, { connection: { url: process.env.REDIS_URL } }))
      .catch((err) => {
        console.warn(`[kimi/queue] REDIS_URL is set but bullmq is unavailable (${err.message}); using the store queue only.`);
        return null;
      });
  }
  return bullQueuePromise;
}

export function jobIdFor(providerName, providerMessageId) {
  return `job_${inboundMessageId(providerName, providerMessageId)}`;
}

/** Persist an inbound message for processing. Returns { duplicate, jobId, external }. */
export async function enqueueInbound(providerName, inbound) {
  const jobId = jobIdFor(providerName, inbound.providerMessageId);
  const now = clockNow().toISOString();
  const { created } = await getDb().create(COL.jobs, jobId, {
    type: 'inbound',
    provider: providerName,
    payload: {
      providerMessageId: inbound.providerMessageId,
      from_encrypted: encryptPhone(inbound.from),
      text: inbound.text,
      media: inbound.media || [],
      receivedAt: inbound.receivedAt || now,
      channel: inbound.channel || null,
      isOutboundEcho: Boolean(inbound.isOutboundEcho)
    },
    status: 'queued',
    attempts: 0,
    lease_until: null,
    created_at: now,
    updated_at: now
  });
  if (!created) return { duplicate: true, jobId, external: false };
  const bull = await getBullQueue();
  if (bull) {
    await bull.add('inbound', { jobId }, { jobId, removeOnComplete: 1000, removeOnFail: 5000 });
    return { duplicate: false, jobId, external: true };
  }
  return { duplicate: false, jobId, external: false };
}

/** Claim and process one job. Safe to call concurrently: only one claim wins. */
export async function runInboundJob(jobId, { now = clockNow() } = {}) {
  const claim = await getDb().updateIf(
    COL.jobs,
    jobId,
    (job) =>
      job &&
      (job.status === 'queued' || (job.status === 'processing' && new Date(job.lease_until || 0) < now)) &&
      (job.attempts || 0) < MAX_ATTEMPTS,
    (job) => ({
      status: 'processing',
      attempts: (job.attempts || 0) + 1,
      lease_until: new Date(now.getTime() + LEASE_MS).toISOString(),
      updated_at: now.toISOString()
    })
  );
  if (!claim.updated) return { status: 'not_claimed' };
  const job = claim.doc;
  try {
    const adapter = getMessagingProvider(job.provider);
    const result = await processInbound({
      adapter,
      inbound: { ...job.payload, from: decryptPhone(job.payload.from_encrypted) }
    });
    await getDb().update(COL.jobs, jobId, { status: 'done', result_status: result.status, completed_at: clockNow().toISOString(), lease_until: null });
    return result;
  } catch (err) {
    const dead = (job.attempts || 1) >= MAX_ATTEMPTS;
    await getDb().update(COL.jobs, jobId, {
      status: dead ? 'dead' : 'queued',
      last_error: String(err.message || err).slice(0, 500),
      lease_until: null,
      updated_at: clockNow().toISOString()
    });
    await emitEvent('job_failed', { properties: { job_id: jobId, provider: job.provider, attempt: job.attempts, dead, error: String(err.message || err).slice(0, 300) } });
    if (dead) console.error(`[kimi/queue] job ${jobId} failed permanently:`, err);
    throw err;
  }
}

/** Process jobs left queued or with expired leases (cron safety net). */
export async function drainInboundJobs({ limit = 25, now = clockNow(), minAgeMs = 15000 } = {}) {
  const queued = await getDb().query(COL.jobs, { where: [['status', '==', 'queued']] });
  const stuck = await getDb().query(COL.jobs, { where: [['status', '==', 'processing']] });
  const candidates = [...queued.filter((j) => now - new Date(j.updated_at || j.created_at) >= minAgeMs), ...stuck.filter((j) => new Date(j.lease_until || 0) < now)]
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
    .slice(0, limit);
  let processed = 0;
  let failed = 0;
  for (const job of candidates) {
    try {
      const res = await runInboundJob(job.id, { now });
      if (res.status !== 'not_claimed') processed += 1;
    } catch {
      failed += 1;
    }
  }
  return { processed, failed };
}

export async function queueStats() {
  const [queued, processing, dead] = await Promise.all(
    ['queued', 'processing', 'dead'].map((status) => getDb().query(COL.jobs, { where: [['status', '==', status]] }))
  );
  const oldest = queued.reduce((min, j) => (!min || j.created_at < min ? j.created_at : min), null);
  return { queued: queued.length, processing: processing.length, dead: dead.length, oldest_queued_at: oldest };
}

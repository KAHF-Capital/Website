// Automated Scanner - Sends consolidated SMS + email digest to subscribers
// Called by Vercel Cron at 11 AM ET (15:00 UTC) on trading days

import { getActiveSubscribers, recordAlertSent } from '../../lib/subscribers-store';
import { sendDailyDigest } from '../../lib/twilio-service';
import { sendDailyDigestEmail } from '../../lib/email-service';
import { listDataFiles, getDataFile, getReadsJson } from '../../lib/blob-data';
import { getStraddleSuccessRate } from '../../lib/straddle-analysis-service';
import { isExcluded } from '../../lib/read-filters';
import { getUnsubscribedSet } from '../../lib/unsubscribe';
import { normalizeEmail } from '../../lib/subscription-access';

let firebaseAdmin = null;
try {
  firebaseAdmin = require('../../lib/firebase-admin');
} catch (e) {}

/**
 * Digest recipients: Firestore Pro users (durable) merged with the local file
 * store (keeps manually-added CLI subscribers working until migrated).
 * Deduped by email / phone so nobody gets two messages.
 */
async function loadDigestSubscribers() {
  const byKey = new Map();

  const add = (s) => {
    if (!s) return;
    const email = normalizeEmail(s.email) || null;
    const phone = s.phoneNumber || null;
    if (!email && !phone) return;
    const key = email ? `e:${email}` : `p:${phone}`;
    const existing = byKey.get(key);
    if (existing) {
      // Prefer whichever has more contact channels / richer prefs
      byKey.set(key, {
        ...existing,
        ...s,
        email: email || existing.email,
        phoneNumber: phone || existing.phoneNumber,
        preferences: { ...(existing.preferences || {}), ...(s.preferences || {}) },
        id: existing.id || s.id || s.uid || s.stripeCustomerId
      });
    } else {
      byKey.set(key, {
        id: s.id || s.uid || s.stripeCustomerId || key,
        email,
        phoneNumber: phone,
        preferences: s.preferences || {},
        stripeCustomerId: s.stripeCustomerId || null
      });
    }
  };

  // 1) Durable: Firestore active + trialing
  if (firebaseAdmin?.isFirebaseAdminConfigured?.()) {
    try {
      const result = await firebaseAdmin.getActiveSubscribersAdmin();
      if (result.success) {
        console.log(`Firestore digest recipients: ${result.subscribers.length}`);
        result.subscribers.forEach(add);
      }
    } catch (err) {
      console.error('Firestore digest load failed (falling back to file store):', err.message);
    }
  }

  // 2) File store fallback / manual CLI entries
  try {
    getActiveSubscribers().forEach(add);
  } catch (err) {
    console.error('File store digest load failed:', err.message);
  }

  return [...byKey.values()];
}

const CRON_SECRET = process.env.CRON_SECRET;
const VOLUME_RATIO_THRESHOLD = 3.0;
const MIN_TOTAL_VALUE = 250_000_000; // $250M min notional (matches Scanner page)
const MIN_AVG_PRICE = 50;            // $50 min avg price (matches Scanner page)

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  const providedSecret = authHeader?.replace('Bearer ', '');
  const isVercelCron = req.headers['x-vercel-cron'] === 'true';
  const isAuthorized = !CRON_SECRET || providedSecret === CRON_SECRET || isVercelCron;

  if (!isAuthorized) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const emailOnly = req.query.emailOnly === '1' || req.query.emailOnly === 'true';
  const smsOnly = req.query.smsOnly === '1' || req.query.smsOnly === 'true';

  console.log(`Automated scanner triggered at ${new Date().toISOString()} via ${isVercelCron ? 'Vercel Cron' : 'Manual/API'}${emailOnly ? ' [email-only]' : ''}${smsOnly ? ' [sms-only]' : ''}`);

  try {
    const darkPoolData = await getLatestDarkPoolDataWithRatios();

    if (!darkPoolData || darkPoolData.tickers.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No dark pool data available',
        alertsSent: 0
      });
    }

    const hotTickers = darkPoolData.tickers.filter(t => {
      if (t.volume_ratio === 'N/A') return false;
      return parseFloat(t.volume_ratio) >= VOLUME_RATIO_THRESHOLD;
    });

    // If nothing hit 3x+, fall back to top 10 tickers by volume
    let isQuietDay = false;
    let tickersToSend;

    if (hotTickers.length === 0) {
      isQuietDay = true;
      tickersToSend = [...darkPoolData.tickers]
        .filter(t => t.volume_ratio !== 'N/A')
        .sort((a, b) => parseFloat(b.volume_ratio) - parseFloat(a.volume_ratio))
        .slice(0, 10);

      if (tickersToSend.length === 0) {
        return res.status(200).json({
          success: true,
          message: 'No tickers with volume data available',
          date: darkPoolData.date,
          alertsSent: 0
        });
      }

      console.log(`Quiet day — no 3x+ tickers, sending top ${tickersToSend.length} by volume`);
    } else {
      tickersToSend = hotTickers;
    }

    // Enrich each ticker with straddle success rate (~30-day expiry)
    console.log(`Running straddle analysis on ${tickersToSend.length} tickers...`);
    const BATCH_SIZE = 5;
    for (let i = 0; i < tickersToSend.length; i += BATCH_SIZE) {
      const batch = tickersToSend.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(
        batch.map(async (t) => {
          try {
            const result = await getStraddleSuccessRate(t.ticker);
            t.straddleRate = result?.successRate ?? null;
            t.straddleDTE = result?.dte ?? null;
          } catch {
            t.straddleRate = null;
            t.straddleDTE = null;
          }
        })
      );
      if (i + BATCH_SIZE < tickersToSend.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    }
    const withRate = tickersToSend.filter(t => t.straddleRate !== null).length;
    console.log(`Straddle analysis complete: ${withRate}/${tickersToSend.length} tickers have success rates`);

    // Trade-grade reads published by the local pipeline in the last 24h
    // (found_at stamped by scripts/refresh-track-record.js). When present they
    // lead the email/SMS; the scanner table becomes supporting context.
    const newReads = await getNewReadsSince(Date.now() - 24 * 60 * 60 * 1000);
    if (newReads.length > 0) {
      console.log(`Leading digest with ${newReads.length} new read(s): ${newReads.map(r => r.ticker).join(', ')}`);
    }

    // Honor the unsubscribe suppression list (Blob-backed, written by
    // /api/unsubscribe). Email is suppressed; SMS opt-out is handled by
    // Twilio STOP replies.
    const unsubscribed = await getUnsubscribedSet();
    const subscribers = (await loadDigestSubscribers()).map(s => (
      s.email && unsubscribed.has(s.email) ? { ...s, email: null } : s
    )).filter(s => s.email || s.phoneNumber);
    if (unsubscribed.size > 0) {
      console.log(`Suppression list active: ${unsubscribed.size} unsubscribed email(s)`);
    }

    if (subscribers.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No active subscribers',
        hotTickers: tickersToSend.length,
        alertsSent: 0
      });
    }

    console.log(`${tickersToSend.length} tickers (${isQuietDay ? 'top by volume' : VOLUME_RATIO_THRESHOLD + 'x+'}) → sending to ${subscribers.length} subscribers`);

    const results = [];

    for (const subscriber of subscribers) {
      const hasPhone = !!subscriber.phoneNumber;
      const hasEmail = !!subscriber.email;
      if (!hasPhone && !hasEmail) continue;

      let relevant;
      if (isQuietDay) {
        relevant = tickersToSend;
      } else {
        const minRatio = Math.max(subscriber.preferences?.minVolumeRatio || VOLUME_RATIO_THRESHOLD, VOLUME_RATIO_THRESHOLD);
        relevant = tickersToSend.filter(t => parseFloat(t.volume_ratio) >= minRatio);

        const watchlist = subscriber.preferences?.watchlist || [];
        if (watchlist.length > 0) {
          const watched = relevant.filter(t => watchlist.includes(t.ticker));
          const others = relevant.filter(t => !watchlist.includes(t.ticker));
          relevant = [...watched, ...others];
        }

        if (relevant.length === 0) continue;
      }

      const subResult = { subscriberId: subscriber.id, tickerCount: relevant.length, sms: null, email: null };

      // Send SMS (will fail gracefully if toll-free not verified yet)
      if (hasPhone && !emailOnly) {
        try {
          subResult.sms = await sendDailyDigest(subscriber.phoneNumber, relevant, darkPoolData.date, isQuietDay, newReads);
        } catch (error) {
          subResult.sms = { success: false, error: error.message };
        }
      }

      // Send email
      if (hasEmail && !smsOnly) {
        try {
          subResult.email = await sendDailyDigestEmail(subscriber.email, relevant, darkPoolData.date, isQuietDay, newReads);
        } catch (error) {
          subResult.email = { success: false, error: error.message };
        }
      }

      const anySuccess = subResult.sms?.success || subResult.email?.success;
      if (anySuccess) recordAlertSent(subscriber.stripeCustomerId || subscriber.id);
      results.push(subResult);

      await new Promise(resolve => setTimeout(resolve, 250));
    }

    const sent = results.filter(r => r.sms?.success || r.email?.success).length;
    const failed = results.filter(r => !r.sms?.success && !r.email?.success).length;

    return res.status(200).json({
      success: true,
      date: darkPoolData.date,
      hotTickers: hotTickers.length,
      newReads: newReads.map(r => r.ticker),
      subscribersNotified: sent,
      alertsFailed: failed,
      results
    });
  } catch (error) {
    console.error('Automated scanner error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

// Reads from the published track record whose found_at stamp is newer than
// `sinceMs`. Fails soft — a Blob hiccup shouldn't stop the daily digest.
//
// Hard rule: alerts are only for fresh signals. Even if a stale read carries a
// recent found_at (e.g. a methodology change backfilled history), the digest
// never headlines a signal whose trading date is older than a few days.
const MAX_SIGNAL_AGE_DAYS = 5;
async function getNewReadsSince(sinceMs) {
  try {
    const file = await getReadsJson('track-record-reads.json');
    if (!file || !Array.isArray(file.reads)) return [];
    const dateCutoff = new Date(Date.now() - MAX_SIGNAL_AGE_DAYS * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10);
    const fresh = file.reads
      .filter(r => !isExcluded(r.ticker))
      .filter(r => r.found_at && new Date(r.found_at).getTime() >= sinceMs);
    const stale = fresh.filter(r => r.date < dateCutoff);
    if (stale.length > 0) {
      console.warn(`Suppressing ${stale.length} stale read(s) from digest (signal date too old): ${stale.map(r => `${r.ticker} ${r.date}`).join(', ')}`);
    }
    return fresh
      .filter(r => r.date >= dateCutoff)
      .sort((a, b) => (b.asof_hit_rate || 0) - (a.asof_hit_rate || 0));
  } catch (err) {
    console.error('Could not load new reads for digest (non-fatal):', err.message);
    return [];
  }
}

async function getLatestDarkPoolDataWithRatios() {
  const files = await listDataFiles();
  if (files.length === 0) return null;

  const latestFile = files[0];
  const latestData = await getDataFile(latestFile.url);
  if (!latestData || !latestData.tickers) return null;

  const filenameDate = latestFile.filename.replace('.json', '');
  const currentDate = new Date(filenameDate);
  const sevenDaysAgo = new Date(currentDate);
  sevenDaysAgo.setDate(currentDate.getDate() - 6);

  const recentFiles = files
    .filter(f => {
      const d = new Date(f.filename.replace('.json', ''));
      return d >= sevenDaysAgo && d <= currentDate;
    })
    .slice(0, 7);

  const tickerTotals = {};
  const tickerCounts = {};

  for (const file of recentFiles) {
    try {
      const data = await getDataFile(file.url);
      if (!data?.tickers) continue;
      for (const t of data.tickers) {
        tickerTotals[t.ticker] = (tickerTotals[t.ticker] || 0) + t.total_volume;
        tickerCounts[t.ticker] = (tickerCounts[t.ticker] || 0) + 1;
      }
    } catch (e) {
      console.error(`Error reading ${file.filename}:`, e.message);
    }
  }

  const tickerAverages = {};
  for (const ticker of Object.keys(tickerTotals)) {
    tickerAverages[ticker] = Math.round(tickerTotals[ticker] / tickerCounts[ticker]);
  }

  const tickers = latestData.tickers
    .filter(t => t.total_value >= MIN_TOTAL_VALUE && t.avg_price >= MIN_AVG_PRICE)
    .map(t => ({
      ...t,
      avg_7day_volume: tickerAverages[t.ticker] || 0,
      volume_ratio: tickerAverages[t.ticker] > 0
        ? (t.total_volume / tickerAverages[t.ticker]).toFixed(2)
        : 'N/A'
    }));

  return { date: filenameDate, tickers };
}

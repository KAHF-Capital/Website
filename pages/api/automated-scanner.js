// Automated Scanner - Sends SMS alerts to VolAlert Pro subscribers
// Called by Vercel Cron at 4 PM EST on trading days

import { getActiveSubscribers, recordAlertSent } from '../../lib/subscribers-store';
import { sendDarkPoolAlert } from '../../lib/twilio-service';
import { analyzeAllTickers, formatSMSMessage, generateDailySummary, SEVERITY_LEVELS } from '../../lib/signal-detector';
import { listDataFiles, getDataFile } from '../../lib/blob-data';

const CRON_SECRET = process.env.CRON_SECRET;

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
    console.warn('Unauthorized automated scanner request');
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  console.log(`Automated scanner triggered via ${req.method} at ${new Date().toISOString()}`);
  console.log(`Source: ${isVercelCron ? 'Vercel Cron' : 'Manual/API'}`);
  

  try {
    const darkPoolData = await getLatestDarkPoolData();
    
    if (!darkPoolData || !darkPoolData.tickers || darkPoolData.tickers.length === 0) {
      return res.status(200).json({ 
        success: true, 
        message: 'No dark pool data available',
        alertsSent: 0 
      });
    }

    const alertThreshold = 1.5;
    const highActivityTickers = darkPoolData.tickers.filter(ticker => {
      if (ticker.volume_ratio === 'N/A') return false;
      return parseFloat(ticker.volume_ratio) >= alertThreshold;
    });

    if (highActivityTickers.length === 0) {
      return res.status(200).json({ 
        success: true, 
        message: 'No high-activity tickers found',
        alertsSent: 0 
      });
    }

    const subscribers = getActiveSubscribers();
    
    if (subscribers.length === 0) {
      return res.status(200).json({ 
        success: true, 
        message: 'No active subscribers',
        alertsSent: 0 
      });
    }

    console.log(`Found ${highActivityTickers.length} high-activity tickers`);
    console.log(`Sending alerts to ${subscribers.length} subscribers`);

    const results = [];
    
    for (const subscriber of subscribers) {
      if (!subscriber.phoneNumber) {
        console.warn(`Subscriber ${subscriber.id} has no phone number`);
        continue;
      }

      const minRatio = subscriber.preferences?.minVolumeRatio || 1.5;
      const maxAlerts = subscriber.preferences?.maxAlertsPerDay || 5;
      const watchlist = subscriber.preferences?.watchlist || [];

      let relevantTickers = highActivityTickers.filter(ticker => {
        const ratio = parseFloat(ticker.volume_ratio);
        return ratio >= minRatio;
      });

      if (watchlist.length > 0) {
        const watchlistTickers = relevantTickers.filter(t => 
          watchlist.includes(t.ticker)
        );
        const otherTickers = relevantTickers.filter(t => 
          !watchlist.includes(t.ticker)
        );
        relevantTickers = [...watchlistTickers, ...otherTickers];
      }

      relevantTickers = relevantTickers.slice(0, maxAlerts);

      for (const ticker of relevantTickers) {
        try {
          const result = await sendDarkPoolAlert(
            subscriber.phoneNumber,
            ticker.ticker,
            ticker.volume_ratio,
            ticker.total_value
          );

          if (result.success) {
            recordAlertSent(subscriber.stripeCustomerId);
            results.push({
              subscriberId: subscriber.id,
              ticker: ticker.ticker,
              success: true
            });
          } else {
            results.push({
              subscriberId: subscriber.id,
              ticker: ticker.ticker,
              success: false,
              error: result.error
            });
          }

          await new Promise(resolve => setTimeout(resolve, 250));
        } catch (error) {
          console.error(`Failed to send alert to ${subscriber.id}:`, error.message);
          results.push({
            subscriberId: subscriber.id,
            ticker: ticker.ticker,
            success: false,
            error: error.message
          });
        }
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    console.log(`Alerts sent: ${successCount} success, ${failCount} failed`);

    return res.status(200).json({
      success: true,
      date: darkPoolData.date,
      highActivityTickers: highActivityTickers.length,
      subscribersNotified: subscribers.length,
      alertsSent: successCount,
      alertsFailed: failCount,
      results: results
    });
  } catch (error) {
    console.error('Automated scanner error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}

async function getLatestDarkPoolData() {
  try {
    const files = await listDataFiles();

    if (files.length === 0) {
      console.log('No processed data files found');
      return null;
    }

    const latestFile = files[0];
    const data = await getDataFile(latestFile.url);

    if (!data) {
      console.log('Failed to load latest data file');
      return null;
    }

    console.log(`Loaded dark pool data from ${latestFile.filename}`);
    
    return {
      date: latestFile.filename.replace('.json', ''),
      tickers: data.tickers || [],
      total_volume: data.total_volume || 0
    };
  } catch (error) {
    console.error('Error loading dark pool data:', error);
    return null;
  }
}

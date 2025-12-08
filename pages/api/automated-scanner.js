// Automated Scanner - Sends SMS alerts to VolAlert Pro subscribers
// This endpoint is called by Vercel Cron at 4 PM EST on trading days
// Can also be triggered manually via POST with CRON_SECRET

import { getActiveSubscribers, recordAlertSent } from '../../lib/subscribers-store';
import { sendDarkPoolAlert } from '../../lib/twilio-service';
import { analyzeAllTickers, formatSMSMessage, generateDailySummary, SEVERITY_LEVELS } from '../../lib/signal-detector';
import fs from 'fs';
import path from 'path';

// Security: Require a secret key for manual triggers
const CRON_SECRET = process.env.CRON_SECRET;

export default async function handler(req, res) {
  // Allow both GET (Vercel Cron) and POST (manual trigger)
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // For Vercel Cron: verify the CRON_SECRET header
  // Vercel Cron sends: Authorization: Bearer <CRON_SECRET>
  const authHeader = req.headers.authorization;
  const providedSecret = authHeader?.replace('Bearer ', '');
  
  // Check if request is from Vercel Cron (has correct secret) or valid manual trigger
  const isVercelCron = req.headers['x-vercel-cron'] === 'true';
  const isAuthorized = !CRON_SECRET || providedSecret === CRON_SECRET || isVercelCron;
  
  if (!isAuthorized) {
    console.warn('Unauthorized automated scanner request');
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  console.log(`Automated scanner triggered via ${req.method} at ${new Date().toISOString()}`);
  console.log(`Source: ${isVercelCron ? 'Vercel Cron' : 'Manual/API'}`);
  

  try {
    // Get the latest dark pool data
    const darkPoolData = await getLatestDarkPoolData();
    
    if (!darkPoolData || !darkPoolData.tickers || darkPoolData.tickers.length === 0) {
      return res.status(200).json({ 
        success: true, 
        message: 'No dark pool data available',
        alertsSent: 0 
      });
    }

    // Filter for high-activity tickers (volume ratio > threshold)
    const alertThreshold = 1.5; // Minimum volume ratio to trigger alert
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

    // Get all active subscribers
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

    // Send alerts to each subscriber based on their preferences
    const results = [];
    
    for (const subscriber of subscribers) {
      if (!subscriber.phoneNumber) {
        console.warn(`Subscriber ${subscriber.id} has no phone number`);
        continue;
      }

      // Get subscriber preferences
      const minRatio = subscriber.preferences?.minVolumeRatio || 1.5;
      const maxAlerts = subscriber.preferences?.maxAlertsPerDay || 5;
      const watchlist = subscriber.preferences?.watchlist || [];

      // Filter tickers based on subscriber preferences
      let relevantTickers = highActivityTickers.filter(ticker => {
        const ratio = parseFloat(ticker.volume_ratio);
        return ratio >= minRatio;
      });

      // If subscriber has a watchlist, prioritize those tickers
      if (watchlist.length > 0) {
        const watchlistTickers = relevantTickers.filter(t => 
          watchlist.includes(t.ticker)
        );
        const otherTickers = relevantTickers.filter(t => 
          !watchlist.includes(t.ticker)
        );
        relevantTickers = [...watchlistTickers, ...otherTickers];
      }

      // Limit to max alerts per day
      relevantTickers = relevantTickers.slice(0, maxAlerts);

      // Send alerts for each ticker
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

          // Small delay between messages to respect Twilio rate limits
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

// Get the latest dark pool data from processed files
async function getLatestDarkPoolData() {
  try {
    const processedDir = path.join(process.cwd(), 'data', 'processed');
    
    if (!fs.existsSync(processedDir)) {
      console.log('Processed data directory not found');
      return null;
    }

    // Get all JSON files and sort by date (newest first)
    const files = fs.readdirSync(processedDir)
      .filter(f => f.endsWith('.json') && /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort()
      .reverse();

    if (files.length === 0) {
      console.log('No processed data files found');
      return null;
    }

    // Load the most recent file
    const latestFile = files[0];
    const filePath = path.join(processedDir, latestFile);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    console.log(`Loaded dark pool data from ${latestFile}`);
    
    return {
      date: latestFile.replace('.json', ''),
      tickers: data.tickers || [],
      total_volume: data.total_volume || 0
    };
  } catch (error) {
    console.error('Error loading dark pool data:', error);
    return null;
  }
}



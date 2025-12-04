// Subscriber Management API
// Allows subscribers to update their preferences

import { 
  getSubscriberByCustomerId, 
  getSubscriberByPhone,
  updateSubscriberPreferences,
  getActiveSubscribers 
} from '../../lib/subscribers-store';

export default async function handler(req, res) {
  const { method } = req;

  switch (method) {
    case 'GET':
      return handleGet(req, res);
    case 'PUT':
      return handlePut(req, res);
    default:
      res.setHeader('Allow', ['GET', 'PUT']);
      return res.status(405).json({ error: `Method ${method} not allowed` });
  }
}

// Get subscriber info
async function handleGet(req, res) {
  const { customerId, phone, listAll } = req.query;
  
  // Admin endpoint to list all subscribers (protected)
  if (listAll === 'true') {
    const adminSecret = process.env.ADMIN_SECRET;
    const authHeader = req.headers.authorization;
    
    if (!adminSecret || authHeader !== `Bearer ${adminSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const subscribers = getActiveSubscribers();
    return res.status(200).json({ 
      count: subscribers.length,
      subscribers: subscribers.map(s => ({
        id: s.id,
        email: s.email,
        phoneNumber: s.phoneNumber ? `***${s.phoneNumber.slice(-4)}` : null,
        status: s.status,
        alertsSent: s.alertsSent,
        createdAt: s.createdAt
      }))
    });
  }
  
  // Get specific subscriber
  let subscriber = null;
  
  if (customerId) {
    subscriber = getSubscriberByCustomerId(customerId);
  } else if (phone) {
    subscriber = getSubscriberByPhone(phone);
  } else {
    return res.status(400).json({ error: 'Missing customerId or phone parameter' });
  }
  
  if (!subscriber) {
    return res.status(404).json({ error: 'Subscriber not found' });
  }
  
  // Return subscriber info (without sensitive data)
  return res.status(200).json({
    id: subscriber.id,
    email: subscriber.email,
    status: subscriber.status,
    preferences: subscriber.preferences,
    alertsSent: subscriber.alertsSent,
    lastAlertAt: subscriber.lastAlertAt
  });
}

// Update subscriber preferences
async function handlePut(req, res) {
  const { customerId } = req.query;
  const { preferences } = req.body;
  
  if (!customerId) {
    return res.status(400).json({ error: 'Missing customerId parameter' });
  }
  
  if (!preferences) {
    return res.status(400).json({ error: 'Missing preferences in request body' });
  }
  
  // Validate preferences
  const validPreferences = {};
  
  if (typeof preferences.minVolumeRatio === 'number') {
    validPreferences.minVolumeRatio = Math.max(1.0, Math.min(10.0, preferences.minVolumeRatio));
  }
  
  if (Array.isArray(preferences.watchlist)) {
    // Clean and validate watchlist (max 20 tickers)
    validPreferences.watchlist = preferences.watchlist
      .filter(t => typeof t === 'string')
      .map(t => t.toUpperCase().trim())
      .filter(t => /^[A-Z]{1,5}$/.test(t))
      .slice(0, 20);
  }
  
  if (typeof preferences.maxAlertsPerDay === 'number') {
    validPreferences.maxAlertsPerDay = Math.max(1, Math.min(10, preferences.maxAlertsPerDay));
  }
  
  if (typeof preferences.alertTime === 'string') {
    // Validate time format (HH:MM)
    if (/^\d{2}:\d{2}$/.test(preferences.alertTime)) {
      validPreferences.alertTime = preferences.alertTime;
    }
  }
  
  const updated = updateSubscriberPreferences(customerId, validPreferences);
  
  if (!updated) {
    return res.status(404).json({ error: 'Subscriber not found' });
  }
  
  return res.status(200).json({
    success: true,
    preferences: updated.preferences
  });
}



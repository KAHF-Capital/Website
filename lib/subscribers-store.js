// Simple file-based subscriber store for VolAlert Pro
// In production, you'd use a proper database (Supabase, Postgres, etc.)

const fs = require('fs');
const path = require('path');

const SUBSCRIBERS_FILE = path.join(process.cwd(), 'data', 'subscribers.json');

// Initialize subscribers file
function initializeStore() {
  const dataDir = path.dirname(SUBSCRIBERS_FILE);
  
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  if (!fs.existsSync(SUBSCRIBERS_FILE)) {
    fs.writeFileSync(SUBSCRIBERS_FILE, JSON.stringify({ subscribers: [] }, null, 2));
  }
}

// Load all subscribers
function loadSubscribers() {
  try {
    initializeStore();
    const data = fs.readFileSync(SUBSCRIBERS_FILE, 'utf8');
    return JSON.parse(data).subscribers || [];
  } catch (error) {
    console.error('Error loading subscribers:', error.message);
    return [];
  }
}

// Save all subscribers
function saveSubscribers(subscribers) {
  try {
    initializeStore();
    fs.writeFileSync(SUBSCRIBERS_FILE, JSON.stringify({ subscribers }, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving subscribers:', error.message);
    return false;
  }
}

// Add a new subscriber
function addSubscriber(subscriberData) {
  const subscribers = loadSubscribers();
  
  // Check if subscriber already exists
  const existingIndex = subscribers.findIndex(
    s => s.stripeCustomerId === subscriberData.stripeCustomerId ||
         s.phoneNumber === subscriberData.phoneNumber
  );
  
  const subscriber = {
    id: subscriberData.stripeCustomerId || `sub_${Date.now()}`,
    stripeCustomerId: subscriberData.stripeCustomerId,
    stripeSubscriptionId: subscriberData.stripeSubscriptionId,
    email: subscriberData.email,
    phoneNumber: subscriberData.phoneNumber,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    // Alert preferences
    preferences: {
      minVolumeRatio: subscriberData.minVolumeRatio || 1.5,
      watchlist: subscriberData.watchlist || [],
      alertTime: subscriberData.alertTime || '09:00', // When to receive daily alerts
      maxAlertsPerDay: subscriberData.maxAlertsPerDay || 5
    },
    // Tracking
    alertsSent: 0,
    lastAlertAt: null
  };
  
  if (existingIndex >= 0) {
    // Update existing subscriber
    subscribers[existingIndex] = {
      ...subscribers[existingIndex],
      ...subscriber,
      createdAt: subscribers[existingIndex].createdAt,
      alertsSent: subscribers[existingIndex].alertsSent
    };
  } else {
    // Add new subscriber
    subscribers.push(subscriber);
  }
  
  saveSubscribers(subscribers);
  return subscriber;
}

// Update subscriber status
function updateSubscriberStatus(customerId, status) {
  const subscribers = loadSubscribers();
  const index = subscribers.findIndex(s => s.stripeCustomerId === customerId);
  
  if (index >= 0) {
    subscribers[index].status = status;
    subscribers[index].updatedAt = new Date().toISOString();
    saveSubscribers(subscribers);
    return subscribers[index];
  }
  
  return null;
}

// Update subscriber preferences
function updateSubscriberPreferences(customerId, preferences) {
  const subscribers = loadSubscribers();
  const index = subscribers.findIndex(s => s.stripeCustomerId === customerId);
  
  if (index >= 0) {
    subscribers[index].preferences = {
      ...subscribers[index].preferences,
      ...preferences
    };
    subscribers[index].updatedAt = new Date().toISOString();
    saveSubscribers(subscribers);
    return subscribers[index];
  }
  
  return null;
}

// Get all active subscribers
function getActiveSubscribers() {
  const subscribers = loadSubscribers();
  return subscribers.filter(s => s.status === 'active');
}

// Get subscriber by customer ID
function getSubscriberByCustomerId(customerId) {
  const subscribers = loadSubscribers();
  return subscribers.find(s => s.stripeCustomerId === customerId);
}

// Get subscriber by phone number
function getSubscriberByPhone(phoneNumber) {
  const subscribers = loadSubscribers();
  return subscribers.find(s => s.phoneNumber === phoneNumber);
}

// Record that an alert was sent
function recordAlertSent(customerId) {
  const subscribers = loadSubscribers();
  const index = subscribers.findIndex(s => s.stripeCustomerId === customerId);
  
  if (index >= 0) {
    subscribers[index].alertsSent += 1;
    subscribers[index].lastAlertAt = new Date().toISOString();
    saveSubscribers(subscribers);
    return subscribers[index];
  }
  
  return null;
}

// Remove subscriber (cancel)
function removeSubscriber(customerId) {
  const subscribers = loadSubscribers();
  const index = subscribers.findIndex(s => s.stripeCustomerId === customerId);
  
  if (index >= 0) {
    subscribers[index].status = 'cancelled';
    subscribers[index].updatedAt = new Date().toISOString();
    saveSubscribers(subscribers);
    return true;
  }
  
  return false;
}

module.exports = {
  addSubscriber,
  updateSubscriberStatus,
  updateSubscriberPreferences,
  getActiveSubscribers,
  getSubscriberByCustomerId,
  getSubscriberByPhone,
  recordAlertSent,
  removeSubscriber,
  loadSubscribers
};



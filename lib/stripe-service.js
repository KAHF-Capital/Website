// Stripe Service for VolAlert Pro subscriptions
const Stripe = require('stripe');

// Initialize Stripe client
const getStripeClient = () => {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  
  if (!secretKey) {
    throw new Error('Stripe secret key not configured');
  }
  
  return new Stripe(secretKey);
};

// Verify Stripe webhook signature
function verifyWebhookSignature(payload, signature) {
  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  if (!webhookSecret) {
    throw new Error('Stripe webhook secret not configured');
  }
  
  try {
    return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (error) {
    console.error('Webhook signature verification failed:', error.message);
    throw error;
  }
}

// Get customer by ID
async function getCustomer(customerId) {
  try {
    const stripe = getStripeClient();
    return await stripe.customers.retrieve(customerId);
  } catch (error) {
    console.error('Failed to retrieve customer:', error.message);
    return null;
  }
}

// Get subscription by ID
async function getSubscription(subscriptionId) {
  try {
    const stripe = getStripeClient();
    return await stripe.subscriptions.retrieve(subscriptionId);
  } catch (error) {
    console.error('Failed to retrieve subscription:', error.message);
    return null;
  }
}

// Check if subscription is active
async function isSubscriptionActive(subscriptionId) {
  const subscription = await getSubscription(subscriptionId);
  
  if (!subscription) return false;
  
  return ['active', 'trialing'].includes(subscription.status);
}

// Extract customer info from checkout session
async function getCheckoutSessionCustomer(sessionId) {
  try {
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['customer', 'subscription']
    });
    
    return {
      customerId: session.customer?.id,
      customerEmail: session.customer_details?.email || session.customer?.email,
      customerPhone: session.customer_details?.phone,
      subscriptionId: session.subscription?.id,
      subscriptionStatus: session.subscription?.status
    };
  } catch (error) {
    console.error('Failed to retrieve checkout session:', error.message);
    return null;
  }
}

// List all active subscribers
async function listActiveSubscriptions(priceId) {
  try {
    const stripe = getStripeClient();
    
    const subscriptions = await stripe.subscriptions.list({
      status: 'active',
      price: priceId,
      limit: 100,
      expand: ['data.customer']
    });
    
    return subscriptions.data.map(sub => ({
      subscriptionId: sub.id,
      customerId: sub.customer.id,
      customerEmail: sub.customer.email,
      customerPhone: sub.customer.phone,
      status: sub.status,
      currentPeriodEnd: new Date(sub.current_period_end * 1000)
    }));
  } catch (error) {
    console.error('Failed to list subscriptions:', error.message);
    return [];
  }
}

module.exports = {
  getStripeClient,
  verifyWebhookSignature,
  getCustomer,
  getSubscription,
  isSubscriptionActive,
  getCheckoutSessionCustomer,
  listActiveSubscriptions
};


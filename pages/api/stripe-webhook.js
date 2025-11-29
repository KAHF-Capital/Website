// Stripe Webhook Handler for VolAlert Pro subscriptions
// Integrates with both Firebase and local subscriber store
import { verifyWebhookSignature, getCheckoutSessionCustomer } from '../../lib/stripe-service';
import { addSubscriber, updateSubscriberStatus, removeSubscriber } from '../../lib/subscribers-store';
import { sendWelcomeMessage, validatePhoneNumber } from '../../lib/twilio-service';

// Try to import Firebase Admin (optional - will work without it)
let firebaseAdmin = null;
try {
  firebaseAdmin = require('../../lib/firebase-admin');
} catch (e) {
  console.log('Firebase Admin not available, using local subscriber store only');
}

// Disable body parsing - we need the raw body for webhook verification
export const config = {
  api: {
    bodyParser: false,
  },
};

// Get raw body for signature verification
async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

// Update Firebase user subscription status
async function updateFirebaseSubscription(email, stripeCustomerId, subscriptionData) {
  if (!firebaseAdmin) return;
  
  try {
    const firestore = firebaseAdmin.getFirestoreAdmin();
    
    // Find user by email
    const snapshot = await firestore
      .collection('users')
      .where('email', '==', email)
      .limit(1)
      .get();
    
    if (!snapshot.empty) {
      const userDoc = snapshot.docs[0];
      await userDoc.ref.update({
        subscription: {
          status: subscriptionData.status,
          stripeCustomerId: stripeCustomerId,
          stripeSubscriptionId: subscriptionData.subscriptionId || null,
          updatedAt: new Date().toISOString()
        }
      });
      console.log(`Firebase user ${userDoc.id} subscription updated`);
    }
  } catch (error) {
    console.error('Error updating Firebase subscription:', error.message);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const signature = req.headers['stripe-signature'];
  
  if (!signature) {
    return res.status(400).json({ error: 'Missing stripe-signature header' });
  }

  let event;
  
  try {
    const rawBody = await getRawBody(req);
    event = verifyWebhookSignature(rawBody, signature);
  } catch (error) {
    console.error('Webhook signature verification failed:', error.message);
    return res.status(400).json({ error: `Webhook Error: ${error.message}` });
  }

  console.log(`Received Stripe event: ${event.type}`);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        // New subscription started
        const session = event.data.object;
        
        // Get customer details
        const customerInfo = await getCheckoutSessionCustomer(session.id);
        
        if (customerInfo) {
          // Get phone number from session metadata or customer object
          let phoneNumber = session.metadata?.phone_number || 
                           session.customer_details?.phone ||
                           customerInfo.customerPhone;
          
          // Validate and format phone number
          if (phoneNumber) {
            const validation = validatePhoneNumber(phoneNumber);
            if (validation.valid) {
              phoneNumber = validation.formatted;
            } else {
              console.warn('Invalid phone number format:', phoneNumber);
              phoneNumber = null;
            }
          }
          
          // Add subscriber to local store
          const subscriber = addSubscriber({
            stripeCustomerId: customerInfo.customerId,
            stripeSubscriptionId: customerInfo.subscriptionId,
            email: customerInfo.customerEmail,
            phoneNumber: phoneNumber,
            minVolumeRatio: 1.5, // Default preference
          });
          
          console.log('New subscriber added:', subscriber.id);
          
          // Update Firebase user subscription status
          await updateFirebaseSubscription(
            customerInfo.customerEmail,
            customerInfo.customerId,
            {
              status: 'active',
              subscriptionId: customerInfo.subscriptionId
            }
          );
          
          // Send welcome SMS if phone number is available
          if (phoneNumber) {
            await sendWelcomeMessage(phoneNumber);
          }
        }
        break;
      }
      
      case 'customer.subscription.updated': {
        // Subscription status changed
        const subscription = event.data.object;
        const customerId = subscription.customer;
        
        let newStatus = subscription.status;
        
        if (subscription.status === 'active') {
          updateSubscriberStatus(customerId, 'active');
          console.log(`Subscription activated for customer: ${customerId}`);
        } else if (subscription.status === 'past_due') {
          updateSubscriberStatus(customerId, 'past_due');
          console.log(`Subscription past due for customer: ${customerId}`);
        } else if (subscription.status === 'unpaid') {
          updateSubscriberStatus(customerId, 'unpaid');
          console.log(`Subscription unpaid for customer: ${customerId}`);
        }
        
        // Update Firebase as well (find by stripeCustomerId)
        if (firebaseAdmin) {
          try {
            const result = await firebaseAdmin.getUserByStripeCustomerId(customerId);
            if (result.success) {
              await firebaseAdmin.updateSubscriptionAdmin(result.uid, {
                status: newStatus,
                stripeCustomerId: customerId,
                stripeSubscriptionId: subscription.id,
                updatedAt: new Date().toISOString()
              });
            }
          } catch (e) {
            console.error('Error updating Firebase on subscription update:', e.message);
          }
        }
        break;
      }
      
      case 'customer.subscription.deleted': {
        // Subscription cancelled
        const subscription = event.data.object;
        const customerId = subscription.customer;
        
        removeSubscriber(customerId);
        console.log(`Subscription cancelled for customer: ${customerId}`);
        
        // Update Firebase
        if (firebaseAdmin) {
          try {
            const result = await firebaseAdmin.getUserByStripeCustomerId(customerId);
            if (result.success) {
              await firebaseAdmin.updateSubscriptionAdmin(result.uid, {
                status: 'cancelled',
                stripeCustomerId: customerId,
                stripeSubscriptionId: null,
                updatedAt: new Date().toISOString()
              });
            }
          } catch (e) {
            console.error('Error updating Firebase on subscription cancel:', e.message);
          }
        }
        break;
      }
      
      case 'invoice.payment_failed': {
        // Payment failed
        const invoice = event.data.object;
        const customerId = invoice.customer;
        
        updateSubscriberStatus(customerId, 'payment_failed');
        console.log(`Payment failed for customer: ${customerId}`);
        break;
      }
      
      case 'invoice.payment_succeeded': {
        // Payment succeeded (renewal)
        const invoice = event.data.object;
        const customerId = invoice.customer;
        
        updateSubscriberStatus(customerId, 'active');
        console.log(`Payment succeeded for customer: ${customerId}`);
        break;
      }
      
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
    
    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Stripe Webhook Handler for KAHF Pro subscriptions.
// Durable access lives in Firestore. File store is a best-effort local mirror
// for ops/CLI only — digests read Firestore (with file fallback for manual entries).
import { verifyWebhookSignature, getCheckoutSessionCustomer } from '../../lib/stripe-service';
import { addSubscriber, updateSubscriberStatus, removeSubscriber } from '../../lib/subscribers-store';
import { sendWelcomeMessage, validatePhoneNumber } from '../../lib/twilio-service';
import { statusFromStripe } from '../../lib/subscription-access';

let firebaseAdmin = null;
try {
  firebaseAdmin = require('../../lib/firebase-admin');
} catch (e) {
  console.log('Firebase Admin not available, using local subscriber store only');
}

export const config = {
  api: {
    bodyParser: false,
  },
};

async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

function parseCheckoutUid(clientReferenceId) {
  const raw = String(clientReferenceId || '').trim();
  if (!raw) return null;
  // Logged-in checkout passes the Firebase UID (or "uid:XXX")
  if (raw.startsWith('uid:')) return raw.slice(4) || null;
  // Referral codes look like kahf_XXXXXXXX — never treat those as UIDs
  if (raw.startsWith('kahf_')) return null;
  // Firebase UIDs are typically 28 chars alphanumeric
  if (/^[a-zA-Z0-9]{20,128}$/.test(raw)) return raw;
  return null;
}

function normalizePhone(phoneNumber) {
  if (!phoneNumber) return null;
  const validation = validatePhoneNumber(phoneNumber);
  if (validation.valid) return validation.formatted;
  console.warn('Invalid phone number format:', phoneNumber);
  return null;
}

/** Grant or update Pro on Firestore; park as pending if no account yet. */
async function grantFirestoreAccess({
  uid,
  email,
  stripeCustomerId,
  stripeSubscriptionId,
  status,
  phoneNumber
}) {
  if (!firebaseAdmin || !firebaseAdmin.isFirebaseAdminConfigured?.()) {
    console.warn('Firebase Admin not configured — skipping durable Pro grant');
    return { granted: false, pending: false };
  }

  const found = await firebaseAdmin.findUserForCheckout({
    uid,
    email,
    stripeCustomerId
  });

  if (found.success) {
    await firebaseAdmin.applySubscriptionToUser(found.uid, {
      status,
      stripeCustomerId,
      stripeSubscriptionId,
      phoneNumber: phoneNumber || undefined,
      email
    });
    console.log(`Firestore Pro granted to uid=${found.uid} via ${found.matchedBy} (status=${status})`);
    return { granted: true, uid: found.uid, pending: false };
  }

  // Buyer paid before creating an account — hold the sub until they log in
  if (email) {
    await firebaseAdmin.savePendingSubscription({
      email,
      status,
      stripeCustomerId,
      stripeSubscriptionId,
      phoneNumber
    });
    console.log(`No Firebase user for ${email} — saved pending_subscriptions`);
    return { granted: false, pending: true };
  }

  console.warn('Could not grant Firestore access: no uid/email match');
  return { granted: false, pending: false };
}

async function updateFirestoreByCustomerId(customerId, subscriptionPatch) {
  if (!firebaseAdmin || !firebaseAdmin.isFirebaseAdminConfigured?.()) return;
  try {
    const result = await firebaseAdmin.getUserByStripeCustomerId(customerId);
    if (result.success) {
      await firebaseAdmin.updateSubscriptionAdmin(result.uid, {
        ...result.data?.subscription,
        ...subscriptionPatch,
        stripeCustomerId: customerId,
        updatedAt: new Date().toISOString()
      });
    }
  } catch (e) {
    console.error('Error updating Firebase by customer id:', e.message);
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
        const session = event.data.object;
        const customerInfo = await getCheckoutSessionCustomer(session.id);
        if (!customerInfo) break;

        const phoneNumber = normalizePhone(
          session.metadata?.phone_number ||
          session.customer_details?.phone ||
          customerInfo.customerPhone
        );

        // Prefer real Stripe subscription status (trialing during trial, else active)
        const resolvedStatus = statusFromStripe(customerInfo.subscriptionStatus) || 'active';
        const checkoutUid = parseCheckoutUid(session.client_reference_id);

        // Best-effort local mirror (ephemeral on Vercel — Firestore is durable)
        try {
          addSubscriber({
            stripeCustomerId: customerInfo.customerId,
            stripeSubscriptionId: customerInfo.subscriptionId,
            email: customerInfo.customerEmail,
            phoneNumber,
            minVolumeRatio: 3
          });
        } catch (e) {
          console.warn('Local subscriber mirror failed (non-fatal):', e.message);
        }

        await grantFirestoreAccess({
          uid: checkoutUid,
          email: customerInfo.customerEmail,
          stripeCustomerId: customerInfo.customerId,
          stripeSubscriptionId: customerInfo.subscriptionId,
          status: resolvedStatus,
          phoneNumber
        });

        if (phoneNumber) {
          await sendWelcomeMessage(phoneNumber);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        const newStatus = statusFromStripe(subscription.status);

        try {
          if (['active', 'trialing', 'past_due', 'unpaid'].includes(newStatus)) {
            updateSubscriberStatus(customerId, newStatus === 'trialing' ? 'active' : newStatus);
          }
        } catch (e) {
          console.warn('Local status mirror failed:', e.message);
        }

        await updateFirestoreByCustomerId(customerId, {
          status: newStatus,
          stripeSubscriptionId: subscription.id
        });

        // Keep pending docs in sync if the buyer still has no account
        if (firebaseAdmin && subscription.customer) {
          try {
            const { getCustomer } = require('../../lib/stripe-service');
            const customer = await getCustomer(customerId);
            if (customer?.email && firebaseAdmin.savePendingSubscription) {
              const found = await firebaseAdmin.getUserByStripeCustomerId(customerId);
              if (!found.success) {
                await firebaseAdmin.savePendingSubscription({
                  email: customer.email,
                  status: newStatus,
                  stripeCustomerId: customerId,
                  stripeSubscriptionId: subscription.id
                });
              }
            }
          } catch (e) {
            console.warn('Pending sync on subscription.updated failed:', e.message);
          }
        }
        console.log(`Subscription updated for ${customerId} → ${newStatus}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        try {
          removeSubscriber(customerId);
        } catch (e) {
          console.warn('Local remove mirror failed:', e.message);
        }

        await updateFirestoreByCustomerId(customerId, {
          status: 'cancelled',
          stripeSubscriptionId: null
        });
        console.log(`Subscription cancelled for customer: ${customerId}`);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId = invoice.customer;
        try {
          updateSubscriberStatus(customerId, 'payment_failed');
        } catch (e) { /* ignore */ }
        await updateFirestoreByCustomerId(customerId, { status: 'past_due' });
        console.log(`Payment failed for customer: ${customerId}`);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const customerId = invoice.customer;
        try {
          updateSubscriberStatus(customerId, 'active');
        } catch (e) { /* ignore */ }
        await updateFirestoreByCustomerId(customerId, { status: 'active' });
        console.log(`Payment succeeded for customer: ${customerId}`);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

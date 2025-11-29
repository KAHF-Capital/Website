# Firebase & Environment Setup Guide

## Required Environment Variables

Add these to your `.env.local` file:

### Firebase (Authentication & Database)
```bash
# Get from Firebase Console > Project Settings > General
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abcdef

# Firebase Admin SDK (server-side)
# Get from Firebase Console > Project Settings > Service Accounts
# Generate new private key and paste the entire JSON as a single line
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"..."}
```

### Stripe (Payments)
```bash
# Get from Stripe Dashboard > Developers > API keys
STRIPE_SECRET_KEY=sk_live_your_stripe_secret_key
STRIPE_PUBLISHABLE_KEY=pk_live_your_stripe_publishable_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
```

### Twilio (SMS Alerts)
```bash
# Get from Twilio Console
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1234567890
```

### Security
```bash
CRON_SECRET=your_random_cron_secret_here
ADMIN_SECRET=your_random_admin_secret_here
```

---

## Firebase Setup Steps

### 1. Create Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project"
3. Name it (e.g., "kahf-capital")
4. Disable Google Analytics (optional)
5. Click "Create project"

### 2. Enable Authentication
1. Go to **Authentication** > **Sign-in method**
2. Enable **Email/Password**
3. Enable **Google** (optional but recommended)
4. Add your domain to **Authorized domains**

### 3. Create Firestore Database
1. Go to **Firestore Database**
2. Click "Create database"
3. Start in **production mode**
4. Choose a location (e.g., `us-central`)

### 4. Firestore Security Rules
Replace the default rules with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read/write their own document
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Admin-only access for subscribers collection (legacy)
    match /subscribers/{document=**} {
      allow read, write: if false; // Server-side only
    }
  }
}
```

### 5. Get Firebase Config
1. Go to **Project Settings** > **General**
2. Scroll to "Your apps" > Click web icon `</>`
3. Register app (nickname: "web")
4. Copy the `firebaseConfig` values to your `.env.local`

### 6. Generate Service Account Key (for Admin SDK)
1. Go to **Project Settings** > **Service accounts**
2. Click "Generate new private key"
3. Download the JSON file
4. Copy entire contents (minified to one line) to `FIREBASE_SERVICE_ACCOUNT_KEY`

---

## Stripe Webhook Setup

### 1. Create Webhook Endpoint
1. Go to [Stripe Dashboard](https://dashboard.stripe.com/) > **Developers** > **Webhooks**
2. Click "Add endpoint"
3. URL: `https://your-domain.com/api/stripe-webhook`
4. Select events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
   - `invoice.payment_succeeded`
5. Copy the webhook signing secret to `STRIPE_WEBHOOK_SECRET`

### 2. Test with Stripe CLI (Local Development)
```bash
# Install Stripe CLI
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3000/api/stripe-webhook

# Copy the webhook secret from CLI output
```

---

## Twilio Setup

### 1. Create Account
1. Go to [Twilio Console](https://console.twilio.com/)
2. Create a free account
3. Verify your phone number

### 2. Get Credentials
1. Copy **Account SID** and **Auth Token** from dashboard
2. Go to **Phone Numbers** > **Manage** > **Buy a number**
3. Buy a phone number (or use trial number)
4. Copy number to `TWILIO_PHONE_NUMBER` (format: `+1234567890`)

### 3. For Production
- Upgrade from trial to paid account
- Register your business for better deliverability
- Consider setting up a Messaging Service for higher volume

---

## Automated Alerts (Cron Job)

The `/api/automated-scanner` endpoint sends SMS alerts. Call it daily via:

### Option 1: Vercel Cron (Recommended)
Add to `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/automated-scanner",
      "schedule": "0 14 * * 1-5"  // 2 PM UTC, Mon-Fri (market hours)
    }
  ]
}
```

### Option 2: GitHub Actions
Create `.github/workflows/alerts.yml`:
```yaml
name: Send Daily Alerts
on:
  schedule:
    - cron: '0 14 * * 1-5'  # 2 PM UTC, Mon-Fri
jobs:
  send-alerts:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger alerts
        run: |
          curl -X POST https://your-domain.com/api/automated-scanner \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
```

### Option 3: External Cron Service
Use [cron-job.org](https://cron-job.org/) or similar to call the endpoint daily.

---

## Testing Checklist

- [ ] Firebase Authentication works (signup/login)
- [ ] Firestore saves user data on signup
- [ ] Stripe checkout redirects correctly
- [ ] Stripe webhook updates subscription status
- [ ] Twilio sends welcome SMS on subscription
- [ ] Automated scanner sends alerts to subscribers
- [ ] Account page shows subscription status
- [ ] Phone number saves correctly

---

## Troubleshooting

### "Firebase not initialized"
- Check all `NEXT_PUBLIC_FIREBASE_*` variables are set
- Restart dev server after changing env variables

### "Webhook signature verification failed"
- Make sure `STRIPE_WEBHOOK_SECRET` matches your webhook endpoint
- For local testing, use Stripe CLI's webhook secret

### "Twilio authentication error"
- Verify Account SID and Auth Token are correct
- Check if trial account has restrictions

### "Permission denied" on Firestore
- Check security rules allow authenticated users
- Verify user is logged in before writing


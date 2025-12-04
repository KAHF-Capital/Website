# Vercel Environment Variables Reference

**⚠️ CRITICAL: All environment variables must be set manually in Vercel Dashboard. Never commit secrets to the repository.**

## Setting Environment Variables in Vercel

1. Go to your [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project (kahf-capital-website)
3. Navigate to **Settings** → **Environment Variables**
4. Add each variable individually with the appropriate environment scope (Production, Preview, Development)
5. **Redeploy** your application after adding/updating variables

## Required Environment Variables

### Polygon.io API Configuration
```
POLYGON_API_KEY=your_polygon_api_key_here
```
- **Where to get it**: [Polygon.io Dashboard](https://polygon.io/dashboard)
- **Required for**: Stock price data, options data, market data

### NextAuth.js Configuration
```
NEXTAUTH_SECRET=your_nextauth_secret_here
NEXTAUTH_URL=https://www.kahfcapital.com
```
- **NEXTAUTH_SECRET**: Generate with `openssl rand -base64 32` or `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
- **NEXTAUTH_URL**: Your production domain (e.g., `https://www.kahfcapital.com`)
- **Required for**: Authentication system

### Firebase Configuration (Client-Side)
```
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```
- **Where to get it**: [Firebase Console](https://console.firebase.google.com/) → Project Settings → General → Your apps
- **Required for**: Client-side Firebase authentication and database access
- **Note**: Variables prefixed with `NEXT_PUBLIC_` are exposed to the browser

### Firebase Admin SDK (Server-Side)
```
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"...","private_key":"..."}
```
- **Where to get it**: [Firebase Console](https://console.firebase.google.com/) → Project Settings → Service Accounts → Generate new private key
- **Required for**: Server-side Firebase operations (user management, Firestore access)
- **Format**: The entire JSON file contents as a single-line string
- **⚠️ SECURITY**: This is a private key - never commit or expose it

### Stripe Configuration
```
STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret
```
- **Where to get it**: [Stripe Dashboard](https://dashboard.stripe.com/) → Developers → API keys
- **STRIPE_WEBHOOK_SECRET**: Get from Stripe Dashboard → Developers → Webhooks → Your webhook endpoint
- **Required for**: Payment processing and subscription management

### Twilio Configuration (SMS Alerts)
```
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1234567890
```
- **Where to get it**: [Twilio Console](https://console.twilio.com/)
- **Required for**: SMS alert functionality

### Security Secrets
```
CRON_SECRET=your_random_cron_secret_here
ADMIN_SECRET=your_random_admin_secret_here
```
- **Generate secrets**: Use `openssl rand -base64 32` or similar
- **CRON_SECRET**: For securing automated scanner cron job endpoint
- **ADMIN_SECRET**: For admin-only API endpoints

### Optional Configuration
```
NODE_ENV=production
NEXT_PUBLIC_BASE_URL=https://www.kahfcapital.com
YAHOO_MAX_CONCURRENT=3
YAHOO_BATCH_DELAY=2000
YAHOO_REQUEST_TIMEOUT=10000
YAHOO_MAX_RETRIES=2
```

## Environment Scope in Vercel

When setting variables in Vercel, you can choose:
- **Production**: Only used in production deployments
- **Preview**: Used in preview deployments (pull requests, branches)
- **Development**: Used in local development (if using Vercel CLI)

**Recommendation**: Set critical secrets (API keys, private keys) only for **Production** to limit exposure.

## Verification Checklist

After setting environment variables:

- [ ] All required variables are set in Vercel
- [ ] Variable names match exactly (case-sensitive)
- [ ] No placeholder values remain (e.g., `your_api_key_here`)
- [ ] Application redeployed after adding variables
- [ ] Test authentication functionality
- [ ] Test API endpoints that use environment variables
- [ ] Check Vercel function logs for any missing variable errors

## Security Best Practices

1. **Never commit secrets** to git repository
2. **Rotate secrets regularly** (especially after team member changes)
3. **Use different secrets** for development and production
4. **Limit access** to Vercel dashboard to trusted team members only
5. **Monitor usage** of API keys to detect unauthorized access
6. **Review logs** regularly for any security warnings

## Troubleshooting

### "Environment variable not found"
- Verify variable name matches exactly (case-sensitive)
- Ensure variable is set for the correct environment (Production/Preview)
- Redeploy after adding/updating variables

### "API key invalid" or authentication errors
- Verify the actual secret values are correct (not placeholders)
- Check if API key has been rotated or revoked
- Ensure API key has proper permissions/scopes

### Variables not updating after redeploy
- Vercel caches environment variables - ensure you've saved them in the dashboard
- Try triggering a new deployment
- Clear build cache if issues persist

## Related Documentation

- [FIREBASE_SETUP.md](./FIREBASE_SETUP.md) - Detailed Firebase setup instructions
- [PRODUCTION_ENV_SETUP.md](./PRODUCTION_ENV_SETUP.md) - Production deployment guide
- [Vercel Environment Variables Documentation](https://vercel.com/docs/concepts/projects/environment-variables)


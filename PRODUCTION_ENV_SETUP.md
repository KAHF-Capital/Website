# Production Environment Setup

**⚠️ IMPORTANT: All secrets must be set manually as environment variables in Vercel. Never commit secrets to the repository.**

## Required Environment Variables

Your production deployment needs these environment variables set manually in Vercel:

### 1. Polygon.io API Key
```
POLYGON_API_KEY=your_actual_polygon_api_key_here
```

### 2. NextAuth.js Configuration
```
NEXTAUTH_SECRET=your_production_secret_here
NEXTAUTH_URL=https://www.kahfcapital.com
```

## How to Set Environment Variables

**⚠️ IMPORTANT: All secrets must be set manually as environment variables in Vercel. Never commit secrets to the repository.**

### For Vercel Deployment:

1. **Go to your Vercel Dashboard**
2. **Select your project** (kahf-capital-website)
3. **Go to Settings → Environment Variables**
4. **Add these variables manually (do not copy from any file in the repository):**

| Name | Value | Environment |
|------|-------|-------------|
| `POLYGON_API_KEY` | `your_polygon_api_key_here` | Production |
| `NEXTAUTH_SECRET` | `your_nextauth_secret_here` | Production |
| `NEXTAUTH_URL` | `https://www.kahfcapital.com` | Production |

5. **Redeploy your application** after adding the variables

### Generate a New Production Secret (Recommended):

For better security, generate a new secret for production:

```bash
# Generate a new secret
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Verification Steps

After setting the environment variables:

1. **Redeploy your application**
2. **Visit** `https://www.kahfcapital.com/auth/signin`
3. **Test authentication** with your credentials
4. **Check that protected routes work** (scanner, straddle calculator)

## Troubleshooting

### If you still get NO_SECRET errors:

1. **Verify environment variables are set** in Vercel dashboard
2. **Make sure the variable names match exactly** (case-sensitive)
3. **Redeploy after adding variables**
4. **Check Vercel function logs** for any other errors

### Common Issues:

- **Missing NEXTAUTH_URL**: Should be your production domain
- **Wrong secret format**: Should be a base64 string
- **Case sensitivity**: Variable names must match exactly
- **Deployment timing**: Variables must be set before deployment

## Security Notes

- **Never commit secrets** to your repository
- **Use different secrets** for development and production
- **Rotate secrets regularly** for better security
- **Monitor your application logs** for any authentication issues



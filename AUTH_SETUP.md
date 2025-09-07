# Authentication System Setup Guide

## 🎉 What's Been Implemented

Your website now has a complete authentication system with:

- ✅ **Google OAuth Sign-in** - One-click Google authentication
- ✅ **Email/Password Registration** - Manual account creation
- ✅ **Protected Routes** - Scanner (free), Straddle Calculator (subscription required)
- ✅ **Session Management** - Secure JWT-based sessions
- ✅ **User Interface** - Login/signup pages with your green/red color scheme
- ✅ **Header Integration** - Shows user status and subscription level

## 🚀 Quick Setup (5 minutes)

### 1. Environment Variables

Copy the example environment file and add your keys:

```bash
cp env-example.txt .env.local
```

Edit `.env.local` and add:

```env
# NextAuth Configuration
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-super-secret-key-here-make-it-long-and-random

# Google OAuth (see setup below)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Your existing API key
POLYGON_API_KEY=your-polygon-api-key
```

### 2. Google OAuth Setup (Free)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Google+ API
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client ID"
5. Set application type to "Web application"
6. Add authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google` (development)
   - `https://yourdomain.com/api/auth/callback/google` (production)
7. Copy Client ID and Client Secret to your `.env.local`

### 3. Generate NextAuth Secret

Run this command to generate a secure secret:

```bash
openssl rand -base64 32
```

Or use any random string generator.

### 4. Start the Application

```bash
npm run dev
```

## 🔐 How It Works

### Authentication Flow
1. **Free Users**: Can access Scanner (limited features)
2. **Registered Users**: Can access Scanner with full features
3. **Subscribers**: Can access all tools including Straddle Calculator

### User Storage
- Users are stored in `data/users.json` (file-based, can be upgraded to database later)
- Passwords are hashed with bcrypt
- Google OAuth users are automatically created on first sign-in

### Route Protection
- **Scanner**: Requires login (free tier)
- **Straddle Calculator**: Requires subscription
- **Learning Modules**: Public access
- **Home**: Public access

## 🎨 UI Features

### Login/Signup Pages
- Clean, modern design matching your green/red theme
- Google OAuth button with official Google branding
- Email/password form with validation
- Error handling and success messages

### Header Integration
- Shows user avatar and name when logged in
- Displays subscription status (Free/Pro)
- Dropdown menu with sign out option
- Mobile-responsive design

### Protected Content
- Beautiful gate screens for unauthenticated users
- Subscription upgrade prompts for free users
- Seamless redirects after authentication

## 🔧 Customization Options

### Change Subscription Requirements
Edit the `requireSubscription` prop in your page components:

```jsx
// Free access (just requires login)
<ProtectedRoute requireSubscription={false}>
  <YourComponent />
</ProtectedRoute>

// Requires subscription
<ProtectedRoute requireSubscription={true}>
  <YourComponent />
</ProtectedRoute>
```

### Add More OAuth Providers
NextAuth.js supports many providers. Add to `[...nextauth].js`:

```javascript
import GitHubProvider from 'next-auth/providers/github'

providers: [
  // ... existing providers
  GitHubProvider({
    clientId: process.env.GITHUB_ID,
    clientSecret: process.env.GITHUB_SECRET,
  }),
]
```

### Customize User Data
Edit `lib/auth-utils.js` to add more user fields:

```javascript
const newUser = {
  id: Date.now().toString(),
  email,
  name,
  provider,
  subscriptionStatus: 'free',
  // Add custom fields
  preferences: {},
  usageStats: {},
  createdAt: new Date().toISOString(),
}
```

## 🚀 Production Deployment

### Vercel Deployment
1. Add environment variables in Vercel dashboard
2. Update `NEXTAUTH_URL` to your production domain
3. Update Google OAuth redirect URIs
4. Deploy as usual

### Database Upgrade (Optional)
For production, consider upgrading from file storage to a database:

- **Supabase**: Free tier, easy setup
- **MongoDB Atlas**: Free tier available
- **PostgreSQL**: More robust option

## 🧪 Testing

### Test Authentication Flow
1. Visit `/auth/signup` - create account with email/password
2. Visit `/auth/signin` - test login
3. Try Google OAuth sign-in
4. Test protected routes (scanner, straddle calculator)
5. Test sign out functionality

### Test Route Protection
1. Try accessing `/scanner` without login (should redirect)
2. Try accessing `/straddle-calculator` as free user (should show upgrade prompt)
3. Test mobile responsiveness

## 🔒 Security Features

- ✅ Password hashing with bcrypt
- ✅ JWT tokens with secure secrets
- ✅ CSRF protection (built into NextAuth)
- ✅ Secure session management
- ✅ Input validation and sanitization

## 📱 Mobile Support

- ✅ Responsive design for all screen sizes
- ✅ Touch-friendly buttons and forms
- ✅ Mobile-optimized navigation
- ✅ Fast loading and smooth animations

## 🎯 Next Steps

1. **Set up Google OAuth** (5 minutes)
2. **Test the authentication flow**
3. **Customize subscription requirements** for your tools
4. **Add Stripe webhook integration** for automatic subscription updates
5. **Consider upgrading to a database** for production

Your authentication system is now ready! Users can sign up with Google or email, and you can control access to your tools based on subscription status.

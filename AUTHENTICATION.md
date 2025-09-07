# Authentication System

This project uses NextAuth.js for authentication with a credentials-based provider.

## Features

- ✅ Sign up / Sign in / Sign out functionality
- ✅ Protected routes (Scanner, Straddle Calculator)
- ✅ Session management
- ✅ Responsive authentication UI
- ✅ Demo account for testing

## Demo Account

~~Demo account has been removed from the sign-in page for security reasons.~~

## Environment Variables

Make sure your `.env.local` file includes:

```env
# Polygon.io API Configuration
POLYGON_API_KEY=your_polygon_api_key_here

# NextAuth.js Configuration
NEXTAUTH_SECRET=your_nextauth_secret_here
NEXTAUTH_URL=http://localhost:3000
```

## Protected Routes

The following routes require authentication:
- `/scanner` - Dark pool scanner
- `/straddle-calculator` - Options straddle calculator

## Authentication Flow

1. **Unauthenticated users** see "Sign in" and "Sign up" buttons in the header
2. **Clicking "Sign up"** takes users to `/auth/signup`
3. **Clicking "Sign in"** takes users to `/auth/signin`
4. **After successful authentication**, users are redirected to the home page
5. **Authenticated users** see their name and a dropdown menu with sign out option
6. **Accessing protected routes** without authentication redirects to sign in page

## Components

### Header Component
- Shows authentication state
- Displays user menu when authenticated
- Mobile-responsive authentication buttons

### ProtectedRoute Component
- Wraps pages that require authentication
- Shows loading spinner while checking auth status
- Redirects to sign in if not authenticated

### Authentication Pages
- `/auth/signin` - Sign in form
- `/auth/signup` - Sign up form

## Security Notes

- Passwords are hashed using bcryptjs
- Sessions are managed by NextAuth.js
- Protected routes are enforced by middleware
- Environment variables are properly configured

## Development

1. Run `npm install` to install dependencies
2. Set up your `.env.local` file with required variables
3. Run `npm run dev` to start the development server
4. Visit `http://localhost:3000` to test the authentication system

## Production Deployment

Make sure to set these environment variables in your production environment:
- `POLYGON_API_KEY`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL` (should be your production domain)

# Quick Start: Fix "Firebase is not configured" Error

## The Problem
Your website is showing "Firebase is not configured" because the Firebase credentials are missing from your environment variables.

## The Solution (3 Simple Steps)

### Step 1: Create `.env.local` file
In the `Website` folder, create a new file named `.env.local` (note the dot at the beginning).

### Step 2: Get Your Firebase Credentials
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project (or create a new one if you don't have one)
3. Click the gear icon ⚙️ next to "Project Overview" → **Project Settings**
4. Scroll down to **"Your apps"** section
5. If you don't see a web app, click the `</>` (web) icon to add one
6. Copy the values from the `firebaseConfig` object

### Step 3: Add Credentials to `.env.local`
Open `.env.local` and paste this template, then replace the placeholder values with your actual Firebase values:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=your_actual_api_key_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-actual-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_actual_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_actual_app_id
```

**Important:** 
- Remove any quotes around the values
- Don't leave spaces around the `=` sign
- Make sure there are no typos

### Step 4: Restart Your Development Server
After creating/updating `.env.local`:
1. Stop your development server (press `Ctrl+C` in the terminal)
2. Start it again with `npm run dev` (or `yarn dev`)

## Example `.env.local` File
Here's what a completed file might look like (with fake values):

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyB1234567890abcdefghijklmnopqrstuvwxyz
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=my-project-12345.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=my-project-12345
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=my-project-12345.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789012
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789012:web:abcdef1234567890
```

## Still Having Issues?

### Check These Common Problems:
1. **File location**: Make sure `.env.local` is in the `Website` folder (same folder as `package.json`)
2. **File name**: Must be exactly `.env.local` (with the dot at the beginning)
3. **Variable names**: Must start with `NEXT_PUBLIC_` (this is required for Next.js)
4. **Server restart**: You MUST restart the dev server after creating/editing `.env.local`
5. **No quotes**: Don't wrap values in quotes unless the value itself contains spaces

### Need More Help?
See the detailed guide in `FIREBASE_SETUP.md` for:
- How to create a Firebase project
- How to enable Authentication
- How to set up Firestore database
- How to get the Service Account Key (for advanced features)

## What This File Does
The `.env.local` file stores your Firebase credentials securely. It's automatically ignored by git (so your secrets won't be committed), and Next.js reads these variables when your app starts.





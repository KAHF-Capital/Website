# Build and Deploy Guide

## Quick Deploy to Vercel

### Step 1: Check if you have Node.js installed
```bash
node --version
npm --version
```

### Step 2: Install dependencies and build
```bash
cd Website
npm install
npm run build
```

### Step 3: Deploy to Vercel
If you have Vercel CLI:
```bash
npm install -g vercel
vercel
```

Or manually:
1. Go to [vercel.com](https://vercel.com)
2. Import your GitHub repository
3. Deploy

## Alternative: Test Locally First

### Step 1: Start development server
```bash
cd Website
npm install
npm start
```

### Step 2: Test the preview
1. Open http://localhost:3000
2. Navigate to Learning Modules
3. Click on e-book purchase
4. Look for blue "View Preview" button
5. Click it to test the modal

## If npm is not available:

### Option 1: Install Node.js
Download from [nodejs.org](https://nodejs.org)

### Option 2: Use online IDE
- Use CodeSandbox, StackBlitz, or similar
- Import your project
- Test the functionality

### Option 3: Manual deployment
1. Commit all changes to Git
2. Push to GitHub
3. Connect Vercel to your GitHub repo
4. Vercel will auto-deploy

## Expected Result:
- Blue "View Preview" button on Payment page
- Modal opens with e-book content
- Can navigate through pages
- Pages 13-16 are blurred
- Zoom controls work

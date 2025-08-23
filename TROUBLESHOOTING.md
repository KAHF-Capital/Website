# E-book Preview Troubleshooting Guide

## Issue: Preview button not working or modal not appearing

### Step 1: Check if you're on the correct page
1. Navigate to your website
2. Go to the Learning Modules page
3. Click on the e-book purchase option
4. You should be on the Payment page with a blue "View Preview" button

### Step 2: Check browser console for errors
1. Open browser developer tools (F12)
2. Go to Console tab
3. Look for any error messages
4. You should see debug logs:
   - "Payment component rendered, showPreview: false"
   - "Preview button clicked, setting showPreview to true"
   - "EbookPreview rendered, isOpen: true"

### Step 3: Test the HTML version
1. Open `test-preview.html` in your browser
2. Click the "View Preview" button
3. The modal should appear

### Step 4: Common issues and solutions

#### Issue: Button not visible
- **Solution**: The button should be blue with an eye icon, positioned below the price
- **Check**: Make sure you're on the Payment page, not the success page

#### Issue: Modal appears but is blank
- **Solution**: Check if all dependencies are installed
- **Check**: Ensure lucide-react is installed

#### Issue: Modal doesn't appear at all
- **Solution**: Check z-index and positioning
- **Check**: The modal uses z-index 9999 and fixed positioning

#### Issue: React app not starting
- **Solution**: Make sure Node.js and npm are installed
- **Command**: `npm install` then `npm start`

### Step 5: Manual testing
1. Open browser console
2. Navigate to Payment page
3. Click "View Preview" button
4. Check console for debug messages
5. Modal should appear with e-book content

### Step 6: If still not working
1. Check if there are any JavaScript errors in console
2. Verify all files are saved
3. Try refreshing the page
4. Check if the React development server is running

## Expected Behavior
- Blue "View Preview" button below the price
- Clicking button opens modal with e-book content
- Modal has zoom controls and navigation
- Pages 13-16 are blurred
- Modal can be closed with X button or clicking outside

# KAHF Capital Website

A Next.js application for volatility trading education and dark pool analytics using real Polygon.io market data.

## Features

- **Real Dark Pool Analytics**: Identifies dark pool trades using Polygon.io's official criteria (exchange ID = 4 AND trf_id present)
- **Trading Opportunities**: Automated identification of straddle opportunities based on 300%+ dark pool activity vs 90-day historical average
- **Learning Modules**: Educational content for volatility trading strategies
- **Real-time Data**: Integration with Polygon.io REST API and WebSocket for live market data

## 🍭 **How to Add Your API Key (Step-by-Step)**

### **Step 1: Get Your Polygon.io API Key**
1. Go to [polygon.io](https://polygon.io) and sign up for an account
2. Once you're logged in, find your API key in your account settings
3. Copy it (it looks like a long string of letters and numbers)

### **Step 2: Add It to Your Project**
1. Open your Website folder on your computer
2. Look for a file called `env.example`
3. Copy this file and rename the copy to `.env.local`
4. Open `.env.local` with any text editor (like Notepad)
5. Find this line: `POLYGON_API_KEY=YOUR_POLYGON_API_KEY_HERE`
6. Replace `YOUR_POLYGON_API_KEY_HERE` with your actual API key
7. Save the file

**Example:**
```
Before: POLYGON_API_KEY=YOUR_POLYGON_API_KEY_HERE
After:  POLYGON_API_KEY=abc123def456ghi789
```

### **Step 3: Deploy to Vercel**
1. Go to your Vercel dashboard
2. Find your project
3. Go to Settings → Environment Variables
4. Add a new variable:
   - Name: `POLYGON_API_KEY`
   - Value: Your actual API key
5. Save and redeploy!

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Development

```bash
npm run dev
```

The application will be available at `http://localhost:3000`

### 3. Test Dark Pool Detection

Visit `http://localhost:3000/test-dark-pool` to test the dark pool detection with real data.

### 4. Build for Production

```bash
npm run build
```

## API Routes

- `GET /api/trades?symbol=AAPL` - Get real trades and identify dark pool activity
- `GET /api/historical-trades?symbol=AAPL&days=90` - Get historical trades for comparison
- `GET /api/opportunities` - Get trading opportunities based on dark pool analysis
- `POST /api/initialize` - Initialize Polygon.io API connection
- `GET /api/analytics/[symbol]` - Get detailed stock analytics
- `GET /api/health` - Health check
- `GET /api/config` - Get configuration

## Pages

- `/` - Home page
- `/scanner` - Dark pool scanner and trading opportunities
- `/learning` - Educational modules
- `/payment` - Payment page
- `/confirmation` - Payment confirmation
- `/test-dark-pool` - Test dark pool detection

## Dark Pool Detection Logic

Based on [Polygon.io's official documentation](https://polygon.io/knowledge-base/article/does-polygon-offer-dark-pool-data), our system identifies dark pool trades by:

1. **Exchange ID = 4**: All dark pool trades have exchange ID of 4
2. **TRF ID Present**: Dark pool trades must have a `trf_id` field
3. **Activity Comparison**: Compare current dark pool activity to 90-day historical average
4. **Threshold Detection**: Flag opportunities when activity exceeds 300% of historical average

### Example Dark Pool Trade:
```json
{
  "conditions": [12, 37],
  "exchange": 4,
  "id": "1",
  "participant_timestamp": 1642594169516358704,
  "price": 170.28,
  "sequence_number": 58452,
  "sip_timestamp": 1642597200042949698,
  "size": 62,
  "tape": 3,
  "trf_id": 201,
  "trf_timestamp": 1642597200042608441
}
```

## Trading Opportunities

Opportunities are generated when:
- Dark pool activity exceeds 300% of historical average
- Sufficient volume for analysis (>100,000 shares)
- Volatility spread meets minimum threshold

## Data Sources

- **REST API**: [Polygon.io Trades Endpoint](https://polygon.io/docs/rest/stocks/trades-quotes/trades)
- **WebSocket**: [Polygon.io Trades WebSocket](https://polygon.io/docs/websocket/stocks/trades)
- **Dark Pool Data**: [Polygon.io Dark Pool Documentation](https://polygon.io/knowledge-base/article/does-polygon-offer-dark-pool-data)

## Architecture

- **Frontend**: Next.js with React, Tailwind CSS
- **API**: Next.js API routes with serverless functions
- **Data**: Polygon.io REST API and WebSocket
- **Styling**: Tailwind CSS with custom components
- **Icons**: Lucide React

## Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Connect your repository to Vercel
3. Add your `POLYGON_API_KEY` environment variable in Vercel dashboard
4. Deploy!

### Manual Deployment

1. Build the application: `npm run build`
2. Start the production server: `npm start`

## Testing

After adding your API key, test the system:

1. Visit `/test-dark-pool` to verify dark pool detection
2. Check `/scanner` for trading opportunities
3. Use `/api/analytics/AAPL` to see detailed analytics

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

Private - All rights reserved


# 🌊 Dark Pool Scanner

A real-time dark pool trading scanner that monitors institutional trading activity across major stocks and ETFs using Polygon.io market data.

## Features

- **Real Dark Pool Analytics**: Identifies dark pool trades using Polygon.io's official criteria (exchange ID = 4 AND trf_id present)
- **15-Minute Auto-Refresh**: Automatically updates data every 15 minutes for real-time monitoring
- **SQLite Database**: Stores all dark pool trade data locally for historical analysis
- **Search Functionality**: Look up specific tickers for dark pool activity
- **Vercel Deployment Ready**: Easy deployment with automatic environment variable setup

## 🚀 **Quick Setup**

### **Option 1: Automated Setup (Recommended)**
```bash
npm install
npm run setup
npm run dev
```

### **Option 2: Manual Setup**
1. **Get your Polygon.io API key** from [polygon.io](https://polygon.io)
2. **Run the setup script:**
   ```bash
   npm run setup
   ```
3. **Or manually create `.env.local`:**
   ```bash
   cp env.example .env.local
   # Edit .env.local and add your API key
   ```

### **Step 3: Deploy to Vercel**
1. Push your code to GitHub
2. Connect to Vercel
3. Add `POLYGON_API_KEY` environment variable in Vercel dashboard
4. Deploy!

**Note:** The scanner automatically refreshes every 15 minutes once deployed!

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

- `GET /api/darkpool-trades` - Get today's dark pool trades from database
- `GET /api/darkpool-trades?ticker=AAPL&refresh=true` - Get and refresh dark pool trades for specific ticker
- `POST /api/refresh-darkpool` - Manually refresh all dark pool data from Polygon.io
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


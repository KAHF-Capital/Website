# KAHF Capital Website

A Next.js application for volatility trading education and dark pool analytics.

## Features

- **Dark Pool Analytics**: Real-time detection of dark pool activity using Polygon.io data
- **Trading Opportunities**: Automated identification of straddle opportunities based on volatility spreads
- **Learning Modules**: Educational content for volatility trading strategies
- **Real-time Data**: WebSocket integration for live market data

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure API Key

1. Copy the example environment file:
   ```bash
   cp env.example .env.local
   ```

2. Edit `.env.local` and replace `YOUR_POLYGON_API_KEY_HERE` with your actual Polygon.io API key:
   ```
   POLYGON_API_KEY=your_actual_api_key_here
   ```

### 3. Development

```bash
npm run dev
```

The application will be available at `http://localhost:3000`

### 4. Build for Production

```bash
npm run build
```

## Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Connect your repository to Vercel
3. Add your `POLYGON_API_KEY` environment variable in Vercel dashboard
4. Deploy!

### Manual Deployment

1. Build the application: `npm run build`
2. Start the production server: `npm start`

## API Routes

- `GET /api/opportunities` - Get trading opportunities
- `POST /api/initialize` - Initialize Polygon.io API connection
- `GET /api/analytics/[symbol]` - Get stock analytics
- `GET /api/health` - Health check
- `GET /api/config` - Get configuration

## Pages

- `/` - Home page
- `/scanner` - Dark pool scanner and trading opportunities
- `/learning` - Educational modules
- `/payment` - Payment page
- `/confirmation` - Payment confirmation

## Architecture

- **Frontend**: Next.js with React, Tailwind CSS
- **API**: Next.js API routes
- **Data**: Polygon.io REST API and WebSocket
- **Styling**: Tailwind CSS with custom components
- **Icons**: Lucide React

## Dark Pool Detection

The application identifies dark pool activity by:
- Monitoring trades with exchange ID 4
- Tracking `trf_id` patterns
- Comparing current activity to 90-day historical data
- Calculating volatility spreads (implied vs historical)

## Trading Opportunities

Opportunities are generated when:
- Dark pool activity exceeds 300% of historical average
- Implied volatility is lower than historical volatility
- Volatility spread meets minimum threshold

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

Private - All rights reserved


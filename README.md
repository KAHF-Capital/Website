# Kahf Capital Website

A modern web application for dark pool trading analysis and portfolio management.

## 🚀 Features

- **Dark Pool Scanner**: Real-time dark pool trading activity analysis
- **Portfolio Management**: Track and analyze your investment portfolio
- **Analytics Dashboard**: Comprehensive trading analytics and insights
- **Responsive Design**: Modern UI that works on all devices
- **Real-time Data**: Live market data integration via Polygon.io API

## 🛠️ Tech Stack

- **Frontend**: Next.js 14, React 18, Tailwind CSS
- **Backend**: Next.js API Routes, Node.js
- **Data Storage**: JSON-based file storage (Vercel-compatible)
- **External APIs**: Polygon.io for market data
- **Deployment**: Vercel (recommended)

## 📋 Prerequisites

- Node.js 18+ 
- npm or yarn
- Polygon.io API key (free tier available)

## 🔧 Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Website
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   yarn install
   ```

3. **Set up environment variables**
   ```bash
   cp env.example .env.local
   ```
   
   Edit `.env.local` and add your Polygon.io API key:
   ```
   POLYGON_API_KEY=your_actual_api_key_here
   ```

4. **Run the development server**
   ```bash
   npm run dev
   # or
   yarn dev
   ```

5. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## 🔑 Getting a Polygon.io API Key

1. Visit [Polygon.io](https://polygon.io)
2. Sign up for a free account
3. Navigate to your API keys section
4. Copy your API key
5. Add it to your `.env.local` file

**Note**: The free tier includes:
- 5 API calls per minute
- Basic market data access
- Suitable for development and small-scale usage

## 📁 Project Structure

```
Website/
├── pages/                 # Next.js pages and API routes
│   ├── api/              # API endpoints
│   │   └── darkpool-trades.js
│   ├── scanner.js        # Scanner page
│   └── index.js          # Home page
├── src/
│   ├── components/       # Reusable React components
│   │   ├── ui/          # UI components (buttons, inputs, etc.)
│   │   └── ErrorBoundary.jsx
│   ├── pages/           # Page components
│   │   └── Scanner.jsx
│   ├── utils.js         # Utility functions
│   └── index.css        # Global styles
├── lib/
│   └── database.js      # Data storage utilities
├── public/              # Static assets
├── package.json         # Dependencies and scripts
├── next.config.js       # Next.js configuration
├── tailwind.config.js   # Tailwind CSS configuration
└── README.md           # This file
```

## 🚀 Deployment

### Vercel (Recommended)

1. **Install Vercel CLI**
   ```bash
   npm i -g vercel
   ```

2. **Deploy**
   ```bash
   vercel
   ```

3. **Set environment variables**
   - Go to your Vercel dashboard
   - Navigate to your project settings
   - Add `POLYGON_API_KEY` environment variable

### Other Platforms

The application is compatible with any Node.js hosting platform:
- Netlify
- Railway
- DigitalOcean App Platform
- AWS Amplify

## 🔍 Troubleshooting

### Common Issues

#### 1. "Service temporarily unavailable" Error
**Cause**: Missing or invalid API key
**Solution**: 
- Verify your Polygon.io API key is correct
- Check that the key is properly set in your environment variables
- Ensure the key has the necessary permissions

#### 2. "Request timed out" Error
**Cause**: API rate limiting or network issues
**Solution**:
- Check your Polygon.io API usage limits
- Wait a few minutes and try again
- Verify your internet connection

#### 3. "Internal server error" Error
**Cause**: Missing function or database corruption
**Solution**:
- Check the server logs for detailed error messages
- Restart the development server
- Clear the database file (it will be recreated automatically)

#### 4. Chrome Extension Error
**Note**: The Chrome extension error you mentioned is unrelated to this website. It's from a browser extension, not this application.

### Development Debugging

1. **Enable detailed error messages**
   ```bash
   NODE_ENV=development npm run dev
   ```

2. **Check API responses**
   - Open browser developer tools
   - Go to Network tab
   - Monitor API calls to `/api/darkpool-trades`

3. **View server logs**
   - Check the terminal where you're running the dev server
   - Look for error messages and API call logs

## 📊 API Endpoints

### GET /api/darkpool-trades
Fetches dark pool trading data.

**Query Parameters:**
- `refresh` (optional): Set to "true" to force refresh data
- `include_history` (optional): Set to "true" to include 90-day historical data

**Response:**
```json
{
  "date": "2024-01-15",
  "trades": [
    {
      "ticker": "AAPL",
      "total_volume": 1500000,
      "trade_count": 45,
      "avg_90day_volume": 1200000,
      "volume_ratio": 1.25
    }
  ],
  "total_tickers": 25,
  "last_updated": "2024-01-15T10:30:00Z",
  "cached": true
}
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `POLYGON_API_KEY` | Your Polygon.io API key | Yes | - |
| `NODE_ENV` | Environment mode | No | development |

### Customization

#### Styling
- Edit `tailwind.config.js` for theme customization
- Modify `src/index.css` for global styles

#### API Configuration
- Update timeout values in `src/utils.js`
- Modify retry logic in API calls

#### Data Storage
- The application uses JSON file storage for simplicity
- For production, consider migrating to a proper database

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

If you encounter any issues:

1. Check the troubleshooting section above
2. Review the error logs in your browser's developer tools
3. Check the server logs in your terminal
4. Create an issue on GitHub with detailed error information

## 🔄 Recent Updates

### v1.1.0 (Latest)
- ✅ Fixed missing `addHistoricalDataToTrades` function
- ✅ Improved error handling and user feedback
- ✅ Added retry logic with exponential backoff
- ✅ Enhanced data validation and backup system
- ✅ Better timeout handling for API calls
- ✅ Improved error boundary component
- ✅ Added comprehensive utility functions
- ✅ Optimized API performance to prevent 504 timeouts
- ✅ Reduced historical data period from 90 to 30 days
- ✅ Implemented concurrency limiting for API calls
- ✅ Added health check endpoint for monitoring

### v1.0.0
- ✅ Initial release with dark pool scanner
- ✅ Basic portfolio management
- ✅ Responsive design
- ✅ Polygon.io integration


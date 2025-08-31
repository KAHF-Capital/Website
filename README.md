# CSV-Based Dark Pool Scanner

A simple, reliable dark pool trading scanner that analyzes CSV files from Polygon.io.

## 🚀 Features

- **CSV Analysis**: Processes Polygon.io CSV files locally
- **Dark Pool Detection**: Identifies dark pool trades (exchange = 4 AND trf_id present)
- **Volume Ranking**: Shows tickers sorted by dark pool volume
- **Fast Loading**: Instant results from local CSV processing
- **No API Dependencies**: Works completely offline
- **Simple Setup**: Just upload CSV files and view results

## 🛠️ Tech Stack

- **Frontend**: Next.js 14, React 18, Tailwind CSS
- **Backend**: Next.js API Routes, Node.js
- **Data Processing**: CSV parsing and analysis
- **File Storage**: Local CSV files

## 📋 Prerequisites

- Node.js 18+ 
- npm or yarn
- Polygon.io CSV export (90-day historical data)

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

3. **Create data directory**
   ```bash
   mkdir -p data/daily
   ```

4. **Upload your CSV file**
   - Download 90-day historical data from Polygon.io
   - Place the CSV file in the `data/daily/` directory

5. **Start the development server**
   ```bash
   npm run dev
   # or
   yarn dev
   ```

6. **Open your browser**
   Navigate to [http://localhost:3000/scanner](http://localhost:3000/scanner)

## 📁 Project Structure

```
Website/
├── data/                 # CSV files directory
│   ├── daily/           # Upload your daily CSV files here
│   └── darkpool_history.csv  # Historical data (auto-generated)
├── pages/               # Next.js pages and API routes
│   ├── api/            # API endpoints
│   │   └── darkpool-trades.js
│   ├── scanner.js      # Scanner page
│   └── index.js        # Home page
├── src/
│   ├── components/     # React components
│   │   ├── ui/        # UI components
│   │   └── ErrorBoundary.jsx
│   ├── pages/         # Page components
│   │   └── Scanner.jsx
│   ├── utils.js       # Utility functions
│   └── index.css      # Global styles
├── package.json        # Dependencies and scripts
├── next.config.js      # Next.js configuration
├── tailwind.config.js  # Tailwind CSS configuration
├── SETUP.md           # Detailed setup instructions
└── README.md          # This file
```

## 📊 CSV File Requirements

Your CSV file must include these columns:

| Column | Required | Description |
|--------|----------|-------------|
| `ticker` or `symbol` | Yes | Stock ticker symbol |
| `exchange` | Yes | Exchange ID (4 for dark pools) |
| `trf_id` | Yes | Trade reporting facility ID |
| `size` or `volume` | Yes | Trade volume |
| `price` or `p` | Yes | Trade price |
| `timestamp` or `t` | Yes | Trade timestamp |

## 🔍 How It Works

1. **CSV Upload**: Place your Polygon.io CSV file in `data/daily/`
2. **Dark Pool Detection**: System filters trades where `exchange = 4` AND `trf_id` is present
3. **Data Processing**: Groups trades by ticker and calculates totals
4. **Display**: Shows tickers sorted by dark pool volume

## 📈 Daily Workflow

1. **Download CSV**: Get your daily data from Polygon.io
2. **Upload**: Place the CSV file in `data/daily/`
3. **View Results**: Visit the scanner page to see analysis
4. **Optional**: Add `?save=true` to URL to save to historical CSV

## 🚀 Deployment

### Vercel (Recommended)

1. **Upload CSV files** to the `data/daily/` directory
2. **Deploy to Vercel**:
   ```bash
   vercel --prod
   ```

### Other Platforms

The application works on any Node.js hosting platform:
- Netlify
- Railway
- DigitalOcean App Platform
- AWS Amplify

## 🔧 Configuration

### Environment Variables

No environment variables required! The system works completely offline.

### Customization

#### Styling
- Edit `tailwind.config.js` for theme customization
- Modify `src/index.css` for global styles

#### CSV Processing
- Update column mappings in `pages/api/darkpool-trades.js`
- Modify filtering logic for different CSV formats

## 📊 API Endpoints

### GET /api/darkpool-trades
Analyzes the latest CSV file and returns dark pool data.

**Query Parameters:**
- `save` (optional): Set to "true" to save results to historical CSV

**Response:**
```json
{
  "date": "2024-01-15",
  "trades": [
    {
      "ticker": "AAPL",
      "total_volume": 2500000,
      "trade_count": 45,
      "avg_price": 150.25,
      "total_value": 375625000
    }
  ],
  "total_tickers": 25,
  "total_trades": 1500,
  "last_updated": "2024-01-15T10:30:00Z",
  "file_processed": "polygon_data_2024-01-15.csv"
}
```

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

1. Check the setup guide in `SETUP.md`
2. Verify your CSV file format
3. Ensure all required columns are present
4. Check file permissions in the data directory

## 🎯 Benefits

- **No API timeouts**: All processing is local
- **Fast loading**: Instant results from CSV analysis
- **Reliable**: No dependency on external API calls
- **Flexible**: Works with any CSV format from Polygon.io
- **Offline capable**: Can work without internet connection
- **Simple maintenance**: Just upload new CSV files daily

## 🔄 Recent Updates

### v2.0.0 (Latest)
- ✅ Complete rewrite to CSV-based system
- ✅ Removed all API dependencies
- ✅ Local CSV processing and analysis
- ✅ Simplified setup and deployment
- ✅ No more timeout issues
- ✅ Offline-capable system
- ✅ Fast, reliable performance

---

**Note**: This system requires manual CSV uploads from Polygon.io. For automated data collection, consider upgrading to a paid Polygon.io plan with API access.


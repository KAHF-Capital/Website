# Dark Pool Scanner

A clean, fast dark pool trading data viewer that displays pre-analyzed data from Polygon.io CSV files.

## 🚀 Features

- **Pre-analyzed Data**: Displays processed dark pool trading data
- **Date-based Viewing**: Browse data by specific trading dates
- **Volume-based Sorting**: Tickers sorted by dark pool volume
- **Clean Interface**: Simple, responsive UI for viewing results
- **Fast Loading**: Instant results from local JSON files
- **No Processing Overhead**: Just view your pre-analyzed data

## 🛠️ Tech Stack

- **Frontend**: Next.js, React, Tailwind CSS
- **Backend**: Node.js
- **Data Storage**: Local JSON files
- **Deployment**: Vercel

## 📋 Prerequisites

- Node.js 18+ 
- npm or yarn
- Pre-processed dark pool data (JSON files)

## 🚀 Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd Website
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Ensure processed data exists**
   - Processed JSON files should be in `data/processed/`
   - Files should be named in format: `YYYY-MM-DD_filename.json`

## 📁 Project Structure

```
Website/
├── data/
│   └── processed/       # Pre-analyzed JSON results
├── pages/
│   ├── api/            # API routes
│   └── scanner.jsx     # Main scanner page
├── process-csv.js      # Standalone CSV processor (for data preparation)
├── deploy.sh           # Linux/Mac deployment script
├── deploy.bat          # Windows deployment script
└── README.md
```

## 🔄 How It Works

1. **Data Preparation**: 
   - Process CSV files using `node process-csv.js`
   - Creates JSON files in `data/processed/`
   - Files are named by date: `YYYY-MM-DD_filename.json`

2. **Data Display**:
   - Web interface loads processed JSON data
   - Displays tickers sorted by volume
   - Shows detailed statistics per ticker

3. **Date Navigation**:
   - Select different dates from dropdown
   - View dark pool activity for specific trading days

## 📅 Daily Workflow

### **Data Preparation (One-time setup)**
1. **Download CSV files** from Polygon.io
2. **Place files** in `data/daily/` folder
3. **Process files**:
   ```bash
   cd Website
   node process-csv.js
   ```

### **Daily Viewing**
1. **Start web server**:
   ```bash
   npm run dev
   ```
2. **View results** at `http://localhost:3000/scanner`
3. **Select dates** from dropdown to browse different days

### **Deployment (Optional)**
```bash
# Windows
deploy.bat

# Linux/Mac
./deploy.sh
```

## 🌐 Web Interface

### **Scanner Page** (`/scanner`)
- Date selector dropdown
- Dark pool activity by date
- Tickers sorted by volume
- Detailed statistics per ticker
- Refresh button for latest data

## 📊 Data Output

### **Date-specific JSON**
```json
{
  "date": "2024-01-01",
  "tickers": [
    {
      "ticker": "AAPL",
      "total_volume": 500000,
      "trade_count": 45,
      "avg_price": 150.25,
      "total_value": 75125000,
      "min_price": 149.50,
      "max_price": 151.00
    }
  ]
}
```

## 🚀 Deployment

### **Local Development**
```bash
npm run dev
```
Navigate to [http://localhost:3000/scanner](http://localhost:3000/scanner)

### **Vercel Deployment**
1. **Install Vercel CLI**:
   ```bash
   npm i -g vercel
   ```

2. **Deploy**:
   ```bash
   vercel --prod
   ```

## 🔧 Troubleshooting

### **No Data Available**
- Ensure CSV files have been processed with `node process-csv.js`
- Check that JSON files exist in `data/processed/`
- Verify file naming format: `YYYY-MM-DD_filename.json`

### **Web Server Issues**
- Ensure you're in the `Website` directory
- Run `npm install` if dependencies are missing
- Check for port conflicts (default: 3000)

### **Data Processing Issues**
- Use `node process-csv.js --force` to reprocess files
- Check CSV format matches requirements
- Ensure files are in `data/daily/` directory

## 📝 Recent Updates

- **v2.1**: Simplified interface for pre-analyzed data
- **v2.0**: Complete CSV-based system with file tracking
- **v1.5**: Memory-efficient chunked processing

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.


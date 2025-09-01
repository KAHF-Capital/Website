# ATM Straddle Profitability Calculator

A web-based options trading calculator that evaluates the historical profitability of At-The-Money (ATM) straddle strategies by analyzing how often a stock's price movements exceed breakeven points.

## Features

### Core Functionality
- **Real-time Stock Price Lookup**: Automatically fetches current stock prices using Alpha Vantage API
- **Breakeven Calculations**: Calculates upper and lower breakeven points based on strike price and premium
- **Historical Analysis**: Analyzes historical price movements to determine profitability probability
- **Interactive UI**: Modern, responsive interface with real-time updates
- **Visual Charts**: Graphical representation of profitability analysis

### Input Parameters
- **Stock Ticker**: Enter any valid stock symbol (e.g., AAPL, TSLA, SPY)
- **Current Price**: Auto-populated from API or manually entered
- **Execution Date**: When the straddle will be executed
- **Expiration Date**: When the options expire
- **Strike Price**: ATM or near-ATM strike price
- **Total Premium**: Combined call + put premium cost

### Calculations Performed
1. **Days to Expiration**: Automatically calculated from execution to expiration dates
2. **Breakeven Points**:
   - Upper Breakeven = Strike Price + Total Premium
   - Lower Breakeven = Strike Price - Total Premium
3. **Percentage Moves Required**:
   - Upper Breakeven % = (Upper Breakeven - Strike) / Strike
   - Lower Breakeven % = (Lower Breakeven - Strike) / Strike

### Historical Analysis
The calculator analyzes historical price data to determine:
- How often the stock moved above the upper breakeven point
- How often the stock moved below the lower breakeven point
- Overall profitability rate based on historical performance
- Total number of profitable vs unprofitable occurrences

## Technical Implementation

### Frontend Components
- **StraddleCalculator.jsx**: Main calculator component with input form and results display
- **StraddleChart.jsx**: Visualization component for historical analysis results
- **UI Components**: Reusable components for inputs, buttons, badges, and charts

### Backend API Endpoints
- **`/api/stock-price`**: Fetches current stock prices from Alpha Vantage API
- **`/api/straddle-analysis`**: Performs historical analysis and returns profitability metrics

### Utility Classes
- **StraddleCalculator.js**: Core calculation engine with methods for:
  - Breakeven point calculations
  - Profit/loss analysis
  - Probability of profit calculations
  - Expected value calculations
  - Input validation

### Data Sources
- **Alpha Vantage API**: For real-time stock prices and historical data
- **Fallback Mock Data**: Generated when API limits are reached or for demo purposes

## Usage Instructions

### Basic Usage
1. Navigate to `/straddle-calculator` in your browser
2. Enter the stock ticker symbol (e.g., "AAPL")
3. The current stock price will be automatically fetched
4. Select execution and expiration dates
5. Enter the strike price (typically ATM or near current price)
6. Enter the total premium (call + put combined cost)
7. Click "Calculate Profitability" to see the analysis

### Understanding Results
- **Breakeven Points**: Shows the price levels where the strategy breaks even
- **Historical Analysis**: Displays how often the stock exceeded breakeven points historically
- **Profitability Rate**: Percentage of historical periods where the strategy would have been profitable
- **Visual Charts**: Bar charts showing the distribution of profitable vs unprofitable moves

### Example Analysis
For a $100 stock with a $5 straddle premium:
- Upper Breakeven: $105 (+5%)
- Lower Breakeven: $95 (-5%)
- If historically the stock moved beyond these levels 60% of the time, the strategy has a 60% probability of profit

## API Configuration

### Environment Variables
Add the following to your `.env.local` file:
```
ALPHA_VANTAGE_API_KEY=your_api_key_here
```

### Alpha Vantage API
- Free tier available at [Alpha Vantage](https://www.alphavantage.co/)
- Rate limits: 5 API calls per minute, 500 per day
- When limits are reached, the app falls back to mock data

## Installation and Setup

### Prerequisites
- Node.js 14+ 
- npm or yarn
- Alpha Vantage API key (optional, for real data)

### Installation Steps
1. Clone the repository
2. Install dependencies: `npm install`
3. Set up environment variables (see above)
4. Run development server: `npm run dev`
5. Navigate to `http://localhost:3000/straddle-calculator`

### Building for Production
```bash
npm run build
npm start
```

## Mathematical Formulas

### Breakeven Calculations
```
Upper Breakeven = Strike Price + Total Premium
Lower Breakeven = Strike Price - Total Premium
Upper Breakeven % = (Upper Breakeven - Strike) / Strike * 100
Lower Breakeven % = (Lower Breakeven - Strike) / Strike * 100
```

### Profitability Analysis
```
Profitable Moves = Moves Above Upper + Moves Below Lower
Profitability Rate = (Profitable Moves / Total Samples) * 100
```

### Expected Value (Simplified)
```
Expected Profit = (Profitability Rate / 100) * Average Profit
Expected Loss = ((100 - Profitability Rate) / 100) * Premium
Expected Value = Expected Profit - Expected Loss
```

## Limitations and Considerations

### Data Limitations
- Historical analysis is based on past performance and may not predict future results
- API rate limits may affect real-time data availability
- Mock data is used when API limits are reached

### Strategy Assumptions
- Assumes perfect execution at specified prices
- Does not account for transaction costs, slippage, or bid-ask spreads
- Simplified expected value calculations
- Does not consider implied volatility changes

### Risk Disclaimers
- This tool is for educational purposes only
- Past performance does not guarantee future results
- Options trading involves substantial risk
- Always consult with a financial advisor before making investment decisions

## Future Enhancements

### Planned Features
- Multiple timeframe analysis (daily, weekly, monthly)
- Implied volatility analysis
- Greeks calculations (Delta, Gamma, Theta, Vega)
- Portfolio-level analysis
- Export functionality for results
- Comparison with other options strategies

### Technical Improvements
- Caching for historical data to reduce API calls
- Real-time options chain data integration
- Advanced charting with price overlays
- Mobile app version
- Backtesting framework integration

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For questions or issues:
1. Check the documentation above
2. Review existing issues on GitHub
3. Create a new issue with detailed information about your problem

---

**Disclaimer**: This calculator is for educational purposes only. It does not constitute financial advice. Always consult with a qualified financial advisor before making investment decisions. Options trading involves substantial risk and is not suitable for all investors.

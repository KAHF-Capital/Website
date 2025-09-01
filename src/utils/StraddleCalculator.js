export class StraddleCalculator {
  constructor(ticker, currentPrice, strike, premium, daysToExp) {
    this.ticker = ticker;
    this.currentPrice = currentPrice;
    this.strike = strike;
    this.premium = premium;
    this.daysToExp = daysToExp;
  }
  
  // Calculate breakeven points
  calculateBreakevens() {
    if (!this.strike || !this.premium) return null;
    
    return {
      upper: this.strike + this.premium,
      lower: this.strike - this.premium,
      upperPct: ((this.strike + this.premium - this.strike) / this.strike) * 100,
      lowerPct: ((this.strike - this.premium - this.strike) / this.strike) * 100
    };
  }
  
  // Calculate maximum profit and loss
  calculateProfitLoss() {
    if (!this.strike || !this.premium) return null;
    
    return {
      maxProfit: 'Unlimited', // Straddle has unlimited upside potential
      maxLoss: this.premium, // Maximum loss is the premium paid
      maxLossPct: (this.premium / this.strike) * 100
    };
  }
  
  // Calculate probability of profit based on breakeven points
  calculateProbabilityOfProfit(historicalData) {
    if (!historicalData || historicalData.length === 0) return null;
    
    const breakevens = this.calculateBreakevens();
    if (!breakevens) return null;
    
    let aboveUpperCount = 0;
    let belowLowerCount = 0;
    let totalValidSamples = 0;
    
    historicalData.forEach(movement => {
      const percentMove = movement.percentMove;
      
      if (percentMove > breakevens.upperPct / 100) {
        aboveUpperCount++;
      }
      if (percentMove < breakevens.lowerPct / 100) {
        belowLowerCount++;
      }
      totalValidSamples++;
    });
    
    const totalProfitable = aboveUpperCount + belowLowerCount;
    const profitableRate = totalValidSamples > 0 ? (totalProfitable / totalValidSamples) * 100 : 0;
    
    return {
      aboveUpper: aboveUpperCount,
      belowLower: belowLowerCount,
      totalProfitable,
      totalSamples: totalValidSamples,
      profitableRate,
      aboveUpperPct: totalValidSamples > 0 ? (aboveUpperCount / totalValidSamples) * 100 : 0,
      belowLowerPct: totalValidSamples > 0 ? (belowLowerCount / totalValidSamples) * 100 : 0
    };
  }
  
  // Calculate expected value
  calculateExpectedValue(historicalData) {
    if (!historicalData || historicalData.length === 0) return null;
    
    const probability = this.calculateProbabilityOfProfit(historicalData);
    if (!probability) return null;
    
    // Simplified expected value calculation
    // Assumes average profit when profitable and full loss when not
    const avgProfit = this.premium * 0.5; // Conservative estimate
    const expectedProfit = (probability.profitableRate / 100) * avgProfit;
    const expectedLoss = ((100 - probability.profitableRate) / 100) * this.premium;
    
    return {
      expectedValue: expectedProfit - expectedLoss,
      expectedProfit,
      expectedLoss,
      probabilityOfProfit: probability.profitableRate
    };
  }
  
  // Generate strategy summary
  generateStrategySummary(historicalData) {
    const breakevens = this.calculateBreakevens();
    const profitLoss = this.calculateProfitLoss();
    const probability = this.calculateProbabilityOfProfit(historicalData);
    const expectedValue = this.calculateExpectedValue(historicalData);
    
    return {
      ticker: this.ticker,
      currentPrice: this.currentPrice,
      strike: this.strike,
      premium: this.premium,
      daysToExpiration: this.daysToExp,
      breakevens,
      profitLoss,
      probability,
      expectedValue,
      strategy: 'ATM Straddle',
      description: `Buy ATM call and put options with ${this.daysToExp} days to expiration`
    };
  }
  
  // Validate inputs
  validateInputs() {
    const errors = [];
    
    if (!this.ticker) errors.push('Ticker symbol is required');
    if (!this.strike || this.strike <= 0) errors.push('Valid strike price is required');
    if (!this.premium || this.premium <= 0) errors.push('Valid premium is required');
    if (!this.daysToExp || this.daysToExp <= 0) errors.push('Valid days to expiration is required');
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

// Utility functions for date calculations
export const dateUtils = {
  // Calculate days between two dates
  daysBetween: (startDate, endDate) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return Math.floor((end - start) / (1000 * 60 * 60 * 24));
  },
  
  // Format date for display
  formatDate: (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  },
  
  // Get today's date in YYYY-MM-DD format
  getToday: () => {
    return new Date().toISOString().split('T')[0];
  }
};

// Utility functions for financial calculations
export const financialUtils = {
  // Calculate percentage change
  percentChange: (startValue, endValue) => {
    return ((endValue - startValue) / startValue) * 100;
  },
  
  // Format currency
  formatCurrency: (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(value);
  },
  
  // Format percentage
  formatPercentage: (value) => {
    return `${value.toFixed(2)}%`;
  }
};

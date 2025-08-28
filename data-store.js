const fs = require('fs');
const path = require('path');

// Data file path
const dataPath = path.join(__dirname, 'darkpool-data.json');

// Initialize data store
function initializeDataStore() {
  try {
    if (!fs.existsSync(dataPath)) {
      const initialData = {
        dailyData: {},
        trackedSymbols: []
      };
      fs.writeFileSync(dataPath, JSON.stringify(initialData, null, 2));
      console.log('Data store initialized successfully');
    }
    return true;
  } catch (error) {
    console.error('Error initializing data store:', error);
    return false;
  }
}

// Save daily dark pool data
function saveDailyData(symbol, date, darkPoolVolume, totalVolume, darkPoolRatio) {
  try {
    const data = loadData();
    
    if (!data.dailyData[date]) {
      data.dailyData[date] = {};
    }
    
    data.dailyData[date][symbol] = {
      darkPoolVolume,
      totalVolume,
      darkPoolRatio,
      timestamp: new Date().toISOString()
    };
    
    // Add to tracked symbols if not already there
    if (!data.trackedSymbols.includes(symbol)) {
      data.trackedSymbols.push(symbol);
    }
    
    saveData(data);
    console.log(`Saved data for ${symbol} on ${date}`);
    return true;
  } catch (error) {
    console.error('Error saving data:', error);
    return false;
  }
}

// Get 90-day average for a symbol
function get90DayAverage(symbol, currentDate) {
  try {
    const data = loadData();
    const currentDateObj = new Date(currentDate);
    const ninetyDaysAgo = new Date(currentDateObj);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    
    let totalDarkPoolVolume = 0;
    let totalVolume = 0;
    let daysWithData = 0;
    
    // Iterate through the last 90 days
    for (let d = new Date(ninetyDaysAgo); d < currentDateObj; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      
      if (data.dailyData[dateStr] && data.dailyData[dateStr][symbol]) {
        const dayData = data.dailyData[dateStr][symbol];
        totalDarkPoolVolume += dayData.darkPoolVolume;
        totalVolume += dayData.totalVolume;
        daysWithData++;
      }
    }
    
    if (daysWithData === 0) {
      return {
        avgDailyDarkPoolVolume: null,
        avgDailyTotalVolume: null,
        daysWithData: 0
      };
    }
    
    return {
      avgDailyDarkPoolVolume: totalDarkPoolVolume / daysWithData,
      avgDailyTotalVolume: totalVolume / daysWithData,
      daysWithData
    };
  } catch (error) {
    console.error('Error getting 90-day average:', error);
    return {
      avgDailyDarkPoolVolume: null,
      avgDailyTotalVolume: null,
      daysWithData: 0
    };
  }
}

// Get all stocks with dark pool data for today
function getAllStocksData(date) {
  try {
    const data = loadData();
    
    if (!data.dailyData[date]) {
      return [];
    }
    
    return Object.entries(data.dailyData[date]).map(([symbol, dayData]) => ({
      symbol,
      dark_pool_volume: dayData.darkPoolVolume,
      total_volume: dayData.totalVolume,
      dark_pool_ratio: dayData.darkPoolRatio
    })).sort((a, b) => b.dark_pool_volume - a.dark_pool_volume);
  } catch (error) {
    console.error('Error getting all stocks data:', error);
    return [];
  }
}

// Get symbols we've tracked before
function getTrackedSymbols() {
  try {
    const data = loadData();
    return data.trackedSymbols.sort();
  } catch (error) {
    console.error('Error getting tracked symbols:', error);
    return [];
  }
}

// Load data from file
function loadData() {
  try {
    if (!fs.existsSync(dataPath)) {
      return { dailyData: {}, trackedSymbols: [] };
    }
    const fileContent = fs.readFileSync(dataPath, 'utf8');
    return JSON.parse(fileContent);
  } catch (error) {
    console.error('Error loading data:', error);
    return { dailyData: {}, trackedSymbols: [] };
  }
}

// Save data to file
function saveData(data) {
  try {
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving data:', error);
  }
}

module.exports = {
  initializeDataStore,
  saveDailyData,
  get90DayAverage,
  getAllStocksData,
  getTrackedSymbols
};

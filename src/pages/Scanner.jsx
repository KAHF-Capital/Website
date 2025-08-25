import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, TrendingUp, Zap, Filter, Menu, X, ArrowRight, BookOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Footer from './Footer';

export default function Scanner() {
  const [opportunities, setOpportunities] = useState([]);
  const [filteredOpportunities, setFilteredOpportunities] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("profit");
  const [minProfit, setMinProfit] = useState("");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';
  
  const mockOpportunities = [
    { id: 1, symbol: "AAPL", strategy_type: "Long Straddle", vol_spread: 4.2, implied_vol: 0.28, realized_vol: 0.235, expected_profit: 1250, confidence: 87, risk_level: 'medium', dark_pool_activity: 450 },
    { id: 2, symbol: "TSLA", strategy_type: "Reverse Iron Condor", vol_spread: -6.8, implied_vol: 0.65, realized_vol: 0.72, expected_profit: 2100, confidence: 92, risk_level: 'high', dark_pool_activity: 320 },
    { id: 3, symbol: "SPY", strategy_type: "Calendar Spread", vol_spread: 2.1, implied_vol: 0.18, realized_vol: 0.16, expected_profit: 850, confidence: 78, risk_level: 'low', dark_pool_activity: 280 },
    { id: 4, symbol: "NVDA", strategy_type: "Long Straddle", vol_spread: 5.3, implied_vol: 0.42, realized_vol: 0.365, expected_profit: 1680, confidence: 85, risk_level: 'medium', dark_pool_activity: 520 },
    { id: 5, symbol: "QQQ", strategy_type: "Iron Condor", vol_spread: -3.2, implied_vol: 0.22, realized_vol: 0.255, expected_profit: 920, confidence: 81, risk_level: 'low', dark_pool_activity: 190 },
    { id: 6, symbol: "AMZN", strategy_type: "Volatility Spread", vol_spread: 3.7, implied_vol: 0.35, realized_vol: 0.315, expected_profit: 1425, confidence: 89, risk_level: 'medium', dark_pool_activity: 380 }
  ];

  const fetchOpportunities = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/opportunities`);
      if (response.ok) {
        const data = await response.json();
        setOpportunities(data);
      } else {
        // Fallback to mock data if API is not available
        console.warn('API not available, using mock data');
        setOpportunities(mockOpportunities);
      }
    } catch (error) {
      console.error('Error fetching opportunities:', error);
      // Fallback to mock data
      setOpportunities(mockOpportunities);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOpportunities();
  }, []);

  useEffect(() => {
    let filtered = opportunities;
    if (searchTerm) {
      filtered = filtered.filter(opp => opp.symbol.toLowerCase().includes(searchTerm.toLowerCase()) || opp.strategy_type.toLowerCase().includes(searchTerm.toLowerCase()));
    }
    if (minProfit) {
      filtered = filtered.filter(opp => opp.expected_profit >= parseInt(minProfit));
    }
    switch (sortBy) {
      case "profit": filtered.sort((a, b) => b.expected_profit - a.expected_profit); break;
      case "confidence": filtered.sort((a, b) => b.confidence - a.confidence); break;
      case "vol_spread": filtered.sort((a, b) => Math.abs(b.vol_spread) - Math.abs(a.vol_spread)); break;
      case "dark_pool": filtered.sort((a, b) => b.dark_pool_activity - a.dark_pool_activity); break;
      default: break;
    }
    setFilteredOpportunities(filtered);
  }, [opportunities, searchTerm, sortBy, minProfit]);

  const getRiskColor = (riskLevel) => {
    switch (riskLevel) {
      case 'high': return 'bg-red-100 text-red-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-200 sticky top-0 bg-white/80 backdrop-blur-sm z-50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <img 
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/87af3bb58_image.png" 
                alt="KAHF Capital Logo" 
                className="h-10 w-auto"
              />
              <div>
                <h1 className="text-xl font-bold text-gray-900">KAHF Capital</h1>
                <p className="text-gray-600 text-sm">Volatility Trading Education</p>
              </div>
            </div>
            <nav className="hidden sm:flex space-x-8">
              <Link to="/" className="text-gray-900 hover:text-green-600 transition-colors font-medium">
                Home
              </Link>
              <Link to="/learning" className="text-gray-900 hover:text-green-600 transition-colors font-medium">
                Learning Modules
              </Link>
              <Link to="/scanner" className="text-green-600 font-medium">
                Scanner
              </Link>
            </nav>
            <div className="sm:hidden">
              <button className="p-2 text-gray-900 hover:text-green-600 touch-manipulation" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
                {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            </div>
          </div>
        </div>
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="sm:hidden overflow-hidden"
            >
              <nav className="flex flex-col items-center space-y-1 p-3 border-t border-gray-200">
                <Link to="/" className="text-gray-900 hover:text-green-600 transition-colors font-medium w-full text-center py-3 rounded-md hover:bg-gray-100 touch-manipulation" onClick={() => setIsMobileMenuOpen(false)}>
                  Home
                </Link>
                <Link to="/learning" className="text-gray-900 hover:text-green-600 transition-colors font-medium w-full text-center py-3 rounded-md hover:bg-gray-100 touch-manipulation" onClick={() => setIsMobileMenuOpen(false)}>
                  Learning Modules
                </Link>
                <Link to="/scanner" className="text-green-600 font-medium w-full text-center py-3 rounded-md bg-green-50 touch-manipulation" onClick={() => setIsMobileMenuOpen(false)}>
                  Scanner
                </Link>
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Scanner Header */}
      <section className="py-8 px-4 bg-gradient-to-r from-green-50 to-blue-50">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-gradient-to-r from-green-600 to-blue-600 rounded-lg flex items-center justify-center">
              <Zap className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Dark Pool Scanner</h1>
              <p className="text-gray-600">Real-time arbitrage opportunities based on dark pool activity</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-green-600">
            <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse"></div>
            <span>Live Scanning...</span>
          </div>
        </div>
      </section>

      {/* Filters */}
      <section className="py-6 px-4 border-b border-gray-200">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search symbols or strategies..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <input
                type="number"
                placeholder="Min Profit ($)"
                value={minProfit}
                onChange={(e) => setMinProfit(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent sm:w-40"
              />
              <select 
                value={sortBy} 
                onChange={(e) => setSortBy(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent sm:w-48"
              >
                <option value="profit">Expected Profit</option>
                <option value="confidence">Confidence</option>
                <option value="vol_spread">Vol Spread</option>
                <option value="dark_pool">Dark Pool Activity</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* Opportunities Grid */}
      <section className="py-8 px-4">
        <div className="max-w-7xl mx-auto">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array(6).fill(0).map((_, i) => (
                <div key={i} className="border border-gray-200 rounded-lg p-6 animate-pulse">
                  <div className="h-6 bg-gray-200 rounded w-1/2 mb-4"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/3 mb-6"></div>
                  <div className="space-y-3">
                    <div className="h-3 bg-gray-200 rounded w-full"></div>
                    <div className="h-3 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredOpportunities.length > 0 ? (
                filteredOpportunities.map((opportunity) => (
                  <div key={opportunity.id} className="border border-gray-200 hover:shadow-lg transition-shadow duration-200 bg-white rounded-lg p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-gray-900 text-lg">{opportunity.symbol}</h3>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRiskColor(opportunity.risk_level)}`}>
                            {opportunity.risk_level} risk
                          </span>
                        </div>
                        <p className="text-gray-600">{opportunity.strategy_type}</p>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-1 mb-1">
                          <TrendingUp className="w-4 h-4 text-green-600" />
                          <span className="text-green-600 font-bold text-lg">
                            {opportunity.expected_profit > 0 ? '+' : ''}${opportunity.expected_profit}
                          </span>
                        </div>
                        <p className="text-gray-500 text-sm">Expected Profit</p>
                      </div>
                    </div>
                    
                    <div className="space-y-2 mb-4">
                      <div className="flex justify-between">
                        <span className="text-gray-600 text-sm">Vol Spread</span>
                        <span className={`font-medium ${opportunity.vol_spread > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {opportunity.vol_spread > 0 ? '+' : ''}{opportunity.vol_spread.toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600 text-sm">Implied Vol</span>
                        <span className="text-gray-900">{(opportunity.implied_vol * 100).toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600 text-sm">Realized Vol</span>
                        <span className="text-gray-900">{(opportunity.realized_vol * 100).toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600 text-sm">Confidence</span>
                        <span className="text-blue-600">{opportunity.confidence}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600 text-sm">Dark Pool Activity</span>
                        <span className="text-purple-600 font-medium">{opportunity.dark_pool_activity}% above avg</span>
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <button className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">
                        Execute Trade
                      </button>
                      <button className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
                        Details
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="col-span-full text-center py-16">
                  <p className="text-xl text-gray-500 mb-4">No opportunities match your criteria.</p>
                  <p className="text-gray-400">Try adjusting your search or filter settings.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </div>
  );
}

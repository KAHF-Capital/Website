import React, { useState, useEffect } from "react";

// Safe component imports with fallbacks
const SafeBadge = ({ children, variant = 'default', className = '', ...props }) => {
  try {
    const { Badge } = require("../components/ui/badge");
    return <Badge variant={variant} className={className} {...props}>{children}</Badge>;
  } catch (error) {
    return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`} {...props}>{children}</span>;
  }
};

const SafeButton = ({ children, variant = 'default', size = 'default', className = '', ...props }) => {
  try {
    const { Button } = require("../components/ui/button");
    return <Button variant={variant} size={size} className={className} {...props}>{children}</Button>;
  } catch (error) {
    return <button className={`inline-flex items-center justify-center rounded-md text-sm font-medium ${className}`} {...props}>{children}</button>;
  }
};

const SafeInput = ({ className = '', type = 'text', ...props }) => {
  try {
    const { Input } = require("../components/ui/input");
    return <Input className={className} type={type} {...props} />;
  } catch (error) {
    return <input className={`flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ${className}`} type={type} {...props} />;
  }
};

// Safe icon imports
const SafeSearch = () => {
  try {
    const { Search } = require("lucide-react");
    return <Search className="h-4 w-4" />;
  } catch (error) {
    return <span>🔍</span>;
  }
};

const SafeTrendingUp = () => {
  try {
    const { TrendingUp } = require("lucide-react");
    return <TrendingUp className="h-4 w-4" />;
  } catch (error) {
    return <span>📈</span>;
  }
};

const SafeZap = () => {
  try {
    const { Zap } = require("lucide-react");
    return <Zap className="h-4 w-4" />;
  } catch (error) {
    return <span>⚡</span>;
  }
};

const SafeFilter = () => {
  try {
    const { Filter } = require("lucide-react");
    return <Filter className="h-4 w-4" />;
  } catch (error) {
    return <span>🔧</span>;
  }
};

const SafeRefreshCw = () => {
  try {
    const { RefreshCw } = require("lucide-react");
    return <RefreshCw className="h-4 w-4" />;
  } catch (error) {
    return <span>🔄</span>;
  }
};

const SafeAlertTriangle = () => {
  try {
    const { AlertTriangle } = require("lucide-react");
    return <AlertTriangle className="h-4 w-4" />;
  } catch (error) {
    return <span>⚠️</span>;
  }
};

const SafeInfo = () => {
  try {
    const { Info } = require("lucide-react");
    return <Info className="h-4 w-4" />;
  } catch (error) {
    return <span>ℹ️</span>;
  }
};

const SafeX = () => {
  try {
    const { X } = require("lucide-react");
    return <X className="h-4 w-4" />;
  } catch (error) {
    return <span>✕</span>;
  }
};

// All Data Modal Component
const AllDataModal = ({ isOpen, onClose, data }) => {
  if (!isOpen || !data) return null;

  const formatCurrency = (amount) => `$${amount?.toLocaleString() || 'N/A'}`;
  const formatPercentage = (value) => `${((value || 0) * 100).toFixed(1)}%`;
  const formatNumber = (num) => num?.toLocaleString() || 'N/A';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Complete Dark Pool Analysis</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <SafeX />
            </button>
          </div>
          
          <div className="space-y-6">
            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-900">Total Analyzed</h3>
                <p className="text-2xl font-bold text-blue-800">{data.length}</p>
                <p className="text-sm text-blue-700">Stocks</p>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h3 className="font-semibold text-green-900">High Activity</h3>
                <p className="text-2xl font-bold text-green-800">
                  {data.filter(item => item.status === 'high_activity').length}
                </p>
                <p className="text-sm text-green-700">2x+ Average</p>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <h3 className="font-semibold text-yellow-900">Normal Activity</h3>
                <p className="text-2xl font-bold text-yellow-800">
                  {data.filter(item => item.status === 'normal_activity').length}
                </p>
                <p className="text-sm text-yellow-700">Below 2x Average</p>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h3 className="font-semibold text-red-900">No Data</h3>
                <p className="text-2xl font-bold text-red-800">
                  {data.filter(item => item.status === 'no_data').length}
                </p>
                <p className="text-sm text-red-700">Unavailable</p>
              </div>
            </div>

            {/* Detailed Analysis Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full bg-white border border-gray-200 rounded-lg">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Symbol</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Current Price</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Today's Dark Pool</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">90-Day Avg</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Activity Ratio</th>

                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {data.map((item, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.symbol}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          item.status === 'high_activity' ? 'bg-green-100 text-green-800' :
                          item.status === 'normal_activity' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {item.status === 'high_activity' ? 'High Activity' :
                           item.status === 'normal_activity' ? 'Normal Activity' : 'No Data'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">{formatCurrency(item.current_price)}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{formatNumber(item.today_dark_pool_volume)}</td>
                                              <td className="px-4 py-3 text-sm text-gray-900">{item.avg_90day_dark_pool_volume ? formatNumber(item.avg_90day_dark_pool_volume) : 'N/A'}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {item.activity_ratio ? `${item.activity_ratio.toFixed(1)}x` : 'N/A'}
                        </td>
                      
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Legend */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Dark Pool Analysis Legend</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 mr-2">
                    High Activity
                  </span>
                  <span className="text-gray-700">Today's volume ≥ 2x 90-day average</span>
                </div>
                <div>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 mr-2">
                    Normal Activity
                  </span>
                  <span className="text-gray-700">Today's volume &lt; 2x 90-day average</span>
                </div>
                <div>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 mr-2">
                    No Data
                  </span>
                  <span className="text-gray-700">Insufficient dark pool data available</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Dark Pool Info Modal Component
const DarkPoolInfoModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">What is Dark Pool Activity?</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <SafeX />
            </button>
          </div>
          
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">🌊 Dark Pools Explained</h3>
              <p className="text-gray-700 text-sm">
                Dark pools are private exchanges where institutional investors trade large blocks of shares 
                away from public markets. These trades are not visible to the public until after they're completed.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-gray-900 mb-2">📊 Why It Matters</h3>
              <ul className="text-gray-700 text-sm space-y-1">
                <li>• <strong>Institutional Activity:</strong> High dark pool volume indicates large institutional trades</li>
                <li>• <strong>Price Impact:</strong> These trades can significantly affect stock prices</li>
                <li>• <strong>Volatility Signals:</strong> Spikes in dark pool activity often precede price movements</li>
                <li>• <strong>Market Sentiment:</strong> Shows what "smart money" is doing</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-gray-900 mb-2">🎯 Trading Implications</h3>
              <p className="text-gray-700 text-sm">
                When dark pool activity increases significantly, it often signals that institutions are 
                positioning for a major move. This can be a leading indicator for volatility expansion, 
                making it valuable for straddle strategies.
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-semibold text-blue-900 mb-2">💡 Pro Tip</h4>
              <p className="text-blue-800 text-sm">
                Dark pool data is one of the few ways retail traders can see what institutional investors 
                are doing in real-time. High dark pool ratios (10%+) often indicate significant institutional interest.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// SMS Subscription Modal Component
const SMSModal = ({ isOpen, onClose, phoneNumber, setPhoneNumber, onSubscribe }) => {
  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubscribe(phoneNumber);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">SMS Alerts</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <SafeX />
            </button>
          </div>
          
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-blue-900 mb-2">📱 Get Instant Alerts</h3>
              <p className="text-blue-800 text-sm">
                Receive text messages whenever we detect new straddle opportunities with IV &lt; HV.
                Never miss a profitable trading signal again.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone Number
                </label>
                <SafeInput
                  type="tel"
                  placeholder="(555) 123-4567"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="w-full"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  We'll only send you alerts for new opportunities
                </p>
              </div>

              <SafeButton type="submit" className="w-full">
                Subscribe to Alerts
              </SafeButton>
            </form>

            <div className="text-xs text-gray-500 text-center">
              Standard messaging rates may apply. You can unsubscribe at any time.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// How It Works Modal Component
const HowItWorksModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">How It Works</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <SafeX />
            </button>
          </div>
          
          <div className="space-y-4">
            <div>
                             <h3 className="text-lg font-semibold text-gray-900 mb-2">🔍 Dark Pool Detection</h3>
               <p className="text-gray-700 text-sm">
                 Monitors dark pool trades and compares today's activity to the 90-day average. 
                 When activity spikes above 200% of normal, it signals institutional positioning.
               </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">📊 Volatility Analysis</h3>
              <p className="text-gray-700 text-sm">
                Calculates the difference between implied volatility (what options are pricing in) and realized volatility (actual price movement). 
                Large spreads indicate potential opportunities.
              </p>
            </div>

            <div>
                             <h3 className="text-lg font-semibold text-gray-900 mb-2">🎯 Strategy</h3>
               <p className="text-gray-700 text-sm">
                 <strong>Long Straddle:</strong> Buy both call and put options at the same strike price. 
                 Profits when the stock makes a big move in either direction.
               </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-semibold text-blue-900 mb-2">💡 Key Insight</h4>
              <p className="text-blue-800 text-sm">
                When dark pool activity spikes, institutions are positioning for major moves. 
                This scanner catches the same signals hedge funds use.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Dark Pool Activity Card
const SafeOpportunityCard = ({ opportunity }) => {
  const [showDetails, setShowDetails] = useState(false);

  try {
    if (!opportunity || typeof opportunity !== 'object') {
      return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="text-center text-gray-500">
            <p>Invalid dark pool data</p>
          </div>
        </div>
      );
    }

    const { 
      symbol = 'N/A', 
      current_price = 0,
      today_dark_pool_volume = 0,
      today_total_volume = 0,
      today_dark_pool_ratio = 0,
      avg_90day_dark_pool_volume = 0,
      avg_90day_total_volume = 0,
      activity_ratio = 0,
      status = 'normal_activity'
    } = opportunity;

    const formatCurrency = (amount) => `$${amount?.toLocaleString() || 'N/A'}`;
    const formatNumber = (num) => num?.toLocaleString() || 'N/A';

    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-bold text-gray-900">{symbol}</h3>
            <p className="text-sm text-gray-600">Dark Pool Activity</p>
          </div>
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
            status === 'high_activity' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
          }`}>
            {status === 'high_activity' ? 'High Activity' : 'Normal Activity'}
          </span>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="text-center">
            <p className="text-lg font-semibold text-gray-900">{formatNumber(today_dark_pool_volume)}</p>
            <p className="text-xs text-gray-600">Today's Dark Pool</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-blue-600">{activity_ratio ? `${activity_ratio.toFixed(1)}x` : 'N/A'}</p>
            <p className="text-xs text-gray-600">Activity Ratio</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-2">
          <SafeButton 
            className="flex-1" 
            size="sm"
            onClick={() => setShowDetails(true)}
          >
            View Details
          </SafeButton>
        </div>

        {/* Details Modal */}
        {showDetails && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-gray-900">{symbol} - Dark Pool Analysis</h3>
                  <button onClick={() => setShowDetails(false)} className="text-gray-400 hover:text-gray-600">
                    <SafeX />
                  </button>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">📊 Stock Information</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Current Price:</span>
                        <span className="font-medium">{formatCurrency(current_price)}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">🌊 Today's Dark Pool Activity</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Dark Pool Volume:</span>
                        <span className="font-medium">{formatNumber(today_dark_pool_volume)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Total Volume:</span>
                        <span className="font-medium">{formatNumber(today_total_volume)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Dark Pool %:</span>
                        <span className="font-medium">{today_dark_pool_ratio ? `${today_dark_pool_ratio.toFixed(1)}%` : 'N/A'}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">📈 90-Day Historical Average</h4>
                    <div className="space-y-2 text-sm">
                                             <div className="flex justify-between">
                         <span>Avg Dark Pool Volume:</span>
                         <span className="font-medium">{avg_90day_dark_pool_volume ? formatNumber(avg_90day_dark_pool_volume) : 'N/A'}</span>
                       </div>
                       <div className="flex justify-between">
                         <span>Avg Total Volume:</span>
                         <span className="font-medium">{avg_90day_total_volume ? formatNumber(avg_90day_total_volume) : 'N/A'}</span>
                       </div>
                       <div className="flex justify-between">
                         <span>Activity Ratio:</span>
                         <span className={`font-medium ${activity_ratio && activity_ratio >= 2 ? 'text-green-600' : 'text-yellow-600'}`}>
                           {activity_ratio ? `${activity_ratio.toFixed(1)}x` : 'N/A'}
                         </span>
                       </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">🎯 Analysis</h4>
                    <p className="text-sm text-gray-700">
                      {activity_ratio && activity_ratio >= 2 
                        ? `High dark pool activity detected! Today's volume is ${activity_ratio.toFixed(1)}x the 90-day average, indicating significant institutional interest.`
                        : activity_ratio 
                          ? `Normal dark pool activity. Today's volume is ${activity_ratio.toFixed(1)}x the 90-day average.`
                          : `Unable to calculate activity ratio due to insufficient historical data.`
                      }
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  } catch (error) {
    console.error('Error rendering dark pool card:', error);
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="text-center text-gray-500">
          <p>Error loading dark pool data</p>
        </div>
      </div>
    );
  }
};

export default function Scanner() {
  const [opportunities, setOpportunities] = useState([]);
  const [filteredOpportunities, setFilteredOpportunities] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [showAllData, setShowAllData] = useState(false);
  const [allAnalysisData, setAllAnalysisData] = useState([]);
  const [showSMSModal, setShowSMSModal] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [smsSubscribed, setSmsSubscribed] = useState(false);
  const [showDarkPoolInfo, setShowDarkPoolInfo] = useState(false);
  const [activeTab, setActiveTab] = useState('top25'); // 'top25' or 'all'

  useEffect(() => {
      fetchOpportunities();
  }, [activeTab]);

  const handleSymbolSearch = async () => {
    if (!searchTerm.trim()) {
      return;
    }
    
    setIsSearching(true);
    await fetchOpportunities(searchTerm.trim().toUpperCase());
    setIsSearching(false);
  };

  const fetchOpportunities = async (symbol = null) => {
    try {
      setIsLoading(true);
      setError(null);
      
      let url;
      if (symbol) {
        url = `/api/opportunities?symbol=${encodeURIComponent(symbol)}`;
      } else if (activeTab === 'all') {
        url = '/api/all-stocks';
      } else {
        url = '/api/opportunities';
      }
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (response.ok && Array.isArray(data)) {
        const validOpportunities = data.filter(opp => opp && typeof opp === 'object');
        setOpportunities(validOpportunities);
      } else {
        const errorMessage = data?.error || 'Unable to load dark pool data';
        setError(errorMessage);
        setOpportunities([]);
      }
    } catch (error) {
      console.error('Error fetching opportunities:', error);
      setError('Network error. Please check your connection and try again.');
      setOpportunities([]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAllAnalysisData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch('/api/opportunities?all_data=true');
      const data = await response.json();
      
      if (response.ok && data.dark_pool_data) {
        setAllAnalysisData(data.dark_pool_data);
        setShowAllData(true);
      } else {
        const errorMessage = data?.error || 'Unable to load dark pool data';
        setError(errorMessage);
      }
    } catch (error) {
      console.error('Error fetching dark pool data:', error);
      setError('Network error. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSMSSubscribe = async (phone) => {
    try {
      const response = await fetch('/api/sms-subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phoneNumber: phone }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setSmsSubscribed(true);
        setShowSMSModal(false);
        setPhoneNumber("");
        // You could show a success message here
      } else {
        setError(data.error || 'Failed to subscribe to SMS alerts');
      }
    } catch (error) {
      console.error('Error subscribing to SMS:', error);
      setError('Failed to subscribe to SMS alerts');
    }
  };

  useEffect(() => {
    try {
      let filtered = Array.isArray(opportunities) ? opportunities : [];

      // Sort by dark pool volume (highest first)
    filtered.sort((a, b) => {
        if (!a || !b) return 0;
        return (b.today_dark_pool_volume || 0) - (a.today_dark_pool_volume || 0);
    });

    setFilteredOpportunities(filtered);
    } catch (error) {
      console.error('Error filtering dark pool data:', error);
      setFilteredOpportunities([]);
    }
  }, [opportunities]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading scanner...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
            <h1 className="text-3xl font-bold text-gray-900">Dark Pool Scanner</h1>
            <p className="mt-1 text-gray-600">+Straddle Trading Signals</p>
            </div>
            <div className="flex items-center space-x-3">
              <SafeBadge className="flex items-center space-x-1 bg-green-100 text-green-800 border-green-200">
                <SafeZap />
                <span>Live Data</span>
              </SafeBadge>
              <SafeBadge variant="outline" className="flex items-center space-x-1">
                <SafeTrendingUp />
                <span>{Array.isArray(filteredOpportunities) ? filteredOpportunities.length : 0} Opportunities</span>
              </SafeBadge>
              <SafeButton
                variant="outline"
                size="sm"
                onClick={() => setShowSMSModal(true)}
                className="flex items-center space-x-1"
              >
                <SafeZap />
                <span>SMS Alerts</span>
              </SafeButton>
              <SafeButton
                variant="outline"
                size="sm"
                onClick={() => setShowHowItWorks(true)}
                className="flex items-center space-x-1"
              >
                <SafeInfo />
                <span>How It Works</span>
              </SafeButton>
              <SafeButton
                variant="outline"
                size="sm"
                onClick={fetchOpportunities}
                className="flex items-center space-x-1"
              >
                <SafeRefreshCw />
                <span>Refresh</span>
              </SafeButton>
            </div>
          </div>
        </div>
      </div>

      {/* How It Works Modal */}
      <HowItWorksModal isOpen={showHowItWorks} onClose={() => setShowHowItWorks(false)} />

      {/* All Data Modal */}
      <AllDataModal 
        isOpen={showAllData} 
        onClose={() => setShowAllData(false)} 
        data={allAnalysisData} 
      />

      {/* SMS Modal */}
      <SMSModal 
        isOpen={showSMSModal} 
        onClose={() => setShowSMSModal(false)}
        phoneNumber={phoneNumber}
        setPhoneNumber={setPhoneNumber}
        onSubscribe={handleSMSSubscribe}
      />

      {/* Dark Pool Info Modal */}
      <DarkPoolInfoModal 
        isOpen={showDarkPoolInfo} 
        onClose={() => setShowDarkPoolInfo(false)}
      />

      {/* Error Display */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center">
              <SafeAlertTriangle />
              <div className="flex-1 ml-3">
                <h3 className="text-sm font-medium text-red-800">Service Temporarily Unavailable</h3>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
              <SafeButton
                variant="outline"
                size="sm"
                onClick={fetchOpportunities}
                className="flex items-center space-x-1"
              >
                <SafeRefreshCw />
                <span>Retry</span>
              </SafeButton>
            </div>
          </div>
        </div>
      )}

              {/* Tabs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
            <div className="flex space-x-4 mb-6">
              <button
                onClick={() => setActiveTab('top25')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  activeTab === 'top25'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Top 25 by Dark Pool Activity
              </button>
              <button
                onClick={() => setActiveTab('all')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  activeTab === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All Tracked Stocks
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Symbol Search */}
              <div className="relative">
                <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                  <SafeSearch />
                </div>
                <SafeInput
                  placeholder="Enter symbol (e.g., AAPL, TSLA)..."
                  value={searchTerm || ''}
                  onChange={(e) => setSearchTerm(e.target.value || '')}
                  onKeyPress={(e) => e.key === 'Enter' && handleSymbolSearch()}
                  className="pl-10"
                />
              </div>

              {/* Search Button */}
              <SafeButton
                onClick={handleSymbolSearch}
                disabled={isSearching || !searchTerm.trim()}
                className="flex items-center space-x-2"
              >
                {isSearching ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Searching...</span>
                  </>
                ) : (
                  <>
                    <SafeSearch />
                    <span>Search Symbol</span>
                  </>
                )}
              </SafeButton>

              {/* Show All Data */}
              <SafeButton
                variant="outline"
                onClick={fetchAllAnalysisData}
                className="flex items-center space-x-2"
              >
                <SafeTrendingUp />
                <span>Show All Data</span>
              </SafeButton>
            </div>
          </div>

        {/* Search Results Header */}
        {searchTerm && Array.isArray(filteredOpportunities) && filteredOpportunities.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-900">
              Dark Pool Activity for {searchTerm.toUpperCase()}
            </h2>
            <p className="text-gray-600 mt-1">
              Found {filteredOpportunities.length} result{filteredOpportunities.length !== 1 ? 's' : ''} with dark pool data
            </p>
          </div>
        )}

        {/* Opportunities Grid */}
        {!error && Array.isArray(filteredOpportunities) && filteredOpportunities.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredOpportunities.map((opportunity, index) => (
              <SafeOpportunityCard key={opportunity?.id || index} opportunity={opportunity} />
          ))}
        </div>
        )}

        {!error && (!Array.isArray(filteredOpportunities) || filteredOpportunities.length === 0) && (!Array.isArray(opportunities) || opportunities.length === 0) && (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-4">
              <SafeSearch />
            </div>
                            <h3 className="text-lg font-medium text-gray-900 mb-2">No high dark pool activity found</h3>
            <p className="text-gray-600">
              {searchTerm ? 
                `No dark pool data found for ${searchTerm.toUpperCase()}. This could mean no trades today or insufficient data.` :
                'No high dark pool activity is currently detected. Check back later for new activity.'
              }
            </p>
          </div>
        )}

        {!error && Array.isArray(filteredOpportunities) && filteredOpportunities.length === 0 && Array.isArray(opportunities) && opportunities.length > 0 && (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-4">
              <SafeSearch />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No dark pool activity matches your criteria</h3>
            <p className="text-gray-600">Try searching for a different symbol or check back later.</p>
          </div>
        )}
        </div>
    </div>
  );
}

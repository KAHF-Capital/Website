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

// Safe OpportunityCard component
const SafeOpportunityCard = ({ opportunity }) => {
  try {
    const OpportunityCard = require("../components/trading/OpportunityCard").default;
    return <OpportunityCard opportunity={opportunity} />;
  } catch (error) {
    // Fallback card
    if (!opportunity || typeof opportunity !== 'object') {
      return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="text-center text-gray-500">
            <p>Invalid opportunity data</p>
          </div>
        </div>
      );
    }

    const { symbol = 'N/A', strategy_type = 'Unknown', expected_profit = 0, confidence = 0, risk_level = 'medium' } = opportunity;

    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-bold text-gray-900">{symbol}</h3>
            <p className="text-sm text-gray-600">{strategy_type}</p>
          </div>
          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-800">
            {risk_level} Risk
          </span>
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold text-gray-900">${expected_profit}</p>
          <p className="text-xs text-gray-600">Expected Profit</p>
        </div>
        <div className="text-center mt-2">
          <p className="text-lg font-semibold text-blue-600">{confidence}%</p>
          <p className="text-xs text-gray-600">Confidence</p>
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
  const [sortBy, setSortBy] = useState("profit");
  const [minProfit, setMinProfit] = useState("");

  useEffect(() => {
    fetchOpportunities();
  }, []);

  const fetchOpportunities = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch('/api/opportunities');
      const data = await response.json();
      
      if (response.ok && Array.isArray(data)) {
        const validOpportunities = data.filter(opp => opp && typeof opp === 'object');
        setOpportunities(validOpportunities);
      } else {
        const errorMessage = data?.error || 'Unable to load trading opportunities';
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

  useEffect(() => {
    try {
      let filtered = Array.isArray(opportunities) ? opportunities : [];

      if (searchTerm && searchTerm.trim()) {
        filtered = filtered.filter(opp => 
          opp && 
          opp.symbol && 
          typeof opp.symbol === 'string' &&
          opp.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
          opp && 
          opp.strategy_type && 
          typeof opp.strategy_type === 'string' &&
          opp.strategy_type.toLowerCase().includes(searchTerm.toLowerCase())
        );
      }

      if (minProfit && minProfit.trim()) {
        const minProfitNum = parseInt(minProfit);
        if (!isNaN(minProfitNum)) {
          filtered = filtered.filter(opp => opp && typeof opp.expected_profit === 'number' && opp.expected_profit >= minProfitNum);
        }
      }

      filtered.sort((a, b) => {
        if (!a || !b) return 0;
        
        switch (sortBy) {
          case "profit":
            return (b.expected_profit || 0) - (a.expected_profit || 0);
          case "confidence":
            return (b.confidence || 0) - (a.confidence || 0);
          case "vol_spread":
            return Math.abs(b.vol_spread || 0) - Math.abs(a.vol_spread || 0);
          default:
            return 0;
        }
      });

      setFilteredOpportunities(filtered);
    } catch (error) {
      console.error('Error filtering opportunities:', error);
      setFilteredOpportunities([]);
    }
  }, [opportunities, searchTerm, sortBy, minProfit]);

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
              <h1 className="text-3xl font-bold text-gray-900">Trading Scanner</h1>
              <p className="mt-1 text-gray-600">Discover high-probability trading opportunities</p>
            </div>
            <div className="flex items-center space-x-3">
              <SafeBadge variant="outline" className="flex items-center space-x-1">
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

      {/* Filters */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div className="relative">
              <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                <SafeSearch />
              </div>
              <SafeInput
                placeholder="Search symbols..."
                value={searchTerm || ''}
                onChange={(e) => setSearchTerm(e.target.value || '')}
                className="pl-10"
              />
            </div>

            {/* Min Profit Filter */}
            <SafeInput
              placeholder="Min profit ($)"
              value={minProfit || ''}
              onChange={(e) => setMinProfit(e.target.value || '')}
              type="number"
            />

            {/* Clear Filters */}
            <SafeButton
              variant="outline"
              onClick={() => {
                setSearchTerm("");
                setMinProfit("");
                setSortBy("profit");
              }}
              className="flex items-center space-x-2"
            >
              <SafeFilter />
              <span>Clear Filters</span>
            </SafeButton>
          </div>
        </div>

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
            <h3 className="text-lg font-medium text-gray-900 mb-2">No opportunities found</h3>
            <p className="text-gray-600">No trading opportunities are currently available. Check back later for new opportunities.</p>
          </div>
        )}

        {!error && Array.isArray(filteredOpportunities) && filteredOpportunities.length === 0 && Array.isArray(opportunities) && opportunities.length > 0 && (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-4">
              <SafeSearch />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No opportunities match your filters</h3>
            <p className="text-gray-600">Try adjusting your search criteria to see more results.</p>
          </div>
        )}
      </div>
    </div>
  );
}

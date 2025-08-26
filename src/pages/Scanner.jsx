import React, { useState, useEffect } from "react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Search, TrendingUp, Zap, Filter, Settings } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";

import OpportunityCard from "../components/trading/OpportunityCard";
import ApiKeyInput from "../components/ApiKeyInput";

export default function Scanner() {
  const [opportunities, setOpportunities] = useState([]);
  const [filteredOpportunities, setFilteredOpportunities] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("profit");
  const [minProfit, setMinProfit] = useState("");
  const [isApiInitialized, setIsApiInitialized] = useState(false);
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);

  // Mock data for opportunities
  const mockOpportunities = [
    {
      id: 1,
      symbol: "AAPL",
      strategy_type: "Long Volatility Play",
      vol_spread: 4.2,
      implied_vol: 0.28,
      realized_vol: 0.235,
      expected_profit: 1250,
      confidence: 87,
      risk_level: "medium"
    },
    {
      id: 2,
      symbol: "TSLA", 
      strategy_type: "Vol Crush Trade",
      vol_spread: -6.8,
      implied_vol: 0.65,
      realized_vol: 0.72,
      expected_profit: 2100,
      confidence: 92,
      risk_level: "high"
    },
    {
      id: 3,
      symbol: "SPY",
      strategy_type: "Calendar Spread",
      vol_spread: 2.1,
      implied_vol: 0.18,
      realized_vol: 0.16,
      expected_profit: 850,
      confidence: 78,
      risk_level: "low"
    },
    {
      id: 4,
      symbol: "NVDA",
      strategy_type: "Long Straddle",
      vol_spread: 5.3,
      implied_vol: 0.42,
      realized_vol: 0.365,
      expected_profit: 1680,
      confidence: 85,
      risk_level: "medium"
    },
    {
      id: 5,
      symbol: "QQQ",
      strategy_type: "Iron Condor",
      vol_spread: -3.2,
      implied_vol: 0.22,
      realized_vol: 0.255,
      expected_profit: 920,
      confidence: 81,
      risk_level: "low"
    },
    {
      id: 6,
      symbol: "AMZN",
      strategy_type: "Volatility Spread",
      vol_spread: 3.7,
      implied_vol: 0.35,
      realized_vol: 0.315,
      expected_profit: 1425,
      confidence: 89,
      risk_level: "medium"
    }
  ];

  useEffect(() => {
    // Check if API is initialized
    const storedApiKey = localStorage.getItem('polygon_api_key');
    if (storedApiKey) {
      setIsApiInitialized(true);
      fetchOpportunities();
    } else {
      setIsLoading(false);
    }
  }, []);

  const fetchOpportunities = async () => {
    try {
      const response = await fetch('/api/opportunities');
      if (response.ok) {
        const data = await response.json();
        setOpportunities(data);
      } else {
        // Fallback to mock data if API fails
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

  const handleApiKeySet = (apiKey) => {
    setIsApiInitialized(true);
    setShowApiKeyInput(false);
    fetchOpportunities();
  };

  useEffect(() => {
    let filtered = opportunities;

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(opp => 
        opp.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
        opp.strategy_type.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filter by minimum profit
    if (minProfit) {
      filtered = filtered.filter(opp => opp.expected_profit >= parseInt(minProfit));
    }

    // Sort opportunities
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "profit":
          return b.expected_profit - a.expected_profit;
        case "confidence":
          return b.confidence - a.confidence;
        case "vol_spread":
          return Math.abs(b.vol_spread) - Math.abs(a.vol_spread);
        default:
          return 0;
      }
    });

    setFilteredOpportunities(filtered);
  }, [opportunities, searchTerm, sortBy, minProfit]);

  const getRiskColor = (risk) => {
    switch (risk) {
      case "low": return "bg-green-100 text-green-800";
      case "medium": return "bg-yellow-100 text-yellow-800";
      case "high": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

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

  if (!isApiInitialized) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <ApiKeyInput onApiKeySet={handleApiKeySet} />
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
              <Badge variant="outline" className="flex items-center space-x-1">
                <Zap className="h-4 w-4" />
                <span>Live Data</span>
              </Badge>
              <Badge variant="outline" className="flex items-center space-x-1">
                <TrendingUp className="h-4 w-4" />
                <span>{filteredOpportunities.length} Opportunities</span>
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowApiKeyInput(true)}
                className="flex items-center space-x-1"
              >
                <Settings className="h-4 w-4" />
                <span>Settings</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search symbols..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Sort By */}
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger>
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="profit">Expected Profit</SelectItem>
                <SelectItem value="confidence">Confidence</SelectItem>
                <SelectItem value="vol_spread">Volatility Spread</SelectItem>
              </SelectContent>
            </Select>

            {/* Min Profit Filter */}
            <Input
              placeholder="Min profit ($)"
              value={minProfit}
              onChange={(e) => setMinProfit(e.target.value)}
              type="number"
            />

            {/* Clear Filters */}
            <Button
              variant="outline"
              onClick={() => {
                setSearchTerm("");
                setMinProfit("");
                setSortBy("profit");
              }}
              className="flex items-center space-x-2"
            >
              <Filter className="h-4 w-4" />
              <span>Clear Filters</span>
            </Button>
          </div>
        </div>

        {/* Opportunities Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredOpportunities.map((opportunity) => (
            <OpportunityCard key={opportunity.id} opportunity={opportunity} />
          ))}
        </div>

        {filteredOpportunities.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-4">
              <Search className="h-12 w-12 mx-auto" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No opportunities found</h3>
            <p className="text-gray-600">Try adjusting your filters to see more results.</p>
          </div>
        )}
      </div>

      {/* API Key Input Modal */}
      {showApiKeyInput && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <ApiKeyInput 
              onApiKeySet={handleApiKeySet} 
              isInitialized={isApiInitialized}
            />
            <div className="mt-4 text-center">
              <Button
                variant="outline"
                onClick={() => setShowApiKeyInput(false)}
                className="w-full"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

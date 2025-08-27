import React, { useState, useEffect } from "react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Search, TrendingUp, Zap, Filter, RefreshCw, AlertTriangle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";

import OpportunityCard from "../components/trading/OpportunityCard";

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
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/opportunities');
      const data = await response.json();
      
      if (response.ok) {
        setOpportunities(data);
      } else {
        setError(data.error || 'Unable to load trading opportunities');
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
                onClick={fetchOpportunities}
                className="flex items-center space-x-1"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Refresh</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center">
              <AlertTriangle className="h-5 w-5 text-red-400 mr-3" />
              <div className="flex-1">
                <h3 className="text-sm font-medium text-red-800">Service Temporarily Unavailable</h3>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchOpportunities}
                className="flex items-center space-x-1"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Retry</span>
              </Button>
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
        {!error && (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredOpportunities.map((opportunity) => (
              <OpportunityCard key={opportunity.id} opportunity={opportunity} />
            ))}
          </div>
        )}

        {!error && filteredOpportunities.length === 0 && opportunities.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-4">
              <Search className="h-12 w-12 mx-auto" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No opportunities found</h3>
            <p className="text-gray-600">No trading opportunities are currently available. Check back later for new opportunities.</p>
          </div>
        )}

        {!error && filteredOpportunities.length === 0 && opportunities.length > 0 && (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-4">
              <Search className="h-12 w-12 mx-auto" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No opportunities match your filters</h3>
            <p className="text-gray-600">Try adjusting your search criteria to see more results.</p>
          </div>
        )}
      </div>
    </div>
  );
}

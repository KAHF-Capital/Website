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
      
      if (response.ok && Array.isArray(data)) {
        // Ensure data is an array and filter out any invalid entries
        const validOpportunities = data.filter(opp => opp && typeof opp === 'object');
        setOpportunities(validOpportunities);
      } else {
        // Handle API errors gracefully
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

      // Filter by search term
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

      // Filter by minimum profit
      if (minProfit && minProfit.trim()) {
        const minProfitNum = parseInt(minProfit);
        if (!isNaN(minProfitNum)) {
          filtered = filtered.filter(opp => opp && typeof opp.expected_profit === 'number' && opp.expected_profit >= minProfitNum);
        }
      }

      // Sort opportunities
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
              <Badge variant="outline" className="flex items-center space-x-1">
                <Zap className="h-4 w-4" />
                <span>Live Data</span>
              </Badge>
              <Badge variant="outline" className="flex items-center space-x-1">
                <TrendingUp className="h-4 w-4" />
                <span>{Array.isArray(filteredOpportunities) ? filteredOpportunities.length : 0} Opportunities</span>
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
                value={searchTerm || ''}
                onChange={(e) => setSearchTerm(e.target.value || '')}
                className="pl-10"
              />
            </div>

            {/* Sort By */}
            <Select value={sortBy || 'profit'} onValueChange={(value) => setSortBy(value || 'profit')}>
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
              value={minProfit || ''}
              onChange={(e) => setMinProfit(e.target.value || '')}
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
        {!error && Array.isArray(filteredOpportunities) && filteredOpportunities.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredOpportunities.map((opportunity, index) => (
              <OpportunityCard key={opportunity?.id || index} opportunity={opportunity} />
            ))}
          </div>
        )}

        {!error && (!Array.isArray(filteredOpportunities) || filteredOpportunities.length === 0) && (!Array.isArray(opportunities) || opportunities.length === 0) && (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-4">
              <Search className="h-12 w-12 mx-auto" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No opportunities found</h3>
            <p className="text-gray-600">No trading opportunities are currently available. Check back later for new opportunities.</p>
          </div>
        )}

        {!error && Array.isArray(filteredOpportunities) && filteredOpportunities.length === 0 && Array.isArray(opportunities) && opportunities.length > 0 && (
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

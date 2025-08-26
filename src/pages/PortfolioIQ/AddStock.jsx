import React, { useState } from 'react';
import { Plus, Search, TrendingUp } from 'lucide-react';

export default function AddStock() {
  const [formData, setFormData] = useState({
    symbol: '',
    shares: '',
    purchase_price: '',
    purchase_date: '',
    company_name: '',
    sector: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage('');

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Mock success
      setMessage('Stock added successfully!');
      setFormData({
        symbol: '',
        shares: '',
        purchase_price: '',
        purchase_date: '',
        company_name: '',
        sector: ''
      });
    } catch (error) {
      setMessage('Error adding stock. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="p-6 md:p-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">Add New Stock</h1>
            <p className="text-gray-600 text-lg">Track your new investment in your portfolio</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Stock Information</h2>
              <p className="text-sm text-gray-600 mt-1">Enter the details of your investment</p>
            </div>

            <form onSubmit={handleSubmit} className="p-6">
              {message && (
                <div className={`mb-6 p-4 rounded-lg ${
                  message.includes('successfully') 
                    ? 'bg-green-50 border border-green-200 text-green-800' 
                    : 'bg-red-50 border border-red-200 text-red-800'
                }`}>
                  {message}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Stock Symbol */}
                <div>
                  <label htmlFor="symbol" className="block text-sm font-medium text-gray-700 mb-2">
                    Stock Symbol *
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      id="symbol"
                      name="symbol"
                      value={formData.symbol}
                      onChange={handleInputChange}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                      placeholder="e.g., AAPL"
                      required
                    />
                  </div>
                </div>

                {/* Company Name */}
                <div>
                  <label htmlFor="company_name" className="block text-sm font-medium text-gray-700 mb-2">
                    Company Name
                  </label>
                  <input
                    type="text"
                    id="company_name"
                    name="company_name"
                    value={formData.company_name}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    placeholder="e.g., Apple Inc."
                  />
                </div>

                {/* Number of Shares */}
                <div>
                  <label htmlFor="shares" className="block text-sm font-medium text-gray-700 mb-2">
                    Number of Shares *
                  </label>
                  <input
                    type="number"
                    id="shares"
                    name="shares"
                    value={formData.shares}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    placeholder="e.g., 10"
                    min="0"
                    step="0.01"
                    required
                  />
                </div>

                {/* Purchase Price */}
                <div>
                  <label htmlFor="purchase_price" className="block text-sm font-medium text-gray-700 mb-2">
                    Purchase Price per Share *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
                    <input
                      type="number"
                      id="purchase_price"
                      name="purchase_price"
                      value={formData.purchase_price}
                      onChange={handleInputChange}
                      className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                      placeholder="e.g., 150.00"
                      min="0"
                      step="0.01"
                      required
                    />
                  </div>
                </div>

                {/* Purchase Date */}
                <div>
                  <label htmlFor="purchase_date" className="block text-sm font-medium text-gray-700 mb-2">
                    Purchase Date *
                  </label>
                  <input
                    type="date"
                    id="purchase_date"
                    name="purchase_date"
                    value={formData.purchase_date}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    required
                  />
                </div>

                {/* Sector */}
                <div>
                  <label htmlFor="sector" className="block text-sm font-medium text-gray-700 mb-2">
                    Sector
                  </label>
                  <select
                    id="sector"
                    name="sector"
                    value={formData.sector}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  >
                    <option value="">Select a sector</option>
                    <option value="Technology">Technology</option>
                    <option value="Healthcare">Healthcare</option>
                    <option value="Financial">Financial</option>
                    <option value="Consumer Discretionary">Consumer Discretionary</option>
                    <option value="Consumer Staples">Consumer Staples</option>
                    <option value="Energy">Energy</option>
                    <option value="Materials">Materials</option>
                    <option value="Industrials">Industrials</option>
                    <option value="Communication Services">Communication Services</option>
                    <option value="Utilities">Utilities</option>
                    <option value="Real Estate">Real Estate</option>
                  </select>
                </div>
              </div>

              {/* Total Investment Calculation */}
              {formData.shares && formData.purchase_price && (
                <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">Total Investment:</span>
                    <span className="text-lg font-bold text-gray-900">
                      ${(parseFloat(formData.shares) * parseFloat(formData.purchase_price)).toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <div className="mt-8 flex justify-end">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-medium flex items-center gap-2 transition-colors"
                >
                  {isLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Adding Stock...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Add Stock
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Quick Add Suggestions */}
          <div className="mt-8 bg-white border border-gray-200 rounded-xl shadow-sm">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Popular Stocks</h2>
              <p className="text-sm text-gray-600 mt-1">Quick add frequently traded stocks</p>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { symbol: 'AAPL', name: 'Apple Inc.', sector: 'Technology' },
                  { symbol: 'MSFT', name: 'Microsoft Corp.', sector: 'Technology' },
                  { symbol: 'GOOGL', name: 'Alphabet Inc.', sector: 'Technology' },
                  { symbol: 'AMZN', name: 'Amazon.com Inc.', sector: 'Consumer Discretionary' },
                  { symbol: 'TSLA', name: 'Tesla Inc.', sector: 'Consumer Discretionary' },
                  { symbol: 'NVDA', name: 'NVIDIA Corp.', sector: 'Technology' }
                ].map((stock) => (
                  <button
                    key={stock.symbol}
                    onClick={() => {
                      setFormData(prev => ({
                        ...prev,
                        symbol: stock.symbol,
                        company_name: stock.name,
                        sector: stock.sector
                      }));
                    }}
                    className="p-4 border border-gray-200 rounded-lg hover:border-green-300 hover:bg-green-50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                        <TrendingUp className="w-4 h-4 text-green-600" />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{stock.symbol}</div>
                        <div className="text-sm text-gray-600">{stock.name}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, BarChart3, Target, Shield, ArrowRight, BookOpen, Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function Home() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const strategies = [
    {
      name: "Long Straddle",
      description: "Profit from high volatility movements in either direction",
      icon: TrendingUp,
    },
    {
      name: "Short Straddle",
      description: "Capitalize on low volatility and time decay",
      icon: Target,
    },
    {
      name: "Iron Condor",
      description: "Generate income in sideways markets with defined risk",
      icon: BarChart3,
    },
    {
      name: "Reverse Iron Condor",
      description: "Benefit from breakout moves with limited risk",
      icon: Shield,
    }
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-200 sticky top-0 bg-white/80 backdrop-blur-sm z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3 sm:space-x-4">
              <img 
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/87af3bb58_image.png" 
                alt="KAHF Capital Logo" 
                className="h-8 sm:h-12 w-auto"
              />
              <div>
                <h1 className="text-lg sm:text-2xl font-bold text-gray-900">KAHF Capital</h1>
                <p className="text-gray-600 text-xs sm:text-sm">Volatility Trading Education</p>
              </div>
            </div>
            <nav className="hidden sm:flex space-x-8">
              <Link to="/" className="text-gray-900 hover:text-green-600 transition-colors font-medium">
                Home
              </Link>
              <Link to="/learning" className="text-gray-900 hover:text-green-600 transition-colors font-medium">
                Learning Modules
              </Link>
            </nav>
            <div className="sm:hidden">
              <button className="p-2 text-gray-900 hover:text-green-600" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
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
                <Link to="/" className="text-gray-900 hover:text-green-600 transition-colors font-medium w-full text-center py-3 rounded-md hover:bg-gray-100" onClick={() => setIsMobileMenuOpen(false)}>
                  Home
                </Link>
                <Link to="/learning" className="text-gray-900 hover:text-green-600 transition-colors font-medium w-full text-center py-3 rounded-md hover:bg-gray-100" onClick={() => setIsMobileMenuOpen(false)}>
                  Learning Modules
                </Link>
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Hero Section */}
      <section className="py-12 sm:py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-black text-gray-900 mb-4 sm:mb-6 leading-tight tracking-tight">
            Learn how to trade like the <span className="text-green-600">1%</span>
          </h2>
          <p className="text-lg sm:text-xl text-gray-600 mb-6 sm:mb-8 max-w-3xl mx-auto leading-relaxed px-4 sm:px-0">
            Access institutional-grade volatility trading strategies and dark pool analytics. 
            Learn the same techniques hedge funds use to profit from market volatility - 
            now available to individual traders for the first time.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center px-4 sm:px-0">
                                        <Link to="/learning" className="w-full sm:w-auto">
                <button className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white px-6 sm:px-8 py-3 text-base sm:text-lg rounded-md">
                  View Learning Modules
                  <ArrowRight className="ml-2 h-4 sm:h-5 w-4 sm:w-5" />
                </button>
              </Link>
          </div>
        </div>
      </section>

      {/* Trading Strategies */}
      <section className="py-12 sm:py-16 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8 sm:mb-12">
            <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 sm:mb-4">Institutional Trading Strategies</h3>
            <p className="text-base sm:text-lg text-gray-600 max-w-2xl mx-auto px-4 sm:px-0">
              Four core volatility arbitrage strategies used by professional traders
            </p>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {strategies.map((strategy, index) => (
              <div key={index} className="border border-gray-200 hover:shadow-lg transition-shadow duration-200 bg-white rounded-lg">
                <div className="p-4 sm:p-6">
                  <div className="w-10 sm:w-12 h-10 sm:h-12 bg-gray-100 rounded-lg flex items-center justify-center mb-3 sm:mb-4">
                    <strategy.icon className="h-5 sm:h-6 w-5 sm:w-6 text-gray-700" />
                  </div>
                  <h4 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">{strategy.name}</h4>
                  <p className="text-gray-600 text-sm leading-relaxed">{strategy.description}</p>
                </div>
              </div>
            ))}
          </div>
          
          <div className="text-center mt-8 sm:mt-12 px-4 sm:px-0">
                                          <Link to="/learning">
                <button className="border border-gray-300 text-gray-900 hover:bg-gray-50 px-6 sm:px-8 py-3 text-base sm:text-lg rounded-md">
                  <BookOpen className="mr-2 h-4 sm:h-5 w-4 sm:w-5" />
                  Learn More
                </button>
              </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-6 sm:py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="flex items-center justify-center space-x-3 sm:space-x-4 mb-3 sm:mb-4">
            <img 
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/87af3bb58_image.png" 
              alt="KAHF Capital Logo" 
              className="h-6 sm:h-8 w-auto"
            />
            <span className="text-gray-900 font-semibold text-sm sm:text-base">KAHF Capital</span>
          </div>
          <p className="text-gray-600 text-sm sm:text-base">
            Educational content for options volatility trading
          </p>
        </div>
      </footer>
    </div>
  );
}

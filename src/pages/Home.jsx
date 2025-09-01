
import React, { useState } from 'react';
import Link from 'next/link';
import { TrendingUp, BarChart3, Target, Shield, ArrowRight, Search, Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Footer from './Footer';

export default function Home() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const platformFeatures = [
    {
      name: "Dark Pool Scanner",
      description: "Track institutional trading activity hidden from public markets to identify potential volatility opportunities",
      icon: BarChart3,
    },
    {
      name: "Volume Analytics",
      description: "Monitor top tickers by aggregated daily dark pool volume with real-time filtering",
      icon: TrendingUp,
    },
    {
      name: "Straddle Analysis",
      description: "Analyze historical profitability of ATM straddle strategies for any ticker",
      icon: Target,
    },
    {
      name: "Volatility Arbitrage",
      description: "Complete workflow from opportunity discovery to strategy analysis",
      icon: Search,
    }
  ];

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
                <p className="text-gray-600 text-sm">Volatility Trading Platform</p>
              </div>
            </div>
            <nav className="hidden sm:flex space-x-8">
              <Link href="/" className="text-gray-900 hover:text-green-600 transition-colors font-medium">
                Home
              </Link>
              <Link href="/learning" className="text-gray-900 hover:text-green-600 transition-colors font-medium">
                Learning Modules
              </Link>
              <Link href="/scanner" className="text-gray-900 hover:text-green-600 transition-colors font-medium">
                Scanner
              </Link>
              <Link href="/straddle-calculator" className="text-gray-900 hover:text-green-600 transition-colors font-medium">
                Straddle Calculator
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
                <Link href="/" className="text-gray-900 hover:text-green-600 transition-colors font-medium w-full text-center py-3 rounded-md hover:bg-gray-100 touch-manipulation" onClick={() => setIsMobileMenuOpen(false)}>
                  Home
                </Link>
                <Link href="/learning" className="text-gray-900 hover:text-green-600 transition-colors font-medium w-full text-center py-3 rounded-md hover:bg-gray-100 touch-manipulation" onClick={() => setIsMobileMenuOpen(false)}>
                  Learning Modules
              </Link>
                <Link href="/scanner" className="text-gray-900 hover:text-green-600 transition-colors font-medium w-full text-center py-3 rounded-md hover:bg-gray-100 touch-manipulation" onClick={() => setIsMobileMenuOpen(false)}>
                  Scanner
                </Link>
                <Link href="/straddle-calculator" className="text-gray-900 hover:text-green-600 transition-colors font-medium w-full text-center py-3 rounded-md hover:bg-gray-100 touch-manipulation" onClick={() => setIsMobileMenuOpen(false)}>
                  Straddle Calculator
                </Link>
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Hero Section */}
      <section className="py-12 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-black text-gray-900 mb-4 leading-tight tracking-tight">
            Learn how to trade like the <span className="text-green-600">1%</span>
          </h2>
          <p className="text-lg text-gray-600 mb-8 max-w-3xl mx-auto leading-relaxed">
            Discover volatility arbitrage opportunities using institutional-grade dark pool analytics and straddle analysis. 
            Find what the smart money is trading, then analyze the profitability of volatility strategies - 
            the complete toolkit for professional volatility trading.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/scanner" className="w-full sm:w-auto">
              <button className="w-full bg-green-600 hover:bg-green-700 text-white px-8 py-4 text-lg rounded-lg font-medium touch-manipulation">
                Access Dark Pool Scanner
                <ArrowRight className="ml-2 h-5 w-5 inline" />
              </button>
            </Link>
            <Link href="/straddle-calculator" className="w-full sm:w-auto">
              <button className="w-full bg-gray-800 hover:bg-gray-900 text-white px-8 py-4 text-lg rounded-lg font-medium touch-manipulation">
                Straddle Calculator
                <ArrowRight className="ml-2 h-5 w-5 inline" />
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* Platform Features */}
      <section className="py-12 px-4 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <h3 className="text-2xl font-bold text-gray-900 mb-4">Volatility Arbitrage Platform</h3>
            <p className="text-base text-gray-600 max-w-2xl mx-auto">
              Complete workflow from dark pool opportunity discovery to straddle strategy analysis
            </p>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {platformFeatures.map((feature, index) => (
              <div key={index} className="border border-gray-200 hover:shadow-lg transition-shadow duration-200 bg-white rounded-lg">
                <div className="p-6">
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                    <feature.icon className="h-6 w-6 text-green-600" />
                  </div>
                  <h4 className="text-lg font-semibold text-gray-900 mb-3">{feature.name}</h4>
                  <p className="text-gray-600 text-base leading-relaxed">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </div>
  );
}

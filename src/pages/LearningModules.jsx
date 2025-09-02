
import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { TrendingUp, Target, BarChart3, Shield, CheckCircle, Menu, X } from 'lucide-react';
import Footer from './Footer';
import { motion, AnimatePresence } from 'framer-motion';

export default function LearningModules() {
  const [activeStrategy, setActiveStrategy] = useState("long-straddle");
  const [activeTab, setActiveTab] = useState("overview");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const router = useRouter();

  const strategies = {
    "long-straddle": {
      name: "Long Straddle",
      icon: TrendingUp,
      difficulty: "Intermediate",
      description: "Profit from high volatility movements in either direction",
      overview: "The long straddle involves buying both a call and put option at the same strike price and expiration date. This strategy profits from significant price movements in either direction.",
      whenToUse: [
        "Expecting high volatility but unsure of direction",
        "Before earnings announcements",
        "When implied volatility is relatively low",
        "During periods of market uncertainty"
      ],
      keyPoints: [
        "Unlimited profit potential on both upside and downside",
        "Limited risk to premium paid",
        "Benefits from increasing volatility",
        "Time decay works against the position"
      ],
      riskProfile: {
        maxProfit: "Unlimited",
        maxLoss: "Premium paid",
        breakeven: "Strike ± Premium paid"
      },
      darkPoolInsights: [
        "Watch for unusual option activity at the same strike",
        "Monitor large block trades for institutional positioning",
        "Look for dark pool volume spikes before events"
      ]
    },
    "short-straddle": {
      name: "Short Straddle",
      icon: Target,
      difficulty: "Advanced",
      description: "Capitalize on low volatility and time decay",
      overview: "The short straddle involves selling both a call and put at the same strike price. This strategy profits from low volatility and time decay when the stock stays within a specific range.",
      whenToUse: [
        "Expecting low volatility or sideways movement",
        "When implied volatility is high",
        "In range-bound markets",
        "After major events when volatility typically drops"
      ],
      keyPoints: [
        "Collect premium upfront",
        "Benefits from time decay",
        "Unlimited risk potential",
        "Requires careful position management"
      ],
      riskProfile: {
        maxProfit: "Premium collected",
        maxLoss: "Unlimited",
        breakeven: "Strike ± Premium collected"
      },
      darkPoolInsights: [
        "Monitor for lack of large block activity",
        "Watch for decreasing dark pool volume",
        "Look for institutional profit-taking signals"
      ]
    },
    "iron-condor": {
      name: "Iron Condor",
      icon: BarChart3,
      difficulty: "Intermediate",
      description: "Generate income in sideways markets with defined risk",
      overview: "The iron condor combines a bull put spread and bear call spread to create a defined-risk, income-generating strategy that profits from low volatility and time decay.",
      whenToUse: [
        "Neutral market outlook",
        "High implied volatility environments",
        "When expecting range-bound movement",
        "For consistent income generation"
      ],
      keyPoints: [
        "Defined maximum risk and reward",
        "Benefits from time decay",
        "Lower margin requirements than short straddles",
        "Multiple adjustment opportunities"
      ],
      riskProfile: {
        maxProfit: "Net credit received",
        maxLoss: "Width of spreads - credit received",
        breakeven: "Two breakeven points"
      },
      darkPoolInsights: [
        "Monitor activity at wing strikes",
        "Watch for institutional accumulation",
        "Look for volume patterns indicating range-bound movement"
      ]
    },
    "reverse-iron-condor": {
      name: "Reverse Iron Condor",
      icon: Shield,
      difficulty: "Advanced",
      description: "Benefit from breakout moves with limited risk",
      overview: "The reverse iron condor is designed to profit from significant price movements while limiting risk. It's essentially the opposite of a traditional iron condor.",
      whenToUse: [
        "Expecting significant price movement",
        "Before major news events",
        "When volatility is expected to increase",
        "For directional plays with defined risk"
      ],
      keyPoints: [
        "Defined maximum risk",
        "Unlimited profit potential",
        "Benefits from increasing volatility",
        "Lower cost than long straddles"
      ],
      riskProfile: {
        maxProfit: "Unlimited",
        maxLoss: "Net debit paid",
        breakeven: "Two breakeven points"
      },
      darkPoolInsights: [
        "Monitor for unusual activity at center strikes",
        "Watch for institutional positioning",
        "Look for volume spikes indicating potential breakouts"
      ]
    }
  };

  const currentStrategy = strategies[activeStrategy];

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "when-to-use", label: "When to Use" },
    { id: "risk-profile", label: "Risk Profile" },
    { id: "dark-pool", label: "Dark Pool" }
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case "overview":
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Strategy Overview</h3>
              <p className="text-gray-700 leading-relaxed text-base">{currentStrategy.overview}</p>
            </div>
            <div>
              <h4 className="text-gray-900 font-medium mb-3 text-base">Key Points:</h4>
              <div className="space-y-3">
                {currentStrategy.keyPoints.map((point, index) => (
                  <div key={index} className="flex items-start space-x-3">
                    <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700 text-base leading-relaxed">{point}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      case "when-to-use":
        return (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">When to Use This Strategy</h3>
            <div className="space-y-4">
              {currentStrategy.whenToUse.map((scenario, index) => (
                <div key={index} className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-sm font-bold">{index + 1}</span>
                  </div>
                  <p className="text-gray-700 text-base leading-relaxed">{scenario}</p>
                </div>
              ))}
            </div>
          </div>
        );
      case "risk-profile":
        return (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Risk Profile</h3>
            <div className="grid grid-cols-1 gap-4">
              <div className="text-center p-4 border border-gray-200 rounded-lg bg-white">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <TrendingUp className="h-6 w-6 text-green-600" />
                </div>
                <h4 className="text-gray-900 font-medium mb-2 text-base">Max Profit</h4>
                <p className="text-green-600 text-base font-medium">{currentStrategy.riskProfile.maxProfit}</p>
              </div>
              <div className="text-center p-4 border border-gray-200 rounded-lg bg-white">
                <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <Shield className="h-6 w-6 text-red-600" />
                </div>
                <h4 className="text-gray-900 font-medium mb-2 text-base">Max Loss</h4>
                <p className="text-red-600 text-base font-medium">{currentStrategy.riskProfile.maxLoss}</p>
              </div>
              <div className="text-center p-4 border border-gray-200 rounded-lg bg-white">
                <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <Target className="h-6 w-6 text-gray-600" />
                </div>
                <h4 className="text-gray-900 font-medium mb-2 text-base">Breakeven</h4>
                <p className="text-gray-600 text-base font-medium">{currentStrategy.riskProfile.breakeven}</p>
              </div>
            </div>
          </div>
        );
      case "dark-pool":
        return (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Dark Pool Analytics</h3>
            <div className="space-y-4">
              {currentStrategy.darkPoolInsights.map((insight, index) => (
                <div key={index} className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center flex-shrink-0">
                    <BarChart3 className="h-4 w-4 text-white" />
                  </div>
                  <p className="text-gray-700 text-base leading-relaxed">{insight}</p>
                </div>
              ))}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
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
                <p className="text-gray-600 text-sm">VolAlert Pro - SMS Alert System</p>
              </div>
            </div>
            <nav className="hidden sm:flex space-x-8">
              <Link href="/" className="text-gray-900 hover:text-green-600 transition-colors font-medium">
                Home
              </Link>
              <Link href="/learning" className="text-green-600 font-medium">
                Learning Modules
              </Link>
              <Link href="/scanner" className="text-gray-900 hover:text-green-600 transition-colors font-medium">
                Scanner
              </Link>
              <Link href="/straddle-calculator" className="text-gray-900 hover:text-green-600 transition-colors font-medium">
                Straddle Calculator
              </Link>
              <Link href="/mysubscriptions" className="text-gray-900 hover:text-green-600 transition-colors font-medium">
                My Subscriptions
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
                <Link href="/learning" className="text-green-600 font-medium w-full text-center py-3 rounded-md hover:bg-gray-100 touch-manipulation" onClick={() => setIsMobileMenuOpen(false)}>
                  Learning Modules
                </Link>
                <Link href="/scanner" className="text-gray-900 hover:text-green-600 transition-colors font-medium w-full text-center py-3 rounded-md hover:bg-gray-100 touch-manipulation" onClick={() => setIsMobileMenuOpen(false)}>
                  Scanner
                </Link>
                <Link href="/straddle-calculator" className="text-gray-900 hover:text-green-600 transition-colors font-medium w-full text-center py-3 rounded-md hover:bg-gray-100 touch-manipulation" onClick={() => setIsMobileMenuOpen(false)}>
                  Straddle Calculator
                </Link>
                <Link href="/mysubscriptions" className="text-gray-900 hover:text-green-600 transition-colors font-medium w-full text-center py-3 rounded-md hover:bg-gray-100 touch-manipulation" onClick={() => setIsMobileMenuOpen(false)}>
                  My Subscriptions
                </Link>
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-3">Volatility Trading Strategies</h1>
          <p className="text-gray-600 text-base">Master the four core strategies used by institutional traders to profit from market volatility.</p>
        </div>

        {/* Strategy Selection - Mobile Optimized */}
        <div className="mb-6">
          <div className="grid grid-cols-2 gap-3 mb-4">
            {Object.entries(strategies).map(([key, strategy]) => (
              <div 
                key={key}
                className={`border-2 cursor-pointer transition-all duration-200 rounded-lg p-4 touch-manipulation ${
                  activeStrategy === key 
                    ? 'border-green-500 bg-green-50 shadow-md' 
                    : 'border-gray-200 hover:border-gray-300 hover:shadow-sm bg-white'
                }`}
                onClick={() => setActiveStrategy(key)}
              >
                <div className="text-center">
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center mx-auto mb-3 ${
                    activeStrategy === key ? 'bg-green-600' : 'bg-gray-100'
                  }`}>
                    <strategy.icon className={`h-6 w-6 ${
                      activeStrategy === key ? 'text-white' : 'text-gray-700'
                    }`} />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-2 leading-tight">{strategy.name}</h3>
                  <div className="flex justify-center mb-2">
                    <span className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded">
                      {strategy.difficulty}
                    </span>
                  </div>
                  <p className="text-gray-600 text-xs flex items-center justify-center">
                    {/* Removed Clock icon and duration text */}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Strategy Details */}
        <div className="space-y-6">
          {/* Main Content */}
          <div className="border border-gray-200 bg-white rounded-lg">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-green-600 rounded-lg flex items-center justify-center">
                  <currentStrategy.icon className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl text-gray-900 font-semibold">{currentStrategy.name}</h2>
                  <p className="text-gray-600 text-sm">{currentStrategy.description}</p>
                </div>
              </div>
            </div>
            
            {/* Tabs - Mobile Optimized */}
            <div className="border-b border-gray-200 overflow-x-auto">
              <div className="flex min-w-full">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors touch-manipulation flex-1 ${
                      activeTab === tab.id
                        ? 'border-green-500 text-green-600 bg-green-50'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Tab Content */}
            <div className="p-4">
              {renderTabContent()}
            </div>
          </div>

          {/* Sidebar - Mobile Optimized */}
          <div className="border border-green-300 bg-green-50 rounded-lg">
            <div className="p-4">
              <h3 className="text-gray-900 text-lg font-semibold mb-3">Unlock Premium Content</h3>
              <p className="text-gray-700 text-base mb-4 leading-relaxed">
                Get our comprehensive 50-page e-book. Covers everything from placing your first trade to advanced dark pool data analysis, position management, and execution.
              </p>
              <div className="space-y-3">
                <button 
                                                  onClick={() => router.push('/confirmation')}
                  className="w-full bg-green-600 hover:bg-green-700 text-white text-base font-medium rounded-lg py-3 px-4 touch-manipulation"
                >
                  Get the E-book
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}

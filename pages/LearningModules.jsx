
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, TrendingUp, Target, BarChart3, Shield, CheckCircle, Clock, ArrowRight } from 'lucide-react';

export default function LearningModules() {
  const [activeStrategy, setActiveStrategy] = useState("long-straddle");

  const strategies = {
    "long-straddle": {
      name: "Long Straddle",
      icon: TrendingUp,
      difficulty: "Intermediate",
      duration: "30 min",
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
      duration: "35 min",
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
      duration: "40 min",
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
      duration: "45 min",
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3 sm:space-x-4">
              <Link to="/">
                <button className="group flex items-center space-x-2 px-3 py-2 text-slate-700 hover:text-blue-600 transition-colors duration-200 rounded-lg hover:bg-slate-50">
                  <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
                  <span className="hidden sm:inline font-medium">Back to Home</span>
                  <span className="sm:hidden font-medium">Home</span>
                </button>
              </Link>
              <div className="flex items-center space-x-3 sm:space-x-4">
                <img 
                  src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/87af3bb58_image.png" 
                  alt="KAHF Capital Logo" 
                  className="h-7 sm:h-8 w-auto"
                />
                <span className="text-slate-800 font-semibold text-sm sm:text-base">Learning Modules</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="mb-8 sm:mb-12">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 mb-4 sm:mb-6">Volatility Trading Strategies</h1>
          <p className="text-slate-600 text-lg sm:text-xl max-w-3xl">Master the four core strategies used by institutional traders to profit from market volatility.</p>
        </div>

        {/* Strategy Selection */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8 sm:mb-12">
          {Object.entries(strategies).map(([key, strategy]) => (
            <div 
              key={key}
              className={`border-2 cursor-pointer transition-all duration-300 rounded-xl p-5 sm:p-6 ${
                activeStrategy === key 
                  ? 'border-blue-500 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-lg shadow-blue-100' 
                  : 'border-slate-200 hover:border-slate-300 hover:shadow-md bg-white hover:bg-slate-50'
              }`}
              onClick={() => setActiveStrategy(key)}
            >
              <div className="text-center">
                <div className={`w-12 sm:w-14 h-12 sm:h-14 rounded-xl flex items-center justify-center mx-auto mb-4 ${
                  activeStrategy === key 
                    ? 'bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg' 
                    : 'bg-gradient-to-br from-slate-100 to-gray-100'
                }`}>
                  <strategy.icon className={`h-6 sm:h-7 w-6 sm:w-7 ${
                    activeStrategy === key ? 'text-white' : 'text-slate-600'
                  }`} />
                </div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 mb-3 leading-tight">{strategy.name}</h3>
                <div className="flex justify-center mb-3">
                  <span className={`text-xs px-3 py-1.5 rounded-full font-medium ${
                    activeStrategy === key 
                      ? 'bg-blue-100 text-blue-700' 
                      : 'bg-slate-100 text-slate-600'
                  }`}>
                    {strategy.difficulty}
                  </span>
                </div>
                <p className="text-slate-500 text-sm flex items-center justify-center">
                  <Clock className="h-4 w-4 mr-1.5" />
                  {strategy.duration}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Strategy Details */}
        <div className="grid lg:grid-cols-4 gap-8 sm:gap-10">
          {/* Main Content */}
          <div className="lg:col-span-3">
            <div className="border border-slate-200 bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="p-6 sm:p-8 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
                <div className="flex items-center space-x-4 sm:space-x-6">
                  <div className="w-14 sm:w-16 h-14 sm:h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                    <currentStrategy.icon className="h-7 sm:h-8 w-7 sm:w-8 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl sm:text-2xl lg:text-3xl text-slate-900 font-bold mb-2">{currentStrategy.name}</h2>
                    <p className="text-slate-600 text-base sm:text-lg">{currentStrategy.description}</p>
                  </div>
                </div>
              </div>
              <div className="p-6 sm:p-8">
                <div className="space-y-8">
                  <div>
                    <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-4 flex items-center">
                      <div className="w-2 h-2 bg-blue-600 rounded-full mr-3"></div>
                      Strategy Overview
                    </h3>
                    <p className="text-slate-700 leading-relaxed text-base sm:text-lg">{currentStrategy.overview}</p>
                  </div>
                  
                  <div>
                    <h4 className="text-slate-900 font-bold mb-4 text-base sm:text-lg flex items-center">
                      <div className="w-2 h-2 bg-green-600 rounded-full mr-3"></div>
                      Key Points
                    </h4>
                    <div className="space-y-3">
                      {currentStrategy.keyPoints.map((point, index) => (
                        <div key={index} className="flex items-start space-x-3">
                          <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                          <span className="text-slate-700 text-base leading-relaxed">{point}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-slate-900 font-bold mb-4 text-base sm:text-lg flex items-center">
                      <div className="w-2 h-2 bg-purple-600 rounded-full mr-3"></div>
                      When to Use This Strategy
                    </h4>
                    <div className="space-y-4">
                      {currentStrategy.whenToUse.map((scenario, index) => (
                        <div key={index} className="flex items-start space-x-4">
                          <div className="w-7 h-7 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm">
                            <span className="text-white text-sm font-bold">{index + 1}</span>
                          </div>
                          <p className="text-slate-700 text-base leading-relaxed">{scenario}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-slate-900 font-bold mb-4 text-base sm:text-lg flex items-center">
                      <div className="w-2 h-2 bg-orange-600 rounded-full mr-3"></div>
                      Risk Profile
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-4 rounded-xl border border-green-200">
                        <p className="text-xs text-green-600 font-semibold uppercase tracking-wide mb-1">Max Profit</p>
                        <p className="font-bold text-green-800 text-lg">{currentStrategy.riskProfile.maxProfit}</p>
                      </div>
                      <div className="bg-gradient-to-br from-red-50 to-rose-50 p-4 rounded-xl border border-red-200">
                        <p className="text-xs text-red-600 font-semibold uppercase tracking-wide mb-1">Max Loss</p>
                        <p className="font-bold text-red-800 text-lg">{currentStrategy.riskProfile.maxLoss}</p>
                      </div>
                      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-xl border border-blue-200">
                        <p className="text-xs text-blue-600 font-semibold uppercase tracking-wide mb-1">Breakeven</p>
                        <p className="font-bold text-blue-800 text-lg">{currentStrategy.riskProfile.breakeven}</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-slate-900 font-bold mb-4 text-base sm:text-lg flex items-center">
                      <div className="w-2 h-2 bg-slate-600 rounded-full mr-3"></div>
                      Dark Pool Insights
                    </h4>
                    <div className="space-y-3">
                      {currentStrategy.darkPoolInsights.map((insight, index) => (
                        <div key={index} className="flex items-start space-x-3">
                          <CheckCircle className="h-5 w-5 text-slate-600 mt-0.5 flex-shrink-0" />
                          <span className="text-slate-700 text-base leading-relaxed">{insight}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-6 sm:p-8 shadow-sm">
              <h3 className="text-slate-900 text-lg sm:text-xl font-bold mb-4">Unlock Premium Content</h3>
              <p className="text-slate-700 text-sm sm:text-base mb-6 leading-relaxed">
                Get our comprehensive 50-page e-book. Covers everything from placing your first trade to advanced dark pool data analysis, position management, and execution.
              </p>
              <a href="https://buy.stripe.com/cNi128tdb74N6d8L61z0o0M0O" target="_blank" rel="noopener noreferrer" className="block group">
                <button className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-sm sm:text-base font-semibold rounded-xl py-3 px-4 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 flex items-center justify-center space-x-2">
                  <span>Get the E-book</span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </button>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

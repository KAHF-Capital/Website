
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, TrendingUp, Target, BarChart3, Shield, CheckCircle, Clock } from 'lucide-react';

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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 sm:space-x-4">
              <Link to="/">
                <button className="text-gray-900 hover:text-green-600 p-2 flex items-center">
                  <ArrowLeft className="h-4 w-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">Back to Home</span>
                  <span className="sm:hidden">Home</span>
                </button>
              </Link>
              <div className="flex items-center space-x-2 sm:space-x-4">
                <img 
                  src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/87af3bb58_image.png" 
                  alt="KAHF Capital Logo" 
                  className="h-6 sm:h-8 w-auto"
                />
                <span className="text-gray-900 font-semibold text-sm sm:text-base">Learning Modules</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2 sm:mb-4">Volatility Trading Strategies</h1>
          <p className="text-gray-600 text-lg sm:text-xl">Master the four core strategies used by institutional traders to profit from market volatility.</p>
        </div>

        {/* Strategy Selection */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
          {Object.entries(strategies).map(([key, strategy]) => (
            <div 
              key={key}
              className={`border cursor-pointer transition-all duration-200 rounded-lg p-4 ${
                activeStrategy === key 
                  ? 'border-green-500 bg-green-50 shadow-md' 
                  : 'border-gray-200 hover:border-gray-300 hover:shadow-sm bg-white'
              }`}
              onClick={() => setActiveStrategy(key)}
            >
              <div className="text-center">
                <div className={`w-8 sm:w-10 h-8 sm:h-10 rounded-lg flex items-center justify-center mx-auto mb-2 sm:mb-3 ${
                  activeStrategy === key ? 'bg-green-600' : 'bg-gray-100'
                }`}>
                  <strategy.icon className={`h-4 sm:h-5 w-4 sm:w-5 ${
                    activeStrategy === key ? 'text-white' : 'text-gray-700'
                  }`} />
                </div>
                <h3 className="text-xs sm:text-sm font-semibold text-gray-900 mb-1 sm:mb-2 leading-tight">{strategy.name}</h3>
                <div className="flex justify-center mb-1 sm:mb-2">
                  <span className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded">
                    {strategy.difficulty}
                  </span>
                </div>
                <p className="text-gray-600 text-xs flex items-center justify-center">
                  <Clock className="h-3 w-3 mr-1" />
                  {strategy.duration}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Strategy Details */}
        <div className="grid lg:grid-cols-4 gap-6 sm:gap-8">
          {/* Main Content */}
          <div className="lg:col-span-3">
            <div className="border border-gray-200 bg-white rounded-lg">
              <div className="p-4 sm:p-6 border-b border-gray-200">
                <div className="flex items-center space-x-3 sm:space-x-4">
                  <div className="w-10 sm:w-12 h-10 sm:h-12 bg-green-600 rounded-lg flex items-center justify-center">
                    <currentStrategy.icon className="h-5 sm:h-6 w-5 sm:w-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg sm:text-2xl text-gray-900 font-semibold">{currentStrategy.name}</h2>
                    <p className="text-gray-600 text-sm sm:text-base">{currentStrategy.description}</p>
                  </div>
                </div>
              </div>
              <div className="p-4 sm:p-6">
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2 sm:mb-3">Strategy Overview</h3>
                    <p className="text-gray-700 leading-relaxed mb-3 sm:mb-4 text-sm sm:text-base">{currentStrategy.overview}</p>
                  </div>
                  
                  <div>
                    <h4 className="text-gray-900 font-medium mb-2 sm:mb-3 text-sm sm:text-base">Key Points:</h4>
                    <div className="space-y-2">
                      {currentStrategy.keyPoints.map((point, index) => (
                        <div key={index} className="flex items-start space-x-2">
                          <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <span className="text-gray-700 text-sm leading-relaxed">{point}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-gray-900 font-medium mb-2 sm:mb-3 text-sm sm:text-base">When to Use This Strategy:</h4>
                    <div className="space-y-3">
                      {currentStrategy.whenToUse.map((scenario, index) => (
                        <div key={index} className="flex items-start space-x-3">
                          <div className="w-5 sm:w-6 h-5 sm:h-6 bg-green-600 rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="text-white text-xs font-bold">{index + 1}</span>
                          </div>
                          <p className="text-gray-700 text-sm sm:text-base leading-relaxed">{scenario}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-gray-900 font-medium mb-2 sm:mb-3 text-sm sm:text-base">Risk Profile:</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="bg-gray-50 p-3 rounded">
                        <p className="text-xs text-gray-600">Max Profit</p>
                        <p className="font-semibold">{currentStrategy.riskProfile.maxProfit}</p>
                      </div>
                      <div className="bg-gray-50 p-3 rounded">
                        <p className="text-xs text-gray-600">Max Loss</p>
                        <p className="font-semibold">{currentStrategy.riskProfile.maxLoss}</p>
                      </div>
                      <div className="bg-gray-50 p-3 rounded">
                        <p className="text-xs text-gray-600">Breakeven</p>
                        <p className="font-semibold">{currentStrategy.riskProfile.breakeven}</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-gray-900 font-medium mb-2 sm:mb-3 text-sm sm:text-base">Dark Pool Insights:</h4>
                    <div className="space-y-2">
                      {currentStrategy.darkPoolInsights.map((insight, index) => (
                        <div key={index} className="flex items-start space-x-2">
                          <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <span className="text-gray-700 text-sm leading-relaxed">{insight}</span>
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
            <div className="border border-green-300 bg-green-50 rounded-lg">
              <div className="p-4 sm:p-6">
                <h3 className="text-gray-900 text-base sm:text-lg font-semibold mb-3">Unlock Premium Content</h3>
                <p className="text-gray-700 text-sm sm:text-base mb-4">
                  Get our comprehensive 50-page e-book. Covers everything from placing your first trade to advanced dark pool data analysis, position management, and execution.
                </p>
                <Link to="/payment" className="block">
                  <button className="w-full bg-green-600 hover:bg-green-700 text-white text-sm sm:text-base rounded-md py-2">
                    Get the E-book
                  </button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

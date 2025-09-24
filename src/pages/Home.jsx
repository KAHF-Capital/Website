
import React from 'react';
import Link from 'next/link';
import { TrendingUp, BarChart3, Target, Shield, ArrowRight, Search, Zap } from 'lucide-react';
import Header from '../components/Header';
import Footer from './Footer';

export default function Home() {

  const platformFeatures = [
    {
      name: "Learning Modules",
      description: "Master volatility trading strategies with comprehensive educational content and real-world examples",
      icon: Target,
    },
    {
      name: "Dark Pool Scanner",
      description: "Track institutional trading activity hidden from public markets to identify potential volatility opportunities",
      icon: BarChart3,
    },
    {
      name: "Straddle Calculator",
      description: "Analyze historical profitability of ATM straddle strategies for any ticker with advanced analytics",
      icon: TrendingUp,
    },
    {
      name: "VolAlert Pro",
      description: "Get real-time SMS alerts on volatility opportunities",
      icon: Search,
    }
  ];

  return (
    <div className="min-h-screen bg-white">
      <Header />

      {/* Hero Section */}
      <section className="py-12 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-black text-gray-900 mb-4 leading-tight tracking-tight">
            Trade like the <span className="text-green-600">1%.</span>
          </h2>
          <p className="text-lg text-gray-600 mb-8 max-w-3xl mx-auto leading-relaxed">
            Peek behind the curtain, and exploit unpriced volatility.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a 
              href="https://buy.stripe.com/4gM8wR0ol1AU1q3eS50oM01" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="w-full sm:w-auto"
            >
              <button className="w-full bg-green-600 hover:bg-green-700 text-white px-8 py-4 text-lg rounded-lg font-medium touch-manipulation flex items-center justify-center">
                <Zap className="mr-2 h-5 w-5" />
                Subscribe to VolAlert Pro
                <ArrowRight className="ml-2 h-5 w-5" />
              </button>
            </a>
            <Link href="/scanner" className="w-full sm:w-auto">
              <button className="w-full bg-gray-800 hover:bg-gray-900 text-white px-8 py-4 text-lg rounded-lg font-medium touch-manipulation">
                Try Free Dark Pool Scanner
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
            <h3 className="text-2xl font-bold text-gray-900 mb-4">Available Tools & Services</h3>
            <p className="text-base text-gray-600 max-w-2xl mx-auto">
              Everything you need to trade volatility like the professionals
            </p>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {platformFeatures.map((feature, index) => {
              const getFeatureLink = (featureName) => {
                switch (featureName) {
                  case 'Learning Modules':
                    return '/learning';
                  case 'Dark Pool Scanner':
                    return '/scanner';
                  case 'Straddle Calculator':
                    return '/straddle-calculator';
                  case 'VolAlert Pro':
                    return 'https://buy.stripe.com/4gM8wR0ol1AU1q3eS50oM01';
                  default:
                    return '#';
                }
              };

              const isExternalLink = feature.name === 'VolAlert Pro';
              const featureLink = getFeatureLink(feature.name);

              if (isExternalLink) {
                return (
                  <a 
                    key={index} 
                    href={featureLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="border border-gray-200 hover:shadow-lg transition-shadow duration-200 bg-white rounded-lg cursor-pointer"
                  >
                    <div className="p-6">
                      <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                        <feature.icon className="h-6 w-6 text-green-600" />
                      </div>
                      <h4 className="text-lg font-semibold text-gray-900 mb-3">{feature.name}</h4>
                      <p className="text-gray-600 text-base leading-relaxed">{feature.description}</p>
                    </div>
                  </a>
                );
              }

              return (
                <Link key={index} href={featureLink} className="border border-gray-200 hover:shadow-lg transition-shadow duration-200 bg-white rounded-lg cursor-pointer">
                  <div className="p-6">
                    <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                      <feature.icon className="h-6 w-6 text-green-600" />
                    </div>
                    <h4 className="text-lg font-semibold text-gray-900 mb-3">{feature.name}</h4>
                    <p className="text-gray-600 text-base leading-relaxed">{feature.description}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>



      {/* Footer */}
      <Footer />
    </div>
  );
}

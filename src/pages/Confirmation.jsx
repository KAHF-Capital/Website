import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle, Download, BookOpen, Shield, TrendingUp } from 'lucide-react';

export default function Confirmation() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Link to="/">
                <button className="text-gray-900 hover:text-green-600 p-2 flex items-center touch-manipulation">
                  <ArrowLeft className="h-5 w-5 mr-2" />
                  <span className="font-medium">Back to Home</span>
                </button>
              </Link>
              <div className="flex items-center space-x-3">
                <img 
                  src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/87af3bb58_image.png" 
                  alt="KAHF Capital Logo" 
                  className="h-8 w-auto"
                />
                <span className="text-gray-900 font-semibold text-base">Purchase Confirmed</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-12">
        {/* Success Message */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="h-10 w-10 text-green-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Thank You for Your Purchase!</h1>
          <p className="text-gray-600 text-lg mb-2">Your transaction has been completed successfully.</p>
          <p className="text-gray-600 text-base">You now have access to our comprehensive e-book.</p>
        </div>

        {/* E-book Download Section */}
        <div className="bg-white border border-gray-200 rounded-lg p-8 mb-8">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-4">
              <BookOpen className="h-8 w-8 text-blue-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Mastering Volatility Trading: Institutional Strategies Unveiled</h2>
            <p className="text-gray-600 text-base">Your comprehensive 50-page guide to institutional trading strategies</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="text-center p-4 border border-gray-200 rounded-lg">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                <TrendingUp className="h-6 w-6 text-green-600" />
              </div>
              <h3 className="text-gray-900 font-medium mb-2">4 Core Strategies</h3>
              <p className="text-gray-600 text-sm">Long Straddle, Short Straddle, Iron Condor, Reverse Iron Condor</p>
            </div>
            <div className="text-center p-4 border border-gray-200 rounded-lg">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                <Shield className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="text-gray-900 font-medium mb-2">Risk Management</h3>
              <p className="text-gray-600 text-sm">Complete position sizing and risk control guidelines</p>
            </div>
            <div className="text-center p-4 border border-gray-200 rounded-lg">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                <Download className="h-6 w-6 text-purple-600" />
              </div>
              <h3 className="text-gray-900 font-medium mb-2">Instant Access</h3>
              <p className="text-gray-600 text-sm">Download immediately and start learning today</p>
            </div>
          </div>

          <div className="text-center">
            <a 
              href="https://drive.google.com/file/d/1b6daQAjsQqd6rhrZTvJ3h-w7sjtVxWoG/view?usp=sharing" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center bg-green-600 hover:bg-green-700 text-white text-lg font-medium rounded-lg py-4 px-8 touch-manipulation transition-colors"
            >
              <Download className="h-5 w-5 mr-2" />
              Download Your E-book
            </a>
            <p className="text-gray-500 text-sm mt-3">Click the button above to access your purchase</p>
          </div>
        </div>

        {/* Additional Information */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">What's Next?</h3>
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-green-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-white text-xs font-bold">1</span>
              </div>
              <div>
                <p className="text-gray-700 font-medium">Download and save the e-book to your device</p>
                <p className="text-gray-600 text-sm">You can access it offline anytime</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-green-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-white text-xs font-bold">2</span>
              </div>
              <div>
                <p className="text-gray-700 font-medium">Review the learning modules on our website</p>
                <p className="text-gray-600 text-sm">Practice with the interactive examples</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-green-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-white text-xs font-bold">3</span>
              </div>
              <div>
                <p className="text-gray-700 font-medium">Start implementing the strategies</p>
                <p className="text-gray-600 text-sm">Begin with paper trading to build confidence</p>
              </div>
            </div>
          </div>
        </div>

        {/* Support Section */}
        <div className="text-center mt-8">
          <p className="text-gray-600 mb-4">Need help or have questions?</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/learning">
              <button className="bg-gray-600 hover:bg-gray-700 text-white font-medium rounded-lg py-3 px-6 touch-manipulation">
                Return to Learning Modules
              </button>
            </Link>
            <Link to="/">
              <button className="bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg py-3 px-6 touch-manipulation">
                Back to Home
              </button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

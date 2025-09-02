import React, { useState } from 'react';
import Link from 'next/link';
import Footer from './Footer';
import { CreditCard, Bell, Settings, Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function MySubscriptions() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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
                <p className="text-gray-600 text-sm">VolAlert Pro - SMS Alert System</p>
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
              <Link href="/mysubscriptions" className="text-green-600 font-medium">
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
                <Link href="/learning" className="text-gray-900 hover:text-green-600 transition-colors font-medium w-full text-center py-3 rounded-md hover:bg-gray-100 touch-manipulation" onClick={() => setIsMobileMenuOpen(false)}>
                  Learning Modules
                </Link>
                <Link href="/scanner" className="text-gray-900 hover:text-green-600 transition-colors font-medium w-full text-center py-3 rounded-md hover:bg-gray-100 touch-manipulation" onClick={() => setIsMobileMenuOpen(false)}>
                  Scanner
                </Link>
                <Link href="/straddle-calculator" className="text-gray-900 hover:text-green-600 transition-colors font-medium w-full text-center py-3 rounded-md hover:bg-gray-100 touch-manipulation" onClick={() => setIsMobileMenuOpen(false)}>
                  Straddle Calculator
                </Link>
                <Link href="/mysubscriptions" className="text-green-600 font-medium w-full text-center py-3 rounded-md hover:bg-gray-100 touch-manipulation" onClick={() => setIsMobileMenuOpen(false)}>
                  My Subscriptions
                </Link>
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Bell className="h-10 w-10 text-green-600" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Manage Your VolAlert Pro Subscription</h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            View your subscription details, update payment methods, and manage your VolAlert Pro SMS alerts.
          </p>
        </div>

        {/* Subscription Management Card */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-8 mb-8">
          <div className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CreditCard className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">Subscription Management</h2>
            <p className="text-gray-600 mb-8 max-w-lg mx-auto">
              Access your Stripe billing portal to view invoices, update payment methods, and manage your subscription settings.
            </p>
            <a 
              href="https://billing.stripe.com/p/login/cNi28tdb74N6d8L6lz0oM00" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-block"
            >
              <button className="bg-green-600 hover:bg-green-700 text-white px-8 py-4 text-lg rounded-lg font-medium transition-colors flex items-center mx-auto">
                <Settings className="mr-3 h-5 w-5" />
                Access Billing Portal
              </button>
            </a>
          </div>
        </div>

        {/* Features Reminder */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8">
          <h3 className="text-xl font-semibold text-gray-900 mb-4 text-center">What You Get with VolAlert Pro</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                <div className="w-2 h-2 bg-green-600 rounded-full"></div>
              </div>
              <div>
                <h4 className="font-medium text-gray-900">Real-Time SMS Alerts</h4>
                <p className="text-sm text-gray-600">Instant notifications when dark pool activity spikes</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                <div className="w-2 h-2 bg-green-600 rounded-full"></div>
              </div>
              <div>
                <h4 className="font-medium text-gray-900">Volume Pattern Detection</h4>
                <p className="text-sm text-gray-600">AI-powered analysis of unusual trading patterns</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                <div className="w-2 h-2 bg-green-600 rounded-full"></div>
              </div>
              <div>
                <h4 className="font-medium text-gray-900">Mobile-First Experience</h4>
                <p className="text-sm text-gray-600">Never miss an opportunity with push notifications</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                <div className="w-2 h-2 bg-green-600 rounded-full"></div>
              </div>
              <div>
                <h4 className="font-medium text-gray-900">Priority Support</h4>
                <p className="text-sm text-gray-600">Direct access to our trading experts</p>
              </div>
            </div>
          </div>
        </div>

        {/* Need Help Section */}
        <div className="text-center mt-12">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Need Help with Your Subscription?</h3>
          <p className="text-gray-600 mb-6">
            If you have any questions about your VolAlert Pro subscription, our support team is here to help.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/" className="inline-block">
              <button className="bg-gray-800 hover:bg-gray-900 text-white px-6 py-3 rounded-lg font-medium transition-colors">
                Back to Home
              </button>
            </Link>
            <Link href="/scanner" className="inline-block">
              <button className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium transition-colors">
                Try Free Scanner
              </button>
            </Link>
          </div>
        </div>
      </div>

      {/* Footer */}
      <Footer />
    </div>
  );
}

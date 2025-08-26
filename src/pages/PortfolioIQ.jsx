import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, PieChart, BarChart3, Plus, Home, LogOut, User as UserIcon, ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';

// Import PortfolioIQ components
import PortfolioIQLayout from './PortfolioIQ/Layout';
import Portfolio from './PortfolioIQ/Portfolio';
import Analytics from './PortfolioIQ/Analytics';
import AddStock from './PortfolioIQ/AddStock';
import Auth from './PortfolioIQ/Auth';
import CompleteProfile from './PortfolioIQ/CompleteProfile';

export default function PortfolioIQPage() {
  const [currentView, setCurrentView] = useState('portfolio');
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user is authenticated
    checkAuth();
  }, []);

  const checkAuth = async () => {
    setIsLoading(true);
    try {
      // This would be replaced with actual auth check
      // For now, we'll simulate a loading state
      setTimeout(() => {
        setIsLoading(false);
        // If no user, show auth page
        if (!user) {
          setCurrentView('auth');
        }
      }, 1000);
    } catch (error) {
      setIsLoading(false);
      setCurrentView('auth');
    }
  };

  const handleLogout = () => {
    setUser(null);
    setCurrentView('auth');
  };

  const renderContent = () => {
    switch (currentView) {
      case 'portfolio':
        return <Portfolio />;
      case 'analytics':
        return <Analytics />;
      case 'add-stock':
        return <AddStock />;
      case 'auth':
        return <Auth onAuthSuccess={(user) => { setUser(user); setCurrentView('portfolio'); }} />;
      case 'complete-profile':
        return <CompleteProfile onComplete={() => setCurrentView('portfolio')} />;
      default:
        return <Portfolio />;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 bg-gradient-to-r from-green-600 to-green-700 rounded-xl flex items-center justify-center shadow-lg mx-auto mb-4">
            <TrendingUp className="w-7 h-7 text-white animate-pulse" />
          </div>
          <p className="text-gray-600">Loading PortfolioIQ...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header with back button */}
      <header className="border-b border-gray-200 bg-white sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link 
                to="/" 
                className="flex items-center space-x-2 text-gray-600 hover:text-green-600 transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
                <span>Back to KAHF Capital</span>
              </Link>
            </div>
            <div className="flex items-center space-x-3">
              <img 
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/87af3bb58_image.png" 
                alt="KAHF Capital Logo" 
                className="h-8 w-auto"
              />
              <div>
                <h1 className="text-lg font-bold text-gray-900">PortfolioIQ</h1>
                <p className="text-gray-600 text-sm">Portfolio Management</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* PortfolioIQ Application */}
      <PortfolioIQLayout 
        currentView={currentView}
        onViewChange={setCurrentView}
        user={user}
        onLogout={handleLogout}
      >
        {renderContent()}
      </PortfolioIQLayout>
    </div>
  );
}

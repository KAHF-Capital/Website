import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Menu, X, User, LogOut, Settings, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';

export default function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const router = useRouter();
  const { user, userData, loading, signOut, hasActiveSubscription } = useAuth();

  const navigationItems = [
    { href: '/', label: 'Home' },
    { href: '/learning', label: 'Learning' },
    { href: '/scanner', label: 'Scanner' },
    { href: '/straddle-calculator', label: 'Straddle Calculator' },
  ];

  const isActiveRoute = (href) => {
    if (href === '/') {
      return router.pathname === '/';
    }
    return router.pathname === href;
  };

  const handleMobileMenuClose = () => {
    setIsMobileMenuOpen(false);
  };

  const handleSignOut = async () => {
    await signOut();
    setShowUserMenu(false);
    router.push('/');
  };

  const renderNavItem = (item) => {
    const isActive = isActiveRoute(item.href);
    const baseClasses = "transition-colors font-medium";
    const activeClasses = isActive ? "text-green-600" : "text-gray-900 hover:text-green-600";
    
    if (item.external) {
      return (
        <a 
          key={item.href}
          href={item.href}
          target="_blank" 
          rel="noopener noreferrer" 
          className={`${baseClasses} ${activeClasses}`}
        >
          {item.label}
        </a>
      );
    }

    if (item.dropdown) {
      return (
        <div key={item.href} className="relative">
          <button
            className={`${baseClasses} ${activeClasses}`}
            onMouseEnter={() => setShowDropdown(true)}
            onMouseLeave={() => setShowDropdown(false)}
          >
            {item.label} ▼
          </button>
          {showDropdown && (
            <div 
              className="absolute top-full left-0 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 min-w-[200px] py-1"
              onMouseEnter={() => setShowDropdown(true)}
              onMouseLeave={() => setShowDropdown(false)}
            >
              {item.items.map(subItem => (
                <Link
                  key={subItem.href}
                  href={subItem.href}
                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-green-600"
                >
                  {subItem.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      );
    }

    return (
      <Link 
        key={item.href}
        href={item.href} 
        className={`${baseClasses} ${activeClasses}`}
        onClick={handleMobileMenuClose}
      >
        {item.label}
      </Link>
    );
  };

  const renderAuthButtons = () => {
    if (loading) {
      return (
        <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse"></div>
      );
    }

    if (user) {
      return (
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center space-x-2 text-gray-700 hover:text-green-600 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
              {user.photoURL ? (
                <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full" />
              ) : (
                <User className="h-4 w-4 text-green-600" />
              )}
            </div>
            <span className="hidden md:inline font-medium text-sm">
              {user.displayName || user.email?.split('@')[0]}
            </span>
            <ChevronDown className="h-4 w-4" />
          </button>

          {/* User Dropdown Menu */}
          <AnimatePresence>
            {showUserMenu && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50"
              >
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-medium text-gray-900">{user.displayName || 'User'}</p>
                  <p className="text-xs text-gray-500 truncate">{user.email}</p>
                  {hasActiveSubscription() && (
                    <span className="inline-block mt-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                      VolAlert Pro
                    </span>
                  )}
                </div>
                
                <Link
                  href="/account"
                  onClick={() => setShowUserMenu(false)}
                  className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Account Settings
                </Link>
                
                <a
                  href="https://billing.stripe.com/p/login/cNi28tdb74N6d8L6lz0oM00"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setShowUserMenu(false)}
                  className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Manage Subscription
                </a>
                
                <button
                  onClick={handleSignOut}
                  className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      );
    }

    return (
      <div className="flex items-center space-x-3">
        <Link
          href="/login"
          className="text-gray-700 hover:text-green-600 font-medium transition-colors"
        >
          Sign In
        </Link>
        <Link
          href="/signup"
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          Sign Up
        </Link>
      </div>
    );
  };

  return (
    <header className="border-b border-gray-200 sticky top-0 bg-white/80 backdrop-blur-sm z-50">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Logo and Brand */}
          <Link href="/" className="flex items-center space-x-3">
            <img 
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/87af3bb58_image.png" 
              alt="KAHF Capital Logo" 
              className="h-10 w-auto"
            />
            <div>
              <h1 className="text-xl font-bold text-gray-900">KAHF Capital</h1>
              <p className="text-gray-600 text-sm hidden sm:block">Volatility Trading Platform</p>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            <nav className="flex space-x-6">
              {navigationItems.map(renderNavItem)}
            </nav>
            {renderAuthButtons()}
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden flex items-center space-x-3">
            {/* Mobile Auth - Show avatar or sign in */}
            {!loading && user ? (
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="p-1"
              >
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full" />
                  ) : (
                    <User className="h-4 w-4 text-green-600" />
                  )}
                </div>
              </button>
            ) : !loading && (
              <Link href="/login" className="text-sm text-green-600 font-medium">
                Sign In
              </Link>
            )}
            
            <button 
              className="p-2 text-gray-900 hover:text-green-600 touch-manipulation" 
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Toggle mobile menu"
            >
              {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile User Menu */}
      <AnimatePresence>
        {showUserMenu && user && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="md:hidden absolute right-4 top-16 w-56 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50"
          >
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-medium text-gray-900">{user.displayName || 'User'}</p>
              <p className="text-xs text-gray-500 truncate">{user.email}</p>
              {hasActiveSubscription() && (
                <span className="inline-block mt-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                  VolAlert Pro
                </span>
              )}
            </div>
            
            <Link
              href="/account"
              onClick={() => setShowUserMenu(false)}
              className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              <Settings className="h-4 w-4 mr-2" />
              Account Settings
            </Link>
            
            <a
              href="https://billing.stripe.com/p/login/cNi28tdb74N6d8L6lz0oM00"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setShowUserMenu(false)}
              className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              <Settings className="h-4 w-4 mr-2" />
              Manage Subscription
            </a>
            
            <button
              onClick={handleSignOut}
              className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden overflow-hidden"
          >
            <nav className="flex flex-col items-center space-y-1 p-3 border-t border-gray-200">
              {navigationItems.map((item) => {
                const isActive = isActiveRoute(item.href);
                const baseClasses = "w-full text-center py-3 rounded-md transition-colors font-medium touch-manipulation";
                const activeClasses = isActive 
                  ? "text-green-600 bg-green-50" 
                  : "text-gray-900 hover:text-green-600 hover:bg-gray-100";

                if (item.dropdown) {
                  return (
                    <div key={item.href} className="w-full">
                      <div className={`${baseClasses} ${activeClasses} font-semibold`}>
                        {item.label}
                      </div>
                      {item.items.map(subItem => (
                        <Link
                          key={subItem.href}
                          href={subItem.href}
                          className="block w-full py-2 px-4 text-sm text-gray-700 hover:bg-gray-100 hover:text-green-600 touch-manipulation"
                          onClick={handleMobileMenuClose}
                        >
                          • {subItem.label}
                        </Link>
                      ))}
                    </div>
                  );
                }

                if (item.external) {
                  return (
                    <a 
                      key={item.href}
                      href={item.href}
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className={`${baseClasses} ${activeClasses}`}
                      onClick={handleMobileMenuClose}
                    >
                      {item.label}
                    </a>
                  );
                }

                return (
                  <Link 
                    key={item.href}
                    href={item.href} 
                    className={`${baseClasses} ${activeClasses}`}
                    onClick={handleMobileMenuClose}
                  >
                    {item.label}
                  </Link>
                );
              })}
              
              {/* Mobile Sign Up CTA if not logged in */}
              {!user && !loading && (
                <Link
                  href="/signup"
                  className="w-full text-center py-3 bg-green-600 text-white rounded-md font-medium touch-manipulation mt-2"
                  onClick={handleMobileMenuClose}
                >
                  Sign Up Free
                </Link>
              )}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

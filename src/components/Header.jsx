import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession, signOut } from 'next-auth/react';
import { Menu, X, User, LogOut, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const router = useRouter();
  const { data: session, status } = useSession();

  const navigationItems = [
    { href: '/', label: 'Home' },
    { href: '/learning', label: 'Learning Modules' },
    { href: '/scanner', label: 'Scanner' },
    { href: '/straddle-calculator', label: 'Straddle Calculator' },
    { 
      href: 'https://billing.stripe.com/p/login/cNi28tdb74N6d8L6lz0oM00', 
      label: 'My Subscriptions',
      external: true 
    }
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
    await signOut({ callbackUrl: '/' });
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

  return (
    <header className="border-b border-gray-200 sticky top-0 bg-white/80 backdrop-blur-sm z-50">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Logo and Brand */}
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

          {/* Desktop Navigation */}
          <nav className="hidden sm:flex space-x-8">
            {navigationItems.map(renderNavItem)}
          </nav>

          {/* Auth Section */}
          <div className="hidden sm:flex items-center space-x-4">
            {status === 'loading' ? (
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600"></div>
            ) : session ? (
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center space-x-2 text-gray-700 hover:text-green-600 transition-colors"
                >
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                    <User className="h-4 w-4 text-green-600" />
                  </div>
                  <span className="text-sm font-medium">{session.user.name}</span>
                  {session.user.subscriptionStatus === 'pro' && (
                    <Zap className="h-4 w-4 text-green-600" />
                  )}
                </button>

                <AnimatePresence>
                  {showUserMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50"
                    >
                      <div className="px-4 py-2 border-b border-gray-100">
                        <p className="text-sm font-medium text-gray-900">{session.user.name}</p>
                        <p className="text-xs text-gray-500">{session.user.email}</p>
                        <p className="text-xs text-green-600 font-medium capitalize">
                          {session.user.subscriptionStatus} Plan
                        </p>
                      </div>
                      <button
                        onClick={handleSignOut}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                      >
                        <LogOut className="h-4 w-4 mr-2" />
                        Sign out
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <div className="flex items-center space-x-3">
                <Link href="/auth/signin">
                  <button className="text-gray-700 hover:text-green-600 font-medium transition-colors">
                    Sign In
                  </button>
                </Link>
                <Link href="/auth/signup">
                  <button className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">
                    Sign Up
                  </button>
                </Link>
              </div>
            )}
          </div>

          {/* Mobile Menu Button */}
          <div className="sm:hidden">
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

      {/* Mobile Menu */}
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
              {navigationItems.map((item) => {
                const isActive = isActiveRoute(item.href);
                const baseClasses = "w-full text-center py-3 rounded-md transition-colors font-medium touch-manipulation";
                const activeClasses = isActive 
                  ? "text-green-600 bg-green-50" 
                  : "text-gray-900 hover:text-green-600 hover:bg-gray-100";

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
              
              {/* Mobile Auth Section */}
              <div className="w-full border-t border-gray-200 pt-3 mt-3">
                {session ? (
                  <div className="space-y-2">
                    <div className="px-3 py-2 text-center">
                      <p className="text-sm font-medium text-gray-900">{session.user.name}</p>
                      <p className="text-xs text-gray-500">{session.user.email}</p>
                      <p className="text-xs text-green-600 font-medium capitalize">
                        {session.user.subscriptionStatus} Plan
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        handleSignOut();
                        handleMobileMenuClose();
                      }}
                      className="w-full text-center py-3 rounded-md text-gray-700 hover:text-red-600 hover:bg-red-50 transition-colors font-medium touch-manipulation flex items-center justify-center"
                    >
                      <LogOut className="h-4 w-4 mr-2" />
                      Sign out
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Link href="/auth/signin" onClick={handleMobileMenuClose}>
                      <button className="w-full text-center py-3 rounded-md text-gray-700 hover:text-green-600 hover:bg-gray-100 transition-colors font-medium touch-manipulation">
                        Sign In
                      </button>
                    </Link>
                    <Link href="/auth/signup" onClick={handleMobileMenuClose}>
                      <button className="w-full text-center py-3 rounded-md bg-green-600 hover:bg-green-700 text-white transition-colors font-medium touch-manipulation">
                        Sign Up
                      </button>
                    </Link>
                  </div>
                )}
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const router = useRouter();

  const navigationItems = [
    { href: '/', label: 'Home' },
    { href: '/learning', label: 'Learning Modules' },
    { href: '/scanner', label: 'Dark Pool Scanner' },
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
          <div className="hidden sm:flex items-center space-x-8">
            <nav className="flex space-x-8">
              {navigationItems.map(renderNavItem)}
            </nav>
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
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

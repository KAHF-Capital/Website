import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Menu, X, User, LogOut, Settings, ChevronDown, Bot, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { track } from '../../lib/analytics';

const navigationItems = [
  { href: '/kahf-ai', label: 'KAHF AI', primary: true },
  { href: '/scanner', label: 'Scanner' },
  { href: '/calculator', label: 'Calculator' },
  { href: '/wins', label: 'Track Record' },
  { href: '/pricing', label: 'Pricing' }
];

export default function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const router = useRouter();
  const { user, loading, signOut, hasActiveSubscription } = useAuth();

  const isActiveRoute = (href) => router.pathname === href;
  const closeMenu = () => setIsMobileMenuOpen(false);

  const handleSignOut = async () => {
    await signOut();
    setShowUserMenu(false);
    router.push('/');
  };

  const renderNavItem = (item) => {
    const isActive = isActiveRoute(item.href);
    let cls = 'transition-colors font-medium text-sm';
    if (item.primary) {
      cls += isActive
        ? ' text-green-600 inline-flex items-center gap-1.5'
        : ' text-gray-900 hover:text-green-600 inline-flex items-center gap-1.5';
    } else {
      cls += isActive ? ' text-green-600' : ' text-gray-700 hover:text-green-600';
    }
    return (
      <Link
        key={item.href}
        href={item.href}
        className={cls}
        onClick={() => track('nav_click', { href: item.href })}
      >
        {item.primary && <Sparkles className="h-3.5 w-3.5" />}
        {item.label}
      </Link>
    );
  };

  const renderAuthButtons = () => {
    if (loading) {
      return <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse" />;
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
                      Pro
                    </span>
                  )}
                </div>
                <Link
                  href="/account"
                  onClick={() => setShowUserMenu(false)}
                  className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Account
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
      <div className="flex items-center space-x-2">
        <Link
          href="/login"
          className="text-gray-700 hover:text-green-600 font-medium text-sm transition-colors px-3 py-2"
        >
          Sign In
        </Link>
        <Link
          href="/pricing"
          onClick={() => track('header_cta_clicked', { source: 'desktop' })}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-semibold text-sm transition-colors shadow-sm"
        >
          Start Free Trial
        </Link>
      </div>
    );
  };

  return (
    <header className="border-b border-gray-200 sticky top-0 bg-white/85 backdrop-blur-md z-50">
      <div className="max-w-7xl mx-auto px-4 py-3.5">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-2.5">
            <img
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/87af3bb58_image.png"
              alt="KAHF Capital Logo"
              className="h-9 w-auto"
            />
            <div>
              <h1 className="text-lg font-bold text-gray-900 leading-none">KAHF</h1>
              <p className="text-[10px] text-gray-500 hidden sm:block uppercase tracking-wider mt-0.5">AI Volatility Analyst</p>
            </div>
          </Link>

          <div className="hidden md:flex items-center space-x-7">
            <nav className="flex items-center space-x-6">{navigationItems.map(renderNavItem)}</nav>
            {renderAuthButtons()}
          </div>

          <div className="md:hidden flex items-center space-x-2">
            {!loading && user ? (
              <button onClick={() => setShowUserMenu(!showUserMenu)} className="p-1">
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full" />
                  ) : (
                    <User className="h-4 w-4 text-green-600" />
                  )}
                </div>
              </button>
            ) : !loading ? (
              <Link
                href="/pricing"
                className="text-xs font-bold bg-green-600 text-white px-3 py-1.5 rounded-md"
              >
                Try Free
              </Link>
            ) : null}
            <button
              className="p-2 text-gray-900 hover:text-green-600 touch-manipulation"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

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
                  Pro
                </span>
              )}
            </div>
            <Link
              href="/account"
              onClick={() => setShowUserMenu(false)}
              className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              <Settings className="h-4 w-4 mr-2" />
              Account
            </Link>
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

      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden overflow-hidden border-t border-gray-200"
          >
            <nav className="flex flex-col p-3 space-y-1 bg-white">
              {navigationItems.map((item) => {
                const isActive = isActiveRoute(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`w-full text-left px-3 py-3 rounded-md font-medium transition-colors flex items-center gap-2 ${
                      isActive ? 'text-green-600 bg-green-50' : 'text-gray-900 hover:text-green-600 hover:bg-gray-50'
                    }`}
                    onClick={closeMenu}
                  >
                    {item.primary && <Bot className="h-4 w-4" />}
                    {item.label}
                  </Link>
                );
              })}
              {!user && !loading && (
                <Link
                  href="/pricing"
                  className="w-full text-center py-3 bg-green-600 text-white rounded-md font-semibold mt-2"
                  onClick={closeMenu}
                >
                  Start Free Trial
                </Link>
              )}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

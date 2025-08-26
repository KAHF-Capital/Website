import React from 'react';
import { TrendingUp, PieChart, BarChart3, Plus, Home, LogOut, User as UserIcon } from 'lucide-react';

const navigationItems = [
  {
    title: "Portfolio",
    view: "portfolio",
    icon: Home,
  },
  {
    title: "Analytics",
    view: "analytics",
    icon: BarChart3,
  },
  {
    title: "Add Stocks",
    view: "add-stock",
    icon: Plus,
  },
];

export default function PortfolioIQLayout({ children, currentView, onViewChange, user, onLogout }) {
  return (
    <div className="min-h-screen flex w-full bg-white">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 hidden md:block">
        {/* Sidebar Header */}
        <div className="bg-gradient-to-r from-green-600 to-green-700 p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center shadow-lg">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-xl text-white">PortfolioIQ</h2>
              <p className="text-xs text-green-100">by KAHF Capital</p>
            </div>
          </div>
        </div>
        
        {/* Sidebar Content */}
        <div className="p-4">
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 py-2">
              Navigation
            </div>
            <nav className="space-y-1">
              {navigationItems.map((item) => (
                <button
                  key={item.title}
                  onClick={() => onViewChange(item.view)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                    currentView === item.view 
                      ? 'bg-green-50 text-green-800 shadow-sm' 
                      : 'hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="font-medium">{item.title}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 mt-auto">
          {user && (
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                <UserIcon className="w-4 h-4 text-green-600" />
              </div>
              <div className="text-left flex-1">
                <p className="text-sm font-medium">{user.full_name || 'User'}</p>
                <p className="text-xs text-gray-500">{user.email || 'user@example.com'}</p>
              </div>
              <button
                onClick={onLogout}
                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-4">
          <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-gray-900">PortfolioIQ</h1>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        <div className="flex-1 overflow-auto bg-white">
          {children}
        </div>
      </main>
    </div>
  );
}

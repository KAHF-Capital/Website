import React from 'react';
import { Instagram, Mail } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-gray-900 text-white mt-16">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Contact Information */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Connect With Us</h3>
            <div className="space-y-3">
              <a 
                href="https://www.instagram.com/kahfcapital" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center space-x-3 text-gray-300 hover:text-white transition-colors"
              >
                <Instagram className="h-5 w-5" />
                <span>@kahfcapital</span>
              </a>
              <a 
                href="https://www.tiktok.com/@kahfcapital" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center space-x-3 text-gray-300 hover:text-white transition-colors"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
                </svg>
                <span>@kahfcapital</span>
              </a>
              <a 
                href="mailto:info@kahfcapital.com"
                className="flex items-center space-x-3 text-gray-300 hover:text-white transition-colors"
              >
                <Mail className="h-5 w-5" />
                <span>info@kahfcapital.com</span>
              </a>
            </div>
          </div>

          {/* Disclaimers */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Important Disclaimers</h3>
            <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
              <p>
                <strong className="text-white">Risk Disclosure:</strong> Trading options and volatility strategies involves substantial risk of loss and is not suitable for all investors. You can lose more than your initial investment.
              </p>
              <p>
                <strong className="text-white">Educational Content:</strong> The information provided is for educational purposes only and does not constitute financial advice, investment recommendations, or trading advice.
              </p>
              <p>
                <strong className="text-white">Past Performance:</strong> Past performance does not guarantee future results. Historical data and strategies may not be indicative of future performance.
              </p>
              <p>
                <strong className="text-white">Consult Professionals:</strong> Always consult with qualified financial advisors, tax professionals, and legal counsel before making investment decisions.
              </p>
            </div>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="border-t border-gray-700 mt-8 pt-6">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <div className="flex items-center space-x-3">
              <img 
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/87af3bb58_image.png" 
                alt="KAHF Capital Logo" 
                className="h-8 w-auto"
              />
              <span className="text-gray-300">© 2024 KAHF Capital. All rights reserved.</span>
            </div>
            <div className="text-sm text-gray-400">
              <p>This website is not affiliated with any financial institution or regulatory body.</p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

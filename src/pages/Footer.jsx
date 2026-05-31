import React from 'react';
import Link from 'next/link';
import { Instagram, Mail, Twitter, MessageCircle } from 'lucide-react';
import { siteConfig } from '../../lib/site-config';

function TikTokIcon({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
    </svg>
  );
}

export default function Footer() {
  const products = [
    { href: '/kahf-ai', label: 'KAHF AI' },
    { href: '/scanner', label: 'Dark Pool Scanner' },
    { href: '/calculator', label: 'Volatility Calculator' },
    { href: '/wins', label: 'Track Record' }
  ];
  const company = [
    { href: '/pricing', label: 'Pricing' },
    { href: '/account', label: 'Account' },
    { href: `mailto:${siteConfig.supportEmail}`, label: 'Contact' }
  ];

  return (
    <footer className="bg-gray-950 text-gray-300 mt-16">
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-10">
          {/* Brand + social */}
          <div className="col-span-2">
            <div className="flex items-center gap-3 mb-4">
              <img
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/87af3bb58_image.png"
                alt="KAHF Capital"
                className="h-9 w-auto"
              />
              <div>
                <div className="text-white font-bold">KAHF Capital</div>
                <div className="text-xs text-gray-500 uppercase tracking-wider">AI · Volatility</div>
              </div>
            </div>
            <p className="text-sm leading-relaxed text-gray-400 mb-5 max-w-md">
              Your AI volatility analyst. Trained on a decade of institutional flow, dark pool prints, and historical options moves — finds the best volatility play for any setup.
            </p>
            <div className="flex items-center gap-3">
              {siteConfig.social.twitter && (
                <a href={siteConfig.social.twitter} target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-md bg-gray-800 hover:bg-gray-700 flex items-center justify-center text-gray-300 hover:text-white transition-colors" aria-label="Twitter / X">
                  <Twitter className="h-4 w-4" />
                </a>
              )}
              <a href={siteConfig.social.instagram} target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-md bg-gray-800 hover:bg-gray-700 flex items-center justify-center text-gray-300 hover:text-white transition-colors" aria-label="Instagram">
                <Instagram className="h-4 w-4" />
              </a>
              <a href={siteConfig.social.tiktok} target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-md bg-gray-800 hover:bg-gray-700 flex items-center justify-center text-gray-300 hover:text-white transition-colors" aria-label="TikTok">
                <TikTokIcon className="h-4 w-4" />
              </a>
              {siteConfig.social.discord && (
                <a href={siteConfig.social.discord} target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-md bg-gray-800 hover:bg-gray-700 flex items-center justify-center text-gray-300 hover:text-white transition-colors" aria-label="Discord">
                  <MessageCircle className="h-4 w-4" />
                </a>
              )}
              <a href={`mailto:${siteConfig.supportEmail}`} className="w-9 h-9 rounded-md bg-gray-800 hover:bg-gray-700 flex items-center justify-center text-gray-300 hover:text-white transition-colors" aria-label="Email">
                <Mail className="h-4 w-4" />
              </a>
            </div>
          </div>

          <div>
            <h4 className="text-white text-sm font-semibold uppercase tracking-wider mb-4">Product</h4>
            <ul className="space-y-2.5 text-sm">
              {products.map((it) => (
                <li key={it.href}>
                  <Link href={it.href} className="text-gray-400 hover:text-white transition-colors">{it.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-white text-sm font-semibold uppercase tracking-wider mb-4">Company</h4>
            <ul className="space-y-2.5 text-sm">
              {company.map((it) => (
                <li key={it.href}>
                  {it.href.startsWith('http') || it.href.startsWith('mailto:') ? (
                    <a href={it.href} className="text-gray-400 hover:text-white transition-colors">{it.label}</a>
                  ) : (
                    <Link href={it.href} className="text-gray-400 hover:text-white transition-colors">{it.label}</Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Disclaimers */}
        <div className="border-t border-gray-800 pt-6 text-xs text-gray-500 leading-relaxed space-y-2">
          <p>
            <span className="text-gray-300 font-semibold">Risk:</span> Trading options and volatility strategies involves substantial risk of loss. You can lose more than your initial investment.
          </p>
          <p>
            <span className="text-gray-300 font-semibold">Educational only:</span> Nothing on this site is financial advice or an investment recommendation. {siteConfig.legal.company} is not a registered investment adviser.
          </p>
          <p>
            <span className="text-gray-300 font-semibold">Past performance:</span> Historical and backtested data has limitations. Past performance is not indicative of future results.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-center gap-3 mt-6 pt-5 border-t border-gray-800 text-xs text-gray-500">
          <span>© {siteConfig.legal.year} {siteConfig.legal.company}. All rights reserved.</span>
          <span>Built with care for traders.</span>
        </div>
      </div>
    </footer>
  );
}

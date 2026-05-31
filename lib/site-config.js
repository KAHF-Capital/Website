// Central config for marketing surface. All values are safe to import client-side.

const PRO_MONTHLY_DEFAULT = 'https://buy.stripe.com/4gM8wR0ol1AU1q3eS50oM01';

export const siteConfig = {
  brand: 'KAHF Capital',
  product: 'KAHF AI',
  tagline: 'Your AI volatility analyst.',
  subTagline: 'KAHF AI finds the best volatility play on any ticker. Trained on a decade of institutional flow, dark pool prints, and 3 years of historical options moves. Ask anything in plain English — get a tradeable read in seconds.',
  url: process.env.NEXT_PUBLIC_BASE_URL || 'https://www.kahfcapital.com',
  supportEmail: 'info@kahfcapital.com',
  social: {
    instagram: 'https://www.instagram.com/kahfcapital',
    tiktok: 'https://www.tiktok.com/@kahfcapital',
    twitter: process.env.NEXT_PUBLIC_TWITTER_URL || 'https://twitter.com/kahfcapital',
    discord: process.env.NEXT_PUBLIC_DISCORD_URL || ''
  },
  pricing: {
    proMonthly: {
      label: 'Pro Monthly',
      price: 39,
      period: 'mo',
      checkoutUrl: process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_MONTHLY || PRO_MONTHLY_DEFAULT
    },
    proAnnual: {
      label: 'Pro Annual',
      price: 27,
      annualTotal: 324,
      period: 'mo',
      savingsPct: 30,
      checkoutUrl: process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_ANNUAL || process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_MONTHLY || PRO_MONTHLY_DEFAULT
    }
  },
  trial: {
    days: 7,
    enabled: true
  },
  guarantee: {
    days: 14,
    label: '14-day money-back guarantee'
  },
  manageBillingUrl: 'https://billing.stripe.com/p/login/cNi28tdb74N6d8L6lz0oM00',
  legal: {
    company: 'KAHF Capital LLC',
    year: 2026
  }
};

// Build a checkout URL with optional email pre-fill and referral attribution.
export function buildCheckoutUrl(baseUrl, options = {}) {
  if (!baseUrl) return '#';
  try {
    const url = new URL(baseUrl);
    if (options.email) url.searchParams.set('prefilled_email', options.email);
    if (options.refCode) url.searchParams.set('client_reference_id', options.refCode);
    if (options.utmSource) url.searchParams.set('utm_source', options.utmSource);
    if (options.utmCampaign) url.searchParams.set('utm_campaign', options.utmCampaign);
    return url.toString();
  } catch {
    return baseUrl;
  }
}

// Dynamic sitemap. Includes static pages + a programmatic page per ticker
// that has appeared in our recent dark pool data.
import { listDataFiles, getDataFile } from '../lib/blob-data';

const STATIC_PAGES = [
  { loc: '', priority: '1.0', changefreq: 'daily' },
  { loc: 'kahf-ai', priority: '0.95', changefreq: 'daily' },
  { loc: 'scanner', priority: '0.95', changefreq: 'daily' },
  { loc: 'wins', priority: '0.9', changefreq: 'daily' },
  { loc: 'pricing', priority: '0.9', changefreq: 'weekly' },
  { loc: 'calculator', priority: '0.9', changefreq: 'weekly' },
  { loc: 'straddle-calculator', priority: '0.5', changefreq: 'weekly' },
  { loc: 'signup', priority: '0.7', changefreq: 'monthly' },
  { loc: 'login', priority: '0.5', changefreq: 'monthly' }
];

const TICKER_RE = /^[A-Z]{1,6}$/;

async function getRecentTickers(limit = 1000) {
  try {
    const files = (await listDataFiles()).slice(0, 10);
    const tickers = new Set();
    for (const file of files) {
      try {
        const data = await getDataFile(file.url);
        if (!data?.tickers) continue;
        for (const t of data.tickers) {
          if (t.ticker && TICKER_RE.test(t.ticker)) tickers.add(t.ticker);
          if (tickers.size >= limit) return [...tickers];
        }
      } catch {}
    }
    return [...tickers];
  } catch {
    return [];
  }
}

export async function getServerSideProps({ res }) {
  const base = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.kahfcapital.com';
  const today = new Date().toISOString().split('T')[0];

  const tickers = await getRecentTickers(800);

  const urls = [
    ...STATIC_PAGES.map((p) => ({
      loc: `${base}/${p.loc}`,
      lastmod: today,
      changefreq: p.changefreq,
      priority: p.priority
    })),
    ...tickers.map((t) => ({
      loc: `${base}/ticker/${t}`,
      lastmod: today,
      changefreq: 'daily',
      priority: '0.6'
    }))
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
    .map(
      (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
    )
    .join('\n')}
</urlset>`;

  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.write(xml);
  res.end();

  return { props: {} };
}

export default function Sitemap() {
  return null;
}

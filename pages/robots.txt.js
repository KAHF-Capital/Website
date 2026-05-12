export async function getServerSideProps({ res }) {
  const base = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.kahfcapital.com';
  const txt = `User-agent: *
Allow: /
Disallow: /api/
Disallow: /account
Disallow: /confirmation

Sitemap: ${base}/sitemap.xml
`;
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.write(txt);
  res.end();
  return { props: {} };
}

export default function Robots() {
  return null;
}

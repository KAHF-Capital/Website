// /k/:code — tracked short link. Records the click (link, delivery, event)
// and redirects to the alert or backtest page.

import { resolveShortLink } from '../../lib/kimi/store.js';

export async function getServerSideProps({ params }) {
  const code = String(params?.code || '');
  let destination = '/kimi';
  if (/^[A-Za-z0-9]{4,16}$/.test(code)) {
    try {
      const link = await resolveShortLink(code);
      if (link?.target_path && link.target_path.startsWith('/')) destination = link.target_path;
    } catch (err) {
      console.error('[k/code] short link lookup failed:', err.message);
    }
  }
  return { redirect: { destination, permanent: false } };
}

export default function ShortLink() {
  return null;
}

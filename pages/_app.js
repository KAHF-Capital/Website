import { useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import '../src/index.css';
import { AuthProvider } from '../src/context/AuthContext';
import { initAnalytics, captureReferral, track } from '../lib/analytics';

export default function App({ Component, pageProps }) {
  const router = useRouter();

  useEffect(() => {
    initAnalytics();
    captureReferral();
  }, []);

  useEffect(() => {
    const handleRouteChange = (url) => {
      track('page_view', { url });
    };
    router.events.on('routeChangeComplete', handleRouteChange);
    return () => router.events.off('routeChangeComplete', handleRouteChange);
  }, [router.events]);

  return (
    <AuthProvider>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
        <meta name="theme-color" content="#059669" />
      </Head>
      <Component {...pageProps} />
    </AuthProvider>
  );
}

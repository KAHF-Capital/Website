// Legacy route — the page used to live at /sonnet (named after Claude Sonnet)
// before we upgraded to Opus. Redirect to the canonical /kahf-ai URL while
// preserving any query string (?q=, ?t=, etc) so deep-linked Ask-AI buttons
// from old emails / bookmarks still work.
export default function SonnetLegacyRedirect() {
  return null;
}

export async function getServerSideProps({ query, resolvedUrl }) {
  const qs = resolvedUrl.includes('?') ? resolvedUrl.slice(resolvedUrl.indexOf('?')) : '';
  return {
    redirect: {
      destination: `/kahf-ai${qs}`,
      permanent: true
    }
  };
}

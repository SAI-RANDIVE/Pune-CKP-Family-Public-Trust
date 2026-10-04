export function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_TRUST_WEBSITE || 'https://puneckptrust.org').replace(/\/$/, '');
}

export function buildMetadata({ title, description, path, type = 'website' }) {
  const url = `${getSiteUrl()}${path}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: 'Pune CKP Family Public Trust',
      type,
      locale: 'en_IN',
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

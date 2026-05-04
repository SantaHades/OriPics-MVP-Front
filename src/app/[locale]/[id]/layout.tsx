import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

export async function generateMetadata({
  params: { locale, id },
}: {
  params: { locale: string; id: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'LinkViewer' });
  const url = `https://www.ori.pics/${id}`;
  const title = t('og_title');
  const description = t('og_description');

  return {
    title,
    description,
    openGraph: {
      type: 'article',
      siteName: 'OriPics',
      title,
      description,
      url,
      images: [{ url: '/logo-long.png', width: 1055, height: 400, alt: 'OriPics' }],
      locale,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/logo-long.png'],
    },
  };
}

export default function LinkLayout({ children }: { children: React.ReactNode }) {
  return children;
}

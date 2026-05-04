import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import '@/app/globals.css';
import { AuthProvider } from '@/components/AuthProvider';

export async function generateMetadata({params: {locale}}: {params: {locale: string}}) {
  const t = await getTranslations({locale, namespace: 'Common'});
 
  return {
    metadataBase: new URL('https://www.ori.pics'),
    title: t('meta_title'),
    description: t('meta_description'),
    icons: {
      icon: [
        { url: '/icon.png', type: 'image/png' },
        { url: '/favicon.ico', type: 'image/x-icon' },
      ],
      apple: '/apple-icon.png',
    },
    openGraph: {
      type: 'website',
      siteName: 'OriPics',
      title: t('meta_title'),
      description: t('meta_description'),
      images: [{ url: '/logo-long.png', width: 1055, height: 400, alt: 'OriPics' }],
      locale,
    },
    twitter: {
      card: 'summary_large_image',
      title: t('meta_title'),
      description: t('meta_description'),
      images: ['/logo-long.png'],
    },
  };
}

export default async function RootLayout({
  children,
  params: { locale }
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className="antialiased bg-slate-50 text-slate-900">
        <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Seoul">
          <AuthProvider>
            {children}
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

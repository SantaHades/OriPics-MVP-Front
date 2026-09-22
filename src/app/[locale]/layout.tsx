import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import '@/app/globals.css';
import { AuthProvider } from '@/components/AuthProvider';

export async function generateMetadata(props: {params: Promise<{locale: string}>}) {
  const params = await props.params;

  const {
    locale
  } = params;

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
      images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'OriPics — the original proof' }],
      locale,
    },
    twitter: {
      card: 'summary_large_image',
      title: t('meta_title'),
      description: t('meta_description'),
      images: ['/og-image.png'],
    },
  };
}

export default async function RootLayout(
  props: {
    children: React.ReactNode;
    params: Promise<{ locale: string }>;
  }
) {
  const params = await props.params;

  const {
    locale
  } = params;

  const {
    children
  } = props;

  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className="antialiased bg-slate-50 text-slate-900">
        <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Seoul">
          <AuthProvider>
            {children}
            {/* 소셜 가입 직후 파트너코드 환영 모달 (A-82·A-92) — 홈 외 첫 진입 경로에서도 1회 노출. 제외 경로는 컴포넌트 내부에서 판정 */}
            {/* (2026-09-22) 웹 파트너 참여 경로 차단(A-106) — 코드 입력은 앱 전용이므로 환영 모달도 내린다.
                앱 첫 로그인 시 partner-join-prompt가 같은 역할을 한다. 컴포넌트는 남겨 두되 마운트만 해제. */}
            {/* <PartnerWelcomePrompt /> */}
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

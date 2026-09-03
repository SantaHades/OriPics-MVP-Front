import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import { verifyLinkId } from '@/lib/oripics-stamp/common';

// A-67 (2026-09-04 대표): 공개링크 미리보기(og:image)를 로고 대신 사진 썸네일로.
// 카톡·라인·슬랙·iMessage 등 모든 메신저가 같은 Open Graph 태그를 읽는다.
// 이미지 출처 우선순위: ①발행 시 저장된 뷰어 경량본(preview_path, 긴 변 1600px JPEG ≤0.9MB)
// ②경량본이 없으면(원본 ≤0.7MB라 생략된 경우) 원본 PNG ③그 외(구링크·대형)는 로고 폴백.
// 만료·미존재 링크는 로고. 조회 실패는 절대 페이지를 깨지 않도록 기본 메타로 폴백.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const PREVIEW_MAX_EDGE = 1600; // apps/web/src/lib/oripics-stamp/index.ts PREVIEW_MAX_EDGE와 동일
const ORIGINAL_FALLBACK_MAX_PIXELS = 3_000_000; // 경량본 없을 때 원본을 og:image로 쓸 상한

type LinkMeta = {
  imageUrl: string;
  width?: number;
  height?: number;
  tier?: string | null;
  capturedAt?: string | null;
};

async function loadLinkMeta(linkId: string): Promise<LinkMeta | null> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !verifyLinkId(linkId)) return null;
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: row, error } = await supabase
      .from('links')
      .select('width, height, tier, captured_at, signed_url, preview_path, expires_at')
      .eq('link_id', linkId)
      .single();
    if (error || !row) return null;
    if (row.expires_at && new Date(row.expires_at) <= new Date()) return null;
    const w = Number(row.width) || 0;
    const h = Number(row.height) || 0;
    if (row.preview_path) {
      const scale = Math.min(1, PREVIEW_MAX_EDGE / Math.max(w || 1, h || 1));
      return {
        imageUrl: `${SUPABASE_URL}/storage/v1/object/public/oripics-proofs/${row.preview_path}`,
        width: w ? Math.round(w * scale) : undefined,
        height: h ? Math.round(h * scale) : undefined,
        tier: row.tier,
        capturedAt: row.captured_at,
      };
    }
    if (row.signed_url && w * h > 0 && w * h <= ORIGINAL_FALLBACK_MAX_PIXELS) {
      return { imageUrl: row.signed_url, width: w, height: h, tier: row.tier, capturedAt: row.captured_at };
    }
    return null;
  } catch {
    return null;
  }
}

export async function generateMetadata(
  props: {
    params: Promise<{ locale: string; id: string }>;
  }
): Promise<Metadata> {
  const params = await props.params;

  const {
    locale,
    id
  } = params;

  const t = await getTranslations({ locale, namespace: 'LinkViewer' });
  const url = `https://www.ori.pics/${id}`;
  const meta = await loadLinkMeta(id);
  const tierSuffix = meta?.tier === 'verified' ? ' · Verified' : '';
  const title = `${t('og_title')}${tierSuffix}`;
  const description = `${t('og_description')}\n${url}`;
  const image = meta
    ? { url: meta.imageUrl, width: meta.width, height: meta.height, alt: title }
    : { url: '/og-image.png', width: 1200, height: 630, alt: 'OriPics — the original proof' };

  return {
    title,
    description,
    openGraph: {
      type: 'article',
      siteName: 'OriPics',
      title,
      description,
      url,
      images: [image],
      locale,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image.url],
    },
  };
}

export default function LinkLayout({ children }: { children: React.ReactNode }) {
  return children;
}

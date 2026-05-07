// PoC: @contentauth/c2pa-node Vercel 호환성 검증용 임시 라우트
// 검증 후 삭제 예정 (Track A 정식 통합 시점)
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const start = Date.now();
  try {
    const c2pa = await import('@contentauth/c2pa-node');
    const exportNames = Object.keys(c2pa).sort();
    return NextResponse.json({
      ok: true,
      ms: Date.now() - start,
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      exports: exportNames,
      hasBuilder: typeof (c2pa as any).Builder !== 'undefined',
      hasReader: typeof (c2pa as any).Reader !== 'undefined',
      hasLocalSigner: typeof (c2pa as any).LocalSigner !== 'undefined',
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        ms: Date.now() - start,
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        error: e?.message || String(e),
        code: e?.code,
        stack: e?.stack?.split('\n').slice(0, 5),
      },
      { status: 500 },
    );
  }
}

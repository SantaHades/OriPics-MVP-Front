// PoC: builder.sign() 반환 시맨틱 + 자체서명 인증서 매니페스트 첨부 검증
// 검증 후 삭제 예정
// rev: 2026-05-07 PKCS#8 key
import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const wantPng = url.searchParams.get('png') === '1';
  const start = Date.now();

  try {
    const certPem = process.env.ORIPICS_C2PA_CERT_PEM;
    const keyPem = process.env.ORIPICS_C2PA_KEY_PEM;
    if (!certPem || !keyPem) throw new Error('certs_missing_in_env');

    // 입력 PNG: public/logo.png
    const logoPath = path.join(process.cwd(), 'public', 'logo.png');
    const inputPng = await fs.readFile(logoPath);

    const c2pa = await import('@contentauth/c2pa-node');
    const { Builder, LocalSigner, Reader, createVerifySettings, createTrustSettings, mergeSettings } = c2pa;

    const signer = LocalSigner.newSigner(
      Buffer.from(certPem),
      Buffer.from(keyPem),
      'es256',
    );

    const manifestSpec = {
      claim_generator: 'oripics-poc/0.1.0',
      title: 'OriPics PoC Signed Image',
      format: 'image/png',
      assertions: [
        {
          label: 'c2pa.actions.v2',
          data: {
            actions: [
              {
                action: 'c2pa.created',
                digitalSourceType:
                  'http://cv.iptc.org/newscodes/digitalsourcetype/algorithmicMedia',
                softwareAgent: { name: 'oripics-poc' },
              },
            ],
          },
        },
        {
          label: 'com.oripics.proof',
          data: { tier: 'standard', poc: true },
        },
      ],
    };

    // PoC: settings를 JSON string으로 직접 (snake_case, c2pa-rs raw 형식)
    void mergeSettings; void createTrustSettings; void createVerifySettings; // unused 표시 회피
    const settingsJson = JSON.stringify({
      trust: {
        verify_trust_list: false,
        user_anchors: certPem,
      },
      verify: {
        verify_after_sign: false,
        verify_after_reading: false,
      },
    });
    const builder = Builder.withJson(manifestSpec as any, settingsJson as any);
    const inputAsset = { buffer: inputPng, mimeType: 'image/png' };
    const outputAsset: any = { buffer: null };

    // sign 시그니처: (signer, SourceAsset, DestinationAsset) => Buffer (sync)
    const signedBuffer: Buffer = builder.sign(signer, inputAsset, outputAsset);

    if (!signedBuffer || signedBuffer.length === 0) {
      return NextResponse.json(
        { ok: false, stage: 'sign_returned_empty', ms: Date.now() - start },
        { status: 500 },
      );
    }

    // PNG 다운로드 모드
    if (wantPng) {
      return new Response(new Uint8Array(signedBuffer), {
        headers: {
          'Content-Type': 'image/png',
          'Content-Disposition': 'attachment; filename="poc-signed.png"',
        },
      });
    }

    // 진단 모드: signed buffer를 다시 Reader로 읽어 매니페스트 검증
    let manifestStoreInfo: any = null;
    try {
      const reader = await Reader.fromAsset({
        buffer: signedBuffer,
        mimeType: 'image/png',
      });
      if (!reader) throw new Error('reader_returned_null');
      const json = reader.json();
      const parsed = typeof json === 'string' ? JSON.parse(json) : json;
      manifestStoreInfo = {
        readerOk: true,
        activeManifestLabel: parsed?.active_manifest,
        manifestKeys: parsed?.manifests ? Object.keys(parsed.manifests) : null,
        firstManifestPreview:
          parsed?.manifests && Object.values(parsed.manifests)[0]
            ? Object.keys(Object.values(parsed.manifests)[0] as any)
            : null,
        validationStatus: parsed?.validation_status ?? null,
      };
    } catch (rErr: any) {
      manifestStoreInfo = { readerOk: false, error: rErr?.message || String(rErr) };
    }

    return NextResponse.json({
      ok: true,
      ms: Date.now() - start,
      input: { bytes: inputPng.length },
      output: {
        bytes: signedBuffer.length,
        sizeIncrease: signedBuffer.length - inputPng.length,
      },
      manifestStore: manifestStoreInfo,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        ms: Date.now() - start,
        stage: 'caught_exception',
        error: e?.message || String(e),
        code: e?.code,
        stack: e?.stack?.split('\n').slice(0, 8),
      },
      { status: 500 },
    );
  }
}

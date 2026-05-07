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
    const { Builder, LocalSigner, Reader } = c2pa;

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

    const builder = Builder.withJson(manifestSpec as any);
    const inputAsset = { buffer: inputPng, mimeType: 'image/png' };
    const outputAsset: any = { buffer: Buffer.alloc(0), mimeType: 'image/png' };

    const signResult: any = await builder.sign(signer, inputAsset, outputAsset);

    // 어느 쪽이 signed buffer인지 진단
    const signedFromOutput =
      outputAsset.buffer && outputAsset.buffer.length > 0 ? outputAsset.buffer : null;
    const signedFromResult = Buffer.isBuffer(signResult) ? signResult : null;
    const signedFromResultProperty =
      signResult && typeof signResult === 'object' && Buffer.isBuffer(signResult.buffer)
        ? signResult.buffer
        : null;

    const signedBuffer: Buffer | null =
      signedFromOutput || signedFromResult || signedFromResultProperty;

    if (!signedBuffer || signedBuffer.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          stage: 'sign_returned_no_buffer',
          ms: Date.now() - start,
          diagnosis: {
            signResultType: typeof signResult,
            signResultIsBuffer: Buffer.isBuffer(signResult),
            signResultKeys:
              signResult && typeof signResult === 'object' ? Object.keys(signResult) : null,
            outputBufferLength: outputAsset.buffer?.length ?? null,
          },
        },
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
      signReturnDiagnosis: {
        bufferFromOutput: !!signedFromOutput,
        bufferFromResult: !!signedFromResult,
        bufferFromResultProperty: !!signedFromResultProperty,
        signResultType: typeof signResult,
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

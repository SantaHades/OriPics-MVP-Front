import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "crypto";
import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { CREDIT_COSTS } from "@/lib/payment";
import { consumeCredits, refundCredits } from "@/lib/credits/consumeCredits";
import { prisma } from "@/lib/prisma";
import { attachC2paManifest, oripicsTimestampToISO8601, type Tier } from "@/lib/oripics-stamp/c2pa";
import { decodePngPixels, extractFinalHashFromPixels, computeInnerHashFromPixels, hexToBytes } from "@/lib/oripics-stamp/server";
import { StepTimer } from "@/lib/timing";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const JWT_SECRET = process.env.ORIPICS_JWT_SECRET!;
const BUCKET_NAME = "oripics-proofs";
const C2PA_ENABLED = process.env.ORIPICS_C2PA_ENABLED === "true";
// 보관 정책 (pricing-policy §11.2)
const FREE_RETENTION_DAYS = 7;
const STORAGE_QUOTA_BYTES = 5 * 1024 * 1024 * 1024; // Pro 보관함 5GB
// 인증 이미지는 불변 — CDN 캐시 1년 (egress 대비책 계층 2, A-36 선행)
const IMMUTABLE_CACHE_SECONDS = "31536000";

export const runtime = "nodejs";
export const maxDuration = 60;

function verifyReceiptJwt(token: string): Record<string, any> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("invalid_jwt");
  const [header, payload, sig] = parts;
  const expected = createHmac("sha256", JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest("base64url");
  if (expected !== sig) throw new Error("invalid_signature");
  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
  if (decoded.exp < Date.now() / 1000) throw new Error("jwt_expired");
  if (decoded.aud !== "links/publish") throw new Error("invalid_audience");
  return decoded;
}

/**
 * /api/links/publish — 2026-05-17 B-2'' (최종)
 *
 * 입력: JSON { receipt, thumbnail? }
 *   - receipt: /api/links/confirm에서 발급된 JWT (publish용)
 *   - thumbnail: 선택 — base64 dataURL (ProofHistory 표시용)
 *
 * 전제: 클라이언트가 stamped PNG를 sign 응답의 signed_upload_url을 통해
 * Supabase Storage에 이미 업로드 완료한 상태.
 *
 * 처리:
 *   1. receipt JWT 검증 (만료, 본인 매칭)
 *   2. LINK_CREATE(-2) 차감
 *   3. Storage에서 LSB-stamped PNG 다운로드
 *   4. C2PA 매니페스트 적용
 *   5. C2PA-적용된 PNG를 Storage에 재업로드 (덮어쓰기)
 *   6. links DB row insert
 *   7. ProofHistory insert
 *
 * 응답: JSON { link_id, timestamp, public_url, already_published? }
 */
export async function POST(req: NextRequest) {
  if (!JWT_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return NextResponse.json({ detail: "server_misconfigured" }, { status: 500 });
  }

  const t = new StepTimer();

  const sessionUserId = await t.span("auth", () => getSessionUserId());
  if (!sessionUserId) {
    return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "invalid_json" }, { status: 400 });
  }
  const { receipt, thumbnail, preview } = body || {};
  if (typeof receipt !== "string" || !receipt) {
    return NextResponse.json({ detail: "missing_receipt" }, { status: 400 });
  }

  let claims: Record<string, any>;
  try {
    claims = verifyReceiptJwt(receipt);
  } catch (e: any) {
    // 403 (401 아님): 세션은 유효하나 receipt 거부 — 모바일 클라이언트는 401을 세션 만료로 간주해 로그아웃한다
    return NextResponse.json({ detail: `receipt_${e.message}` }, { status: 403 });
  }

  if (claims.user_id !== sessionUserId) {
    return NextResponse.json({ detail: "receipt_user_mismatch" }, { status: 403 });
  }

  const {
    user_id, link_id, storage_path, timestamp, width, height, lat_e6, lng_e6,
    tier, verified_info, captured_at,
  } = claims;
  // A-60: 원데이 패스 발행 — proof는 confirm에서 패스로 차감됨. publish는
  // LINK_CREATE 차감 생략 + Pro와 동일한 보관 규칙 + links.pass_id 태그.
  const passId: string | null =
    typeof claims.pass_id === "string" && claims.pass_id ? claims.pass_id : null;
  // stamp_version 없는 구 receipt(V5 배포 전 발급)는 V4 (하위호환)
  const stampVersion: 4 | 5 = claims.stamp_version === 5 ? 5 : 4;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // 보관 정책 (pricing-policy §11.2 보관함 모델):
  //   free → 7일 만료. pro/business → 보관함 활성 중 무기한(expires_at=null,
  //   다운그레이드 시 charge-subscriptions cron이 grace 만료를 설정).
  // 0. tier 조회와 idempotency 체크는 서로 독립 — 병렬 실행.
  const [owner, existing] = await t.span("preflight_db", () =>
    Promise.all([
      prisma.user.findUnique({
        where: { id: user_id },
        select: { tier: true },
      }),
      supabase
        .from("links")
        .select("link_id")
        .eq("link_id", link_id)
        .maybeSingle()
        .then((r) => r.data),
    ]),
  );

  // 이미 publish된 동일 link_id가 있으면 idempotent
  if (existing) {
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/${storage_path}`;
    return NextResponse.json({
      link_id,
      timestamp,
      public_url: publicUrl,
      already_published: true,
    });
  }

  const isPaidTier = owner?.tier === "pro" || owner?.tier === "business";

  // A-60: 패스 24h 창이 살아 있으면 Pro와 동일(무기한 — 만료 시 cron이 37일 유예 설정).
  // 창 종료 후 늦은 publish(모바일 재시도)는 cron 스윕이 이미 지나갔으므로 유예를 직접 설정.
  let passWindowActive = false;
  if (passId) {
    const pass = await t.span("pass_lookup", () =>
      prisma.dayPass.findUnique({
        where: { id: passId },
        select: { redeemerId: true, expiresAt: true },
      }),
    );
    passWindowActive =
      !!pass && pass.redeemerId === user_id &&
      !!pass.expiresAt && pass.expiresAt.getTime() > Date.now();
  }

  const GRACE_DAYS = 37; // 30일 유예 + 7일 free 정책 (§11.2 — charge-subscriptions cron과 동일)
  const expiresAt =
    isPaidTier || passWindowActive
      ? null
      : passId
        ? new Date(Date.now() + GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString()
        : new Date(Date.now() + FREE_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // 보관함 용량 체크(5GB): 초과 시 새 공개링크 생성 차단(기존 링크는 삭제하지 않음).
  // 패스 활성 사용자도 Pro와 동일하게 체크 (A-60 — 전용 쿼터 없음, 기존 규칙 공유).
  if (isPaidTier || passWindowActive) {
    try {
      const [usage]: any[] = await t.span("quota_check", () => prisma.$queryRaw`
        SELECT COALESCE(sum((o.metadata->>'size')::bigint), 0)::bigint AS bytes
        FROM storage.objects o
        JOIN public.links l ON o.name = l.storage_path
        WHERE l.user_id = ${user_id} AND o.bucket_id = ${BUCKET_NAME}`);
      const usedBytes = Number(usage?.bytes ?? 0);
      if (usedBytes >= STORAGE_QUOTA_BYTES) {
        return NextResponse.json(
          { detail: "storage_quota_exceeded", used_bytes: usedBytes, quota_bytes: STORAGE_QUOTA_BYTES },
          { status: 402 },
        );
      }
    } catch (e: any) {
      // 용량 조회 실패는 publish를 막지 않음 (가용성 우선, 다음 publish에서 재시도)
      console.error("[publish] storage quota check failed:", e?.message || e);
    }
  }

  // 1. LINK_CREATE(-2) 차감 — 패스 발행은 링크 비용이 패스 1회에 포함되므로 생략(A-60)
  if (!passId) {
    const consume = await t.span("consume_credits", () => consumeCredits({
      userId: user_id,
      amount: CREDIT_COSTS.LINK_CREATE,
      action: "link_create",
      metadata: { link_id, storage_path },
    }));
    if (!consume.ok) {
      return NextResponse.json(
        {
          detail: "insufficient_credits",
          balance: consume.balance,
          required: CREDIT_COSTS.LINK_CREATE,
        },
        { status: 402 },
      );
    }
  }

  const refund = async (reason: string) => {
    if (passId) return; // 패스 발행은 publish에서 차감한 크레딧이 없음
    try {
      await refundCredits({
        userId: user_id,
        amount: CREDIT_COSTS.LINK_CREATE,
        action: "link_create",
        metadata: { link_id, reason },
      });
    } catch (e: any) {
      console.error("[publish] refund failed:", e?.message || e);
    }
  };

  // 2. Storage에서 LSB-stamped PNG 다운로드 (클라가 sign signed_upload_url로 업로드한 결과)
  let pngBuffer: Buffer;
  try {
    pngBuffer = await t.span("storage_download", async () => {
      const { data: blob, error: dlErr } = await supabase.storage
        .from(BUCKET_NAME)
        .download(storage_path);
      if (dlErr || !blob) throw new Error(`download_failed:${dlErr?.message || "no_blob"}`);
      return Buffer.from(await blob.arrayBuffer());
    });
  } catch (e: any) {
    console.error(`[publish] storage download failed link_id=${link_id}:`, e?.message || e);
    await refund(`storage_download_error:${e?.message || "unknown"}`);
    return NextResponse.json({ detail: `storage_download_error:${e?.message || "unknown"}` }, { status: 500 });
  }

  // 2b. Edge-to-Backend 인증 (Level 1)
  // PNG 다운로드 후 두 가지 hash를 검증:
  //   (A) final_hash: border LSB 추출값 ↔ JWT final_hash_hex  — PNG 교체 공격 차단
  //   (B) inner_hash: inner 픽셀 SHA-256 재계산 ↔ JWT inner_hash_hex  — inner 픽셀 교체 공격 차단
  // hash 필드가 없으면 구 receipt (배포 전 발급) — 검증 생략 (하위호환)
  if (claims.final_hash_hex || claims.inner_hash_hex) {
    try {
      // PNG 풀 디코드는 대형 이미지에서 수 초 — (A)(B)가 같은 픽셀을 쓰므로 1회만.
      const pixels = await t.span("png_decode", () => decodePngPixels(pngBuffer, width, height));

      // (A) border LSB → final_hash 검증
      if (claims.final_hash_hex) {
        const extractedFinalHash = await t.span("hash_verify_final", () =>
          extractFinalHashFromPixels(pixels, width, height, stampVersion),
        );
        const expectedFinalHash = hexToBytes(claims.final_hash_hex as string);
        if (
          extractedFinalHash.length !== expectedFinalHash.length ||
          !timingSafeEqual(Buffer.from(extractedFinalHash), Buffer.from(expectedFinalHash))
        ) {
          await refund("final_hash_mismatch");
          return NextResponse.json({ detail: "final_hash_mismatch" }, { status: 422 });
        }
      }

      // (B) inner 픽셀 재계산 → inner_hash 검증
      if (claims.inner_hash_hex) {
        const recomputedInnerHash = await t.span("hash_verify_inner", () =>
          computeInnerHashFromPixels(pixels, width, height),
        );
        const expectedInnerHash = hexToBytes(claims.inner_hash_hex as string);
        if (
          recomputedInnerHash.length !== expectedInnerHash.length ||
          !timingSafeEqual(Buffer.from(recomputedInnerHash), Buffer.from(expectedInnerHash))
        ) {
          await refund("inner_hash_mismatch");
          return NextResponse.json({ detail: "inner_hash_mismatch" }, { status: 422 });
        }
      }
    } catch (e: any) {
      console.error(`[publish] hash verify error link_id=${link_id}:`, e?.message || e);
      await refund(`hash_verify_error:${e?.message || "unknown"}`);
      return NextResponse.json({ detail: `hash_verify_error:${e?.message || "unknown"}` }, { status: 422 });
    }
  }

  // 3. C2PA 매니페스트 적용 + Storage 재업로드
  if (C2PA_ENABLED) {
    try {
      const c2paStart = Date.now();
      const c2paTier: Tier = tier === "verified" ? "verified" : "standard";

      const signResult = await t.span("c2pa_attach", () => attachC2paManifest({
        pngBuffer,
        tier: c2paTier,
        linkId: link_id,
        timestamp: oripicsTimestampToISO8601(timestamp),
        width,
        height,
        lat: lat_e6 != null ? lat_e6 / 1_000_000 : null,
        lng: lng_e6 != null ? lng_e6 / 1_000_000 : null,
        stampVersion,
        ...(c2paTier === "verified" && verified_info
          ? { verifiedInfo: verified_info }
          : {}),
      }));
      // c2pa 내부 breakdown 합류 — sign_ms 안에 TSA HTTP 왕복이 들어 있다.
      t.add("c2pa_init", signResult.timings.init_ms);
      t.add("c2pa_probe", signResult.timings.probe_ms);
      t.add("c2pa_ingredient", signResult.timings.ingredient_ms);
      t.add("c2pa_sign", signResult.timings.sign_ms);

      await t.span("c2pa_reupload", async () => {
        const { error: upErr } = await supabase.storage
          .from(BUCKET_NAME)
          .upload(storage_path, signResult.buffer, {
            contentType: "image/png",
            upsert: true,
            cacheControl: IMMUTABLE_CACHE_SECONDS,
          });
        if (upErr) throw new Error(`reupload_failed:${upErr.message}`);
      });

      console.log(
        `[publish] c2pa attached link_id=${link_id} bytes=${signResult.buffer.length} added=${signResult.bytesAdded} ms=${Date.now() - c2paStart} ` +
          `init_ms=${signResult.timings.init_ms} probe_ms=${signResult.timings.probe_ms} ingredient_ms=${signResult.timings.ingredient_ms ?? "-"} sign_ms=${signResult.timings.sign_ms}`,
      );
    } catch (e: any) {
      console.error(`[publish] c2pa attach failed link_id=${link_id}:`, e?.message || e);
      // C2PA 실패해도 LSB stamped 원본은 Storage에 있음 — publish 계속 진행 (LSB만으로도 가치 있음).
    }
  }

  // 3.5. 뷰어용 경량 표시본 업로드 (A-36, best-effort — 실패해도 publish 진행)
  let previewPath: string | null = null;
  if (typeof preview === "string" && preview.startsWith("data:image/jpeg;base64,") && preview.length < 1_000_000) {
    try {
      const jpegBuffer = Buffer.from(preview.slice("data:image/jpeg;base64,".length), "base64");
      const candidatePath = storage_path.replace(/\.png$/, "_preview.jpg");
      const { error: pvErr } = await t.span("preview_upload", () =>
        supabase.storage
          .from(BUCKET_NAME)
          .upload(candidatePath, jpegBuffer, {
            contentType: "image/jpeg",
            upsert: true,
            cacheControl: IMMUTABLE_CACHE_SECONDS,
          }),
      );
      if (!pvErr) previewPath = candidatePath;
      else console.error(`[publish] preview upload failed link_id=${link_id}:`, pvErr.message);
    } catch (e: any) {
      console.error(`[publish] preview processing failed link_id=${link_id}:`, e?.message || e);
    }
  }

  // 4. links DB row insert
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/${storage_path}`;
  const row: Record<string, any> = {
    link_id,
    timestamp,
    width,
    height,
    storage_path,
    signed_url: publicUrl,
    user_id,
    expires_at: expiresAt, // free: +7일 / 유료: null(보관함 활성 중 무기한)
    preview_path: previewPath, // 뷰어 경량 표시본 (없으면 뷰어가 원본 폴백)
  };
  if (lat_e6 != null && lng_e6 != null) {
    row.lat = lat_e6 / 1_000_000;
    row.lng = lng_e6 / 1_000_000;
  }
  if (typeof captured_at === "string" && captured_at.length === 15) {
    // 촬영시각(기기 기록, V5) — 뷰어 표시용. 스탬프 meta에도 서명 포함되어 있음.
    row.captured_at = captured_at;
  }
  if (passId) {
    // 패스 발행 태그 (A-60) — 뷰어/목록 표시 + 재등록 시 유예 복원 대상 식별
    row.pass_id = passId;
  }
  if (tier === "verified") {
    // 검증 등급(attest 통과) — 뷰어 배지 표시용. null=standard (구 행 하위호환)
    row.tier = "verified";
    // verified 상세를 DB에도 영속 (2026-08-29) — C2PA 첨부는 ORIPICS_C2PA_ENABLED가
    // 꺼진 기간(운영 cert 대기) 동안 스킵되므로, 어서션만 믿으면 상세가 증발한다.
    // 표시 계층은 어서션 우선 → 이 컬럼 폴백. stamp_version도 함께 보관.
    if (verified_info && typeof verified_info === "object") {
      row.verified_info = { ...verified_info, stamp_version: stampVersion };
    }
  }

  const { error: dbErr } = await t.span("links_upsert", () =>
    supabase.from("links").upsert(row, { onConflict: "link_id" }),
  );
  if (dbErr) {
    console.error(`[publish] db upsert failed link_id=${link_id}:`, dbErr.message);
    await refund(`db_error:${dbErr.message}`);
    return NextResponse.json({ detail: `db_error:${dbErr.message}` }, { status: 500 });
  }

  // 5. ProofHistory 생성 (best-effort — publish 자체는 성공으로 응답)
  try {
    let thumbnailStr: string | null = null;
    if (typeof thumbnail === "string" && thumbnail.length > 0 && thumbnail.length < 200_000) {
      thumbnailStr = thumbnail;
    }
    await t.span("proof_history", () =>
      prisma.proofHistory.create({
        data: {
          userId: user_id,
          linkId: link_id,
          thumbnail: thumbnailStr,
          width,
          height,
          timestamp,
          passId, // A-60: 앱 목록탭 "패스" 태그 (null = 일반 발행)
        },
      }),
    );
  } catch (e: any) {
    if (!String(e?.message || "").includes("Unique constraint")) {
      console.warn("[publish] ProofHistory create failed:", e?.message || e);
    }
  }

  console.log(`[publish] ok link_id=${link_id}`);
  t.log("links/publish", { link_id, tier: tier === "verified" ? "verified" : "standard", bytes: pngBuffer.length });
  return t.withServerTiming(
    NextResponse.json({
      link_id,
      timestamp,
      public_url: publicUrl,
    }),
  );
}

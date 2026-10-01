import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { checkRateLimit, clientIp, RATE_LIMITS, tooManyRequests } from "@/lib/security/rateLimit";
import { findByFinalHash } from "@/lib/ledger/server";
import {
  getSalt,
  parseMetaBytes,
  parseMetaBytesV3,
  parseMetaBytesV4,
  parseMetaBytesV5,
  verifyFinalHash,
  hexToBytes,
} from "@/lib/oripics-stamp/server";
import {
  META_LENGTH,
  META_LENGTH_V3,
  META_LENGTH_V4,
  META_LENGTH_V5,
  OFFSET_VERSION,
  verifyLinkId,
} from "@/lib/oripics-stamp/common";
import { readC2paManifest, type C2paReadResult } from "@/lib/oripics-stamp/c2pa";

export const runtime = "nodejs";

const HEX64 = /^[0-9a-fA-F]{64}$/;
const TRUST_REPORT_SPEC = "ISO/IEC 21617-1 (informative)";
const TRUST_REPORT_VERSION = "0.1";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET_NAME = "oripics-proofs";

type SealResult = {
  match: boolean;
  version: number;
  reason?: string;
  metadata?: {
    timestamp: string;
    width: number;
    height: number;
    lat?: number;
    lng?: number;
    /** 촬영시각 (V5, 기기 기록 — "yymmddHHMMSSmmm" UTC). 없으면 미기록. */
    captured_at?: string;
  };
};

type C2paEvidence =
  | { type: "c2pa.manifest"; result: "absent"; reason?: string }
  | {
      type: "c2pa.manifest";
      result: "trusted" | "invalid" | "untrusted";
      details: {
        active_manifest_label?: string;
        claim_generator?: string;
        title?: string;
        instance_id?: string;
        signer?: C2paReadResult["signature"];
        assertions_count: number;
        validation_issues: Array<{ code: string; explanation?: string }>;
      };
    };

type TrustReport = {
  spec: string;
  spec_version: string;
  generated_at: string;
  subject: { link_id?: string; verify_url?: string };
  evidence: Array<
    | {
        type: "oripics.steganographic_seal";
        result: "trusted" | "untrusted";
        details: SealResult["metadata"] & { stamp_version: number; reason?: string };
      }
    | C2paEvidence
  >;
  overall_trust: "high" | "medium" | "low" | "unverified";
};

function buildSealEvidence(seal: SealResult): TrustReport["evidence"][number] {
  return {
    type: "oripics.steganographic_seal",
    result: seal.match ? "trusted" : "untrusted",
    details: {
      ...(seal.metadata ?? { timestamp: "", width: 0, height: 0 }),
      stamp_version: seal.version,
      ...(seal.reason ? { reason: seal.reason } : {}),
    } as any,
  };
}

function buildC2paEvidence(c2pa: C2paReadResult): C2paEvidence {
  if (!c2pa.present) {
    return { type: "c2pa.manifest", result: "absent" };
  }
  const validationIssues = c2pa.validation_status.map((v) => ({
    code: v.code,
    ...(v.explanation ? { explanation: v.explanation } : {}),
  }));
  // 무결성(valid)과 신뢰(trusted)를 구분: 변조면 invalid, 무결하나 미신뢰면
  // untrusted, 무결+신뢰면 trusted. ingredient 만료는 active를 무효화하지 않음.
  const result: C2paEvidence["result"] = !c2pa.valid
    ? "invalid"
    : c2pa.trusted
      ? "trusted"
      : "untrusted";
  return {
    type: "c2pa.manifest",
    result,
    details: {
      active_manifest_label: c2pa.active_manifest_label,
      claim_generator: c2pa.claim_generator,
      title: c2pa.title,
      instance_id: c2pa.instance_id,
      signer: c2pa.signature,
      assertions_count: c2pa.assertions?.length ?? 0,
      validation_issues: validationIssues,
    },
  };
}

function deriveOverallTrust(
  sealOk: boolean,
  c2paChecked: boolean,
  c2paOk: boolean,
): TrustReport["overall_trust"] {
  if (!sealOk) return "low";
  if (!c2paChecked) return "medium";
  return c2paOk ? "high" : "medium";
}

async function tryReadC2paForLink(
  linkId: string,
): Promise<{ checked: true; result: C2paReadResult } | { checked: false; reason: string }> {
  if (!SUPABASE_SERVICE_KEY || !SUPABASE_URL) {
    return { checked: false, reason: "supabase_not_configured" };
  }
  if (!verifyLinkId(linkId)) {
    return { checked: false, reason: "invalid_link_id" };
  }
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: row, error } = await supabase
      .from("links")
      .select("storage_path")
      .eq("link_id", linkId)
      .single();
    if (error || !row?.storage_path) {
      return { checked: false, reason: "link_not_found" };
    }
    const { data: blob, error: dlErr } = await supabase.storage
      .from(BUCKET_NAME)
      .download(row.storage_path);
    if (dlErr || !blob) {
      return { checked: false, reason: `download_failed:${dlErr?.message ?? "no_blob"}` };
    }
    const buf = Buffer.from(await blob.arrayBuffer());
    const result = await readC2paManifest(buf);
    return { checked: true, result };
  } catch (e: any) {
    return { checked: false, reason: `c2pa_read_error:${e?.message ?? "unknown"}` };
  }
}

export async function POST(req: NextRequest) {
  // 2026-10-01 원장 1단계: 검증은 로그인 없이 무료 (VERIFY_QUERY 차감 폐지). 남용은 IP 레이트리밋으로만 억제.
  // 로그인 사용자는 본인 사진 여부(is_owner)만 추가로 받는다.
  const ip = clientIp(req);
  const [perMin, perDay] = await Promise.all([
    checkRateLimit(RATE_LIMITS.verify, ip),
    checkRateLimit(RATE_LIMITS.verifyDaily, ip),
  ]);
  if (!perMin.allowed) return tooManyRequests(perMin, "verify_rate_limited");
  if (!perDay.allowed) return tooManyRequests(perDay, "verify_rate_limited");
  const userId = await getSessionUserId().catch(() => null);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "invalid_json" }, { status: 400 });
  }

  const { meta_hex, inner_hash, border_hash, extracted_final_hash, link_id } = body || {};
  if (typeof meta_hex !== "string") {
    return NextResponse.json({ detail: "invalid_meta_hex" }, { status: 400 });
  }
  const allowed = [META_LENGTH * 2, META_LENGTH_V3 * 2, META_LENGTH_V4 * 2, META_LENGTH_V5 * 2];
  if (!allowed.includes(meta_hex.length)) {
    return NextResponse.json({ detail: "meta_hex_length" }, { status: 400 });
  }
  if (typeof inner_hash !== "string" || !HEX64.test(inner_hash)) {
    return NextResponse.json({ detail: "invalid_inner_hash" }, { status: 400 });
  }
  if (typeof border_hash !== "string" || !HEX64.test(border_hash)) {
    return NextResponse.json({ detail: "invalid_border_hash" }, { status: 400 });
  }
  if (typeof extracted_final_hash !== "string" || !HEX64.test(extracted_final_hash)) {
    return NextResponse.json({ detail: "invalid_extracted_final_hash" }, { status: 400 });
  }
  if (link_id !== undefined && typeof link_id !== "string") {
    return NextResponse.json({ detail: "invalid_link_id" }, { status: 400 });
  }

  let metaBytes: Uint8Array;
  try {
    metaBytes = hexToBytes(meta_hex);
  } catch {
    return NextResponse.json({ detail: "meta_hex_decode" }, { status: 400 });
  }

  const version = (metaBytes[OFFSET_VERSION] << 8) | metaBytes[OFFSET_VERSION + 1];
  const innerHashBytes = hexToBytes(inner_hash);
  const borderHashBytes = hexToBytes(border_hash);
  const extractedBytes = hexToBytes(extracted_final_hash);

  // 메타 파싱 — 공개링크 유도 + seal 검증에 필요. 파싱 실패 시 200 match=false로 종료.
  let metaWidth = 0;
  let metaHeight = 0;
  let metaTimestamp = "";
  let metaLatE6: number | undefined;
  let metaLngE6: number | undefined;
  let metaCapturedAt: string | null = null;
  let metaSaltId = 0;
  let parsedVersion = version;
  try {
    if (version === 5) {
      const p = parseMetaBytesV5(metaBytes);
      metaWidth = p.width;
      metaHeight = p.height;
      metaTimestamp = p.timestamp;
      metaLatE6 = p.lat_e6;
      metaLngE6 = p.lng_e6;
      metaCapturedAt = p.captured_at;
      metaSaltId = p.salt_id;
      parsedVersion = p.version;
    } else if (version === 4) {
      const p = parseMetaBytesV4(metaBytes);
      metaWidth = p.width;
      metaHeight = p.height;
      metaTimestamp = p.timestamp;
      metaLatE6 = p.lat_e6;
      metaLngE6 = p.lng_e6;
      metaSaltId = p.salt_id;
      parsedVersion = p.version;
    } else if (version === 3) {
      const p = parseMetaBytesV3(metaBytes);
      metaWidth = p.width;
      metaHeight = p.height;
      metaTimestamp = p.timestamp;
      metaLatE6 = p.lat_e6;
      metaLngE6 = p.lng_e6;
      metaSaltId = p.salt_id;
      parsedVersion = p.version;
    } else {
      const p = parseMetaBytes(metaBytes);
      metaWidth = p.width;
      metaHeight = p.height;
      metaTimestamp = p.timestamp;
      metaSaltId = p.salt_id;
      parsedVersion = p.version;
    }
  } catch (e: any) {
    return NextResponse.json({ match: false, reason: e.message });
  }

  // 공개링크 유도 (V4+): 메타 timestamp로 links 조회 — C2PA 확인 + 공개링크 표시에 사용.
  // 단일 매칭일 때만 (2건 = timestamp 충돌 → 유도 포기). 미공개 인증도 스탬프·원장으로 검증된다(2026-10-01, 구 not_published 404 폐지).
  let isOwner = false;
  let derivedLinkId: string | null = null;
  if (version >= 4 && SUPABASE_URL && SUPABASE_SERVICE_KEY) {
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      const { data: rows } = await supabase
        .from("links")
        .select("link_id, user_id")
        .eq("timestamp", metaTimestamp)
        .limit(2);
      if (rows && rows.length === 1) {
        derivedLinkId = rows[0].link_id ?? null;
        if (userId && rows[0].user_id === userId) isOwner = true;
      }
    } catch (e) {
      console.warn("[verify] db lookup failed:", e);
    }
  }

  let seal: SealResult;
  try {
    const salt = getSalt(metaSaltId);
    const match = verifyFinalHash(salt, metaBytes, innerHashBytes, borderHashBytes, extractedBytes);
    const metadata: NonNullable<SealResult["metadata"]> = {
      timestamp: metaTimestamp,
      width: metaWidth,
      height: metaHeight,
    };
    if (version >= 3) {
      metadata.lat = (metaLatE6 ?? 0) / 1_000_000;
      metadata.lng = (metaLngE6 ?? 0) / 1_000_000;
    }
    if (metaCapturedAt) {
      metadata.captured_at = metaCapturedAt;
    }
    seal = { match, version: parsedVersion, metadata };
  } catch (e: any) {
    return NextResponse.json({ match: false, reason: e.message });
  }

  // 해시 원장 (2026-10-01) — 스탬프가 진짜일 때만 조회. 인증 시각·제3자 시각 증명(머클 TSA)·공개 여부.
  const ledger = seal.match ? await findByFinalHash(extracted_final_hash) : null;

  const effectiveLinkId =
    typeof link_id === "string" && link_id.length > 0
      ? link_id
      : derivedLinkId ?? (ledger?.published ? ledger.link_id : null);
  const c2paLookup = effectiveLinkId
    ? await tryReadC2paForLink(effectiveLinkId)
    : { checked: false as const, reason: "no_link_id" };

  // 검증 등급 (links.tier, 2026-08-23) — verified(attest 통과 촬영 인증)면 판독 결과에 표기.
  // 표시용 조회라 실패해도 검증 결과에는 영향 없음. 구 링크는 null(=standard).
  let linkTier: string | null = null;
  let dbVerifiedInfo: Record<string, unknown> | null = null;
  if (effectiveLinkId && SUPABASE_URL && SUPABASE_SERVICE_KEY) {
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      const { data } = await supabase
        .from("links")
        .select("tier, verified_info")
        .eq("link_id", effectiveLinkId)
        .single();
      linkTier = data?.tier ?? null;
      dbVerifiedInfo =
        data?.verified_info && typeof data.verified_info === "object"
          ? (data.verified_info as Record<string, unknown>)
          : null;
    } catch {
      /* noop */
    }
  }

  // 기기 검증 상세 (2026-08-29) — 발행본 C2PA com.oripics.verified 어서션에서
  // 플랫폼·렌즈·배율을 추출해 판독 결과에 병기. 어서션은 서명돼 있어 편집 불가.
  let verifiedDetail: Record<string, unknown> | null = null;
  if (linkTier === "verified" && c2paLookup.checked && c2paLookup.result.present) {
    const va = c2paLookup.result.assertions?.find((a) =>
      a.label?.startsWith("com.oripics.verified"),
    )?.data as Record<string, unknown> | undefined;
    if (va) {
      verifiedDetail = {};
      // 어서션 원값(snake_case) 화이트리스트 — 문자열/수치 타입만 통과
      const strKeys = [
        "platform",
        "device_integrity",
        "lens_position",
        "device_model",
        "os_version",
        "app_version",
        "attest_token_hash",
      ];
      const numKeys = ["zoom_factor", "iso", "exposure_time", "f_number", "focal_length"];
      for (const key of strKeys) {
        if (typeof va[key] === "string" && va[key]) verifiedDetail[key] = va[key];
      }
      for (const key of numKeys) {
        if (typeof va[key] === "number" && Number.isFinite(va[key])) verifiedDetail[key] = va[key];
      }
      const actionsData = c2paLookup.result.assertions?.find((a) =>
        a.label?.startsWith("c2pa.actions"),
      )?.data as any;
      const sv = actionsData?.actions?.[0]?.parameters?.["com.oripics.version"];
      if (typeof sv === "number" && Number.isFinite(sv)) verifiedDetail.stamp_version = sv;
      if (Object.keys(verifiedDetail).length === 0) verifiedDetail = null;
    }
  }
  // 어서션 부재(C2PA 미첨부 기간·구 링크) 시 links.verified_info 폴백 (2026-08-29)
  if (!verifiedDetail && linkTier === "verified" && dbVerifiedInfo) {
    const fb: Record<string, unknown> = {};
    for (const key of [
      "platform", "device_integrity", "lens_position", "device_model",
      "os_version", "app_version", "attest_token_hash",
    ]) {
      if (typeof dbVerifiedInfo[key] === "string" && dbVerifiedInfo[key]) fb[key] = dbVerifiedInfo[key];
    }
    for (const key of ["zoom_factor", "iso", "exposure_time", "f_number", "focal_length", "stamp_version"]) {
      if (typeof dbVerifiedInfo[key] === "number" && Number.isFinite(dbVerifiedInfo[key])) fb[key] = dbVerifiedInfo[key];
    }
    if (Object.keys(fb).length > 0) verifiedDetail = fb;
  }

  const evidence: TrustReport["evidence"] = [buildSealEvidence(seal)];
  if (c2paLookup.checked) {
    evidence.push(buildC2paEvidence(c2paLookup.result));
  }

  const trust_report: TrustReport = {
    spec: TRUST_REPORT_SPEC,
    spec_version: TRUST_REPORT_VERSION,
    generated_at: new Date().toISOString(),
    subject: effectiveLinkId
      ? { link_id: effectiveLinkId, verify_url: `https://www.ori.pics/${effectiveLinkId}` }
      : {},
    evidence,
    overall_trust: deriveOverallTrust(
      seal.match,
      c2paLookup.checked,
      // "high"는 무결+신뢰 모두 충족 시에만 — ingredient 상태는 무관.
      c2paLookup.checked ? c2paLookup.result.valid && c2paLookup.result.trusted : false,
    ),
  };

  return NextResponse.json({
    match: seal.match,
    version: seal.version,
    metadata: seal.metadata,
    ...(linkTier ? { tier: linkTier } : {}),
    ...(verifiedDetail ? { verified_detail: verifiedDetail } : {}),
    ...(seal.reason ? { reason: seal.reason } : {}),
    ...(isOwner ? { is_owner: true } : {}),
    ...(ledger
      ? { ledger: { ...ledger, proof_url: `/api/ledger/proof?final_hash=${extracted_final_hash.toLowerCase()}` } }
      : {}),
    trust_report,
  });
}

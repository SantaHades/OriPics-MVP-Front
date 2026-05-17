import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { CREDIT_COSTS } from "@/lib/payment";
import { consumeCredits } from "@/lib/credits/consumeCredits";
import { getProofMultiplier } from "@/lib/credits/sizeMultiplier";
import {
  getSalt,
  parseMetaBytes,
  parseMetaBytesV3,
  parseMetaBytesV4,
  verifyFinalHash,
  hexToBytes,
} from "@/lib/oripics-stamp/server";
import {
  META_LENGTH,
  META_LENGTH_V3,
  META_LENGTH_V4,
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
  const result: C2paEvidence["result"] = c2pa.valid
    ? "trusted"
    : validationIssues.length > 0
      ? "invalid"
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
  // 인증 필수 (로그인한 사용자만 verify 가능, 차감 대상)
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) {
    return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  }

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
  const allowed = [META_LENGTH * 2, META_LENGTH_V3 * 2, META_LENGTH_V4 * 2];
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

  // 메타를 미리 파싱 — 사이즈 multiplier 계산 + owner 면책 + seal 검증에 모두 필요.
  // 파싱 실패 시 차감 전에 200 응답으로 종료 (잘못된 메타에 크레딧 소모 방지).
  let metaWidth = 0;
  let metaHeight = 0;
  let metaTimestamp = "";
  let metaLatE6: number | undefined;
  let metaLngE6: number | undefined;
  let metaSaltId = 0;
  let parsedVersion = version;
  try {
    if (version === 4) {
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

  // 2026-05-17 (B-2'' 후속): V4 메타 timestamp로 DB 조회.
  //   - row 없음(미공개) → 무차감 404 응답. 의미 없는 seal-only 검증에 크레딧 소모 방지.
  //   - row 있고 본인이면 → ownerExempt (무차감).
  //   - row 있고 타인이면 → 차감 후 정상 검증.
  // V2/V3는 timestamp uniqueness 없어 미공개 판정 불가 → 기존 흐름 유지(차감).
  let ownerExempt = false;
  if (version === 4 && SUPABASE_URL && SUPABASE_SERVICE_KEY) {
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      const { data: rows } = await supabase
        .from("links")
        .select("link_id, user_id")
        .eq("timestamp", metaTimestamp)
        .limit(2);
      if (!rows || rows.length === 0) {
        // 미공개 인증 — 워터마크는 진짜지만 DB row 없음 → 무차감 404
        return NextResponse.json(
          {
            match: false,
            reason: "not_published",
            metadata: {
              timestamp: metaTimestamp,
              width: metaWidth,
              height: metaHeight,
            },
          },
          { status: 404 },
        );
      }
      if (rows.length === 1 && rows[0].user_id === userId) {
        ownerExempt = true;
      }
    } catch (e) {
      // 조회 실패 시 안전을 위해 차감 흐름으로 (정상 검증은 진행). owner 면책만 못 받음.
      console.warn("[verify] db lookup failed:", e);
    }
  }

  // 크레딧 차감 (race-safe atomic). 본인 이미지는 면책.
  // VERIFY_QUERY × sizeMultiplier (1×/2×/3× — 메타에 박힌 width/height 기준).
  const sizeMultiplier = getProofMultiplier(metaWidth, metaHeight);
  const verifyCost = CREDIT_COSTS.VERIFY_QUERY * sizeMultiplier;
  if (!ownerExempt) {
    const consume = await consumeCredits({
      userId,
      amount: verifyCost,
      action: "verify_query",
      metadata: { link_id, version, width: metaWidth, height: metaHeight, size_multiplier: sizeMultiplier },
    });
    if (!consume.ok) {
      return NextResponse.json(
        {
          detail: "insufficient_credits",
          balance: consume.balance,
          required: verifyCost,
          size_multiplier: sizeMultiplier,
        },
        { status: 402 },
      );
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
    if (version === 3 || version === 4) {
      metadata.lat = (metaLatE6 ?? 0) / 1_000_000;
      metadata.lng = (metaLngE6 ?? 0) / 1_000_000;
    }
    seal = { match, version: parsedVersion, metadata };
  } catch (e: any) {
    return NextResponse.json({ match: false, reason: e.message });
  }

  const c2paLookup =
    typeof link_id === "string" && link_id.length > 0
      ? await tryReadC2paForLink(link_id)
      : { checked: false as const, reason: "no_link_id" };

  const evidence: TrustReport["evidence"] = [buildSealEvidence(seal)];
  if (c2paLookup.checked) {
    evidence.push(buildC2paEvidence(c2paLookup.result));
  }

  const trust_report: TrustReport = {
    spec: TRUST_REPORT_SPEC,
    spec_version: TRUST_REPORT_VERSION,
    generated_at: new Date().toISOString(),
    subject: typeof link_id === "string" && link_id.length > 0
      ? { link_id, verify_url: `https://www.ori.pics/${link_id}` }
      : {},
    evidence,
    overall_trust: deriveOverallTrust(
      seal.match,
      c2paLookup.checked,
      c2paLookup.checked ? c2paLookup.result.valid : false,
    ),
  };

  return NextResponse.json({
    match: seal.match,
    version: seal.version,
    metadata: seal.metadata,
    ...(seal.reason ? { reason: seal.reason } : {}),
    ...(ownerExempt ? { owner_exempt: true } : {}),
    trust_report,
  });
}

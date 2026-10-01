// 해시 원장 서버 로직 (2026-10-01, strategy-verification-layer.md §3)
//   - recordProof: confirm 성공 시 1행 기록 (best-effort — 실패해도 인증 응답은 막지 않음)
//   - recordPublished: 공개링크 생성 시 서버 계산 지문으로 갱신 + 공개 시각 / markUnpublished·detachUser: 링크 삭제·탈퇴
//   - runDailyBatch: 전날(KST)까지 미배치 행 → 일자별 머클 루트 → TSA
//   - findCopies: 사본 조회 (SHA 정확 일치 → 지각 지문 근접)
//   - buildInclusionProof: 제3자 검증용 포함 증명 묶음
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  HEX_PHASH256,
  HEX_DHASH64,
  PHASH_MAX_DISTANCE,
  DHASH_MAX_DISTANCE,
} from "@oripics/stamp";
import { leafHash, leafPreimage, merkleRoot, merkleProof, type ProofStep } from "./merkle";
import { requestTimestamp } from "./tsa";

const HEX64 = /^[0-9a-f]{64}$/;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export interface ClientFingerprints {
  file_sha256?: string;
  phash256?: string;
  dhash64?: string;
}

/** 클라이언트가 보낸 지문 — 형식이 틀리면 해당 값만 버린다 (인증 자체는 진행) */
export function sanitizeFingerprints(raw: unknown): { fileSha256: string | null; phash256: string | null; dhash64: string | null } {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pick = (v: unknown, re: RegExp) => (typeof v === "string" && re.test(v.toLowerCase()) ? v.toLowerCase() : null);
  return {
    fileSha256: pick(o.file_sha256, HEX64),
    phash256: pick(o.phash256, HEX_PHASH256),
    dhash64: pick(o.dhash64, HEX_DHASH64),
  };
}

export interface RecordProofInput {
  linkId: string;
  userId: string;
  finalHash: string;
  innerHash: string;
  tier: "standard" | "verified";
  stampTs: string;
  capturedAt?: string | null;
  width: number;
  height: number;
  fingerprints: ReturnType<typeof sanitizeFingerprints>;
}

/** confirm 성공 시 원장 기록. 재확정(A-100 replay)이면 비어 있던 지문만 채운다. */
export async function recordProof(input: RecordProofInput): Promise<void> {
  const fp = input.fingerprints;
  try {
    await prisma.proofLedger.upsert({
      where: { linkId: input.linkId },
      create: {
        linkId: input.linkId,
        userId: input.userId,
        finalHash: input.finalHash.toLowerCase(),
        innerHash: input.innerHash.toLowerCase(),
        fileSha256: fp.fileSha256,
        phash256: fp.phash256,
        dhash64: fp.dhash64,
        tier: input.tier,
        stampTs: input.stampTs,
        capturedAt: input.capturedAt ?? null,
        width: input.width,
        height: input.height,
      },
      update: {
        ...(fp.fileSha256 ? { fileSha256: fp.fileSha256 } : {}),
        ...(fp.phash256 ? { phash256: fp.phash256 } : {}),
        ...(fp.dhash64 ? { dhash64: fp.dhash64 } : {}),
      },
    });
  } catch (e: any) {
    console.warn("[ledger] recordProof failed:", input.linkId, e?.message || e);
  }
}

export interface PublishLedgerInput extends Omit<RecordProofInput, "fingerprints"> {
  /** 서버가 업로드본에서 직접 계산한 값 — 클라이언트 보고값보다 우선 */
  fileSha256: string;
  publishedSha256: string | null;
  phash256: string | null;
  dhash64: string | null;
}

/**
 * 공개링크 생성 시 — 서버가 받은 실제 이미지로 지문을 다시 계산해 덮어쓰고 공개 시각을 기록.
 * confirm 때 원장 행이 없었으면(원장 배포 전 receipt 등) 여기서 만든다.
 */
export async function recordPublished(input: PublishLedgerInput): Promise<void> {
  const trusted = {
    fileSha256: input.fileSha256,
    ...(input.publishedSha256 ? { publishedSha256: input.publishedSha256 } : {}),
    ...(input.phash256 ? { phash256: input.phash256 } : {}),
    ...(input.dhash64 ? { dhash64: input.dhash64 } : {}),
    publishedAt: new Date(),
  };
  try {
    await prisma.proofLedger.upsert({
      where: { linkId: input.linkId },
      create: {
        linkId: input.linkId,
        userId: input.userId,
        finalHash: input.finalHash.toLowerCase(),
        innerHash: input.innerHash.toLowerCase(),
        tier: input.tier,
        stampTs: input.stampTs,
        capturedAt: input.capturedAt ?? null,
        width: input.width,
        height: input.height,
        ...trusted,
      },
      update: trusted,
    });
  } catch (e: any) {
    console.warn("[ledger] recordPublished failed:", input.linkId, e?.message || e);
  }
}

/** 공개링크 삭제(사용자 삭제·만료 정리·탈퇴) — 원장 기록은 남기고 '공개링크 있음'만 해제 */
export async function markUnpublished(linkIds: string[]): Promise<void> {
  if (!linkIds.length) return;
  try {
    await prisma.proofLedger.updateMany({ where: { linkId: { in: linkIds } }, data: { publishedAt: null } });
  } catch (e: any) {
    console.warn("[ledger] markUnpublished failed:", e?.message || e);
  }
}

/** 회원 탈퇴 — 원장 행의 계정 연결만 끊는다 (FK ON DELETE SET NULL과 같은 결과, 명시적으로 선행) */
export async function detachUser(userId: string): Promise<void> {
  try {
    await prisma.proofLedger.updateMany({ where: { userId }, data: { userId: null } });
  } catch (e: any) {
    console.warn("[ledger] detachUser failed:", e?.message || e);
  }
}

/** Date → KST 날짜 문자열 YYYY-MM-DD */
export function kstDay(d: Date): string {
  return new Date(d.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 오늘(KST) 0시의 UTC 시각 */
function kstTodayStart(now: Date): Date {
  const day = kstDay(now);
  return new Date(Date.parse(`${day}T00:00:00Z`) - KST_OFFSET_MS);
}

export interface BatchRunResult {
  created: Array<{ day: string; leaves: number; batchId: string }>;
  stamped: number;
  tsaErrors: string[];
}

/**
 * 일일 배치 — cron(00:10 KST). 오늘 0시(KST) 이전의 미배치 행을 인증일별로 묶는다.
 * 배치 행·leaf 배정을 한 트랜잭션으로 먼저 확정하고, TSA는 그 뒤(실패 시 다음 실행이 재시도).
 */
export async function runDailyBatch(now = new Date()): Promise<BatchRunResult> {
  const cutoff = kstTodayStart(now);
  const result: BatchRunResult = { created: [], stamped: 0, tsaErrors: [] };

  const pending = await prisma.proofLedger.findMany({
    where: { batchId: null, certifiedAt: { lt: cutoff } },
    select: { id: true, linkId: true, finalHash: true, certifiedAt: true },
    orderBy: [{ certifiedAt: "asc" }, { id: "asc" }],
    take: 200_000,
  });

  const byDay = new Map<string, typeof pending>();
  for (const row of pending) {
    const day = kstDay(row.certifiedAt);
    const list = byDay.get(day) ?? [];
    list.push(row);
    byDay.set(day, list);
  }

  for (const [day, rows] of byDay) {
    const leaves = rows.map((r) => leafHash({ linkId: r.linkId, finalHash: r.finalHash, certifiedAt: r.certifiedAt }));
    const root = merkleRoot(leaves).toString("hex");
    const batch = await prisma.$transaction(async (tx) => {
      const b = await tx.ledgerBatch.create({ data: { day, merkleRoot: root, leafCount: rows.length } });
      await tx.$executeRaw`
        UPDATE public.proof_ledger AS p
        SET batch_id = ${b.id}, leaf_index = v.idx
        FROM unnest(${rows.map((r) => r.id)}::text[], ${rows.map((_, i) => i)}::int[]) AS v(id, idx)
        WHERE p.id = v.id AND p.batch_id IS NULL`;
      return b;
    }, { timeout: 60_000 });
    result.created.push({ day, leaves: rows.length, batchId: batch.id });
  }

  // TSA — 이번에 만든 배치 + 이전 실패분 재시도
  const unstamped = await prisma.ledgerBatch.findMany({
    where: { tsaToken: null },
    orderBy: { createdAt: "asc" },
    take: 30,
  });
  for (const b of unstamped) {
    try {
      const { token, genTime } = await requestTimestamp(Buffer.from(b.merkleRoot, "hex"));
      await prisma.ledgerBatch.update({
        where: { id: b.id },
        data: { tsaToken: new Uint8Array(token), tsaTime: genTime, tsaError: null },
      });
      result.stamped++;
    } catch (e: any) {
      const msg = String(e?.message || e).slice(0, 300);
      result.tsaErrors.push(`${b.day}:${msg}`);
      await prisma.ledgerBatch.update({ where: { id: b.id }, data: { tsaError: msg } }).catch(() => {});
    }
  }
  return result;
}

export interface LedgerPublicInfo {
  link_id: string;
  tier: string;
  certified_at: string;
  captured_at: string | null;
  stamp_ts: string;
  width: number;
  height: number;
  published: boolean;
  /** 공개링크가 있으면 뷰어 URL */
  verify_url: string | null;
  timestamp_proof:
    | { status: "pending"; expected_day: string }
    | { status: "stamped"; day: string; tsa_time: string; merkle_root: string }
    | { status: "retrying"; day: string };
}

type LedgerRow = Prisma.ProofLedgerGetPayload<{}>;

async function toPublicInfo(row: LedgerRow): Promise<LedgerPublicInfo> {
  let timestamp_proof: LedgerPublicInfo["timestamp_proof"] = {
    status: "pending",
    expected_day: kstDay(row.certifiedAt),
  };
  if (row.batchId) {
    const b = await prisma.ledgerBatch.findUnique({
      where: { id: row.batchId },
      select: { day: true, tsaTime: true, merkleRoot: true },
    });
    if (b?.tsaTime) {
      timestamp_proof = { status: "stamped", day: b.day, tsa_time: b.tsaTime.toISOString(), merkle_root: b.merkleRoot };
    } else if (b) {
      timestamp_proof = { status: "retrying", day: b.day };
    }
  }
  return {
    link_id: row.linkId,
    tier: row.tier,
    certified_at: row.certifiedAt.toISOString(),
    captured_at: row.capturedAt,
    stamp_ts: row.stampTs,
    width: row.width,
    height: row.height,
    published: !!row.publishedAt,
    verify_url: row.publishedAt ? `https://www.ori.pics/${row.linkId}` : null,
    timestamp_proof,
  };
}

export async function findByFinalHash(finalHash: string): Promise<LedgerPublicInfo | null> {
  try {
    const row = await prisma.proofLedger.findUnique({ where: { finalHash: finalHash.toLowerCase() } });
    return row ? await toPublicInfo(row) : null;
  } catch (e: any) {
    console.warn("[ledger] findByFinalHash failed:", e?.message || e);
    return null;
  }
}

export interface CopyMatch {
  kind: "exact_file" | "perceptual";
  phash_distance?: number;
  dhash_distance?: number;
  record: LedgerPublicInfo;
}

const MAX_PERCEPTUAL_MATCHES = 5;

/**
 * 사본 조회 — ① 파일 SHA 정확 일치 ② pHash·dHash 모두 기준 안(가까운 순 최대 5건).
 * 지각 비교는 DB에서 bit_count(XOR)로 계산 (PostgreSQL 14+).
 */
export async function findCopies(q: { fileSha256?: string | null; phash256?: string | null; dhash64?: string | null }): Promise<CopyMatch[]> {
  if (q.fileSha256) {
    const rows = await prisma.proofLedger.findMany({
      where: { OR: [{ fileSha256: q.fileSha256 }, { publishedSha256: q.fileSha256 }] },
      take: 1,
    });
    if (rows.length) return [{ kind: "exact_file", record: await toPublicInfo(rows[0]) }];
  }
  if (!q.phash256 || !q.dhash64) return [];
  const hits = await prisma.$queryRaw<Array<{ id: string; pd: number; dd: number }>>`
    SELECT id, pd, dd FROM (
      SELECT id,
        bit_count(('x' || phash256)::bit(256) # ('x' || ${q.phash256})::bit(256))::int AS pd,
        bit_count(('x' || dhash64)::bit(64) # ('x' || ${q.dhash64})::bit(64))::int AS dd
      FROM public.proof_ledger
      WHERE phash256 IS NOT NULL AND dhash64 IS NOT NULL
    ) s
    WHERE pd <= ${PHASH_MAX_DISTANCE} AND dd <= ${DHASH_MAX_DISTANCE}
    ORDER BY pd ASC, dd ASC
    LIMIT ${MAX_PERCEPTUAL_MATCHES}`;
  if (!hits.length) return [];
  const rows = await prisma.proofLedger.findMany({ where: { id: { in: hits.map((h) => h.id) } } });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out: CopyMatch[] = [];
  for (const h of hits) {
    const row = byId.get(h.id);
    if (row) out.push({ kind: "perceptual", phash_distance: h.pd, dhash_distance: h.dd, record: await toPublicInfo(row) });
  }
  return out;
}

export interface InclusionProof {
  format: string;
  link_id: string;
  leaf: { preimage: string; hash: string };
  path: ProofStep[];
  merkle_root: string;
  batch: { day: string; leaf_count: number; leaf_index: number };
  tsa: { time: string; token_der_base64: string } | null;
  how_to_verify: string[];
}

/** 제3자 검증용 포함 증명 — 이미지에서 얻는 final_hash로 조회(소지 증명). 배치 전이면 null */
export async function buildInclusionProof(finalHash: string): Promise<InclusionProof | null> {
  const row = await prisma.proofLedger.findUnique({ where: { finalHash: finalHash.toLowerCase() } });
  if (!row?.batchId || row.leafIndex == null) return null;
  const batch = await prisma.ledgerBatch.findUnique({ where: { id: row.batchId } });
  if (!batch) return null;
  const members = await prisma.proofLedger.findMany({
    where: { batchId: row.batchId },
    select: { linkId: true, finalHash: true, certifiedAt: true, leafIndex: true },
    orderBy: { leafIndex: "asc" },
  });
  const leaves = members.map((m) => leafHash({ linkId: m.linkId, finalHash: m.finalHash, certifiedAt: m.certifiedAt }));
  const preimage = leafPreimage({ linkId: row.linkId, finalHash: row.finalHash, certifiedAt: row.certifiedAt });
  return {
    format: "oripics-inclusion-proof-v1",
    link_id: row.linkId,
    leaf: { preimage, hash: leaves[row.leafIndex].toString("hex") },
    path: merkleProof(leaves, row.leafIndex),
    merkle_root: batch.merkleRoot,
    batch: { day: batch.day, leaf_count: batch.leafCount, leaf_index: row.leafIndex },
    tsa: batch.tsaToken && batch.tsaTime
      ? { time: batch.tsaTime.toISOString(), token_der_base64: Buffer.from(batch.tsaToken).toString("base64") }
      : null,
    how_to_verify: [
      "1. leaf.hash = SHA-256(0x00 || UTF-8(leaf.preimage))",
      "2. path 순서대로: side=L이면 SHA-256(0x01 || sibling || acc), side=R이면 SHA-256(0x01 || acc || sibling)",
      "3. 최종 값이 merkle_root와 같은지 확인",
      "4. tsa.token_der_base64를 디코드해 token.der로 저장 후: openssl ts -verify -digest <merkle_root> -in token.der -token_in -CAfile <SSL.com TSA 루트 인증서>",
    ],
  };
}

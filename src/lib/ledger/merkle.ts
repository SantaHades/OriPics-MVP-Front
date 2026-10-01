// 해시 원장 일일 머클 배치 (2026-10-01, strategy-verification-layer.md §3.3)
//
// 하루치 원장 행을 머클 트리로 묶고 루트 1개만 RFC 3161 TSA로 타임스탬프한다.
// 제3자(누구나)가 leaf → path → root를 재계산하고 TSA 토큰의 messageImprint와 대조해 검증할 수 있다.
//   - leaf  = SHA-256(0x00 ‖ "oripics-ledger-v1|{link_id}|{final_hash}|{certified_at ISO}")
//   - node  = SHA-256(0x01 ‖ left ‖ right)   (RFC 6962식 도메인 분리 — 두 번째 원상 공격 차단)
//   - 홀수 개 레벨의 마지막 노드는 짝 없이 그대로 위로 올림
// 형식을 바꾸면 기존 배치 검증이 깨진다 — 바꿀 때는 leaf 접두어 버전을 올릴 것.
import { createHash } from "crypto";

export const LEAF_VERSION = "oripics-ledger-v1";

export interface LeafInput {
  linkId: string;
  finalHash: string;
  certifiedAt: Date;
}

export interface ProofStep {
  /** 형제 노드 hex */
  sibling: string;
  /** 형제가 왼쪽(L)인지 오른쪽(R)인지 */
  side: "L" | "R";
}

function sha256(...parts: Buffer[]): Buffer {
  const h = createHash("sha256");
  for (const p of parts) h.update(p);
  return h.digest();
}

export function leafPreimage(leaf: LeafInput): string {
  return `${LEAF_VERSION}|${leaf.linkId}|${leaf.finalHash.toLowerCase()}|${leaf.certifiedAt.toISOString()}`;
}

export function leafHash(leaf: LeafInput): Buffer {
  return sha256(Buffer.from([0x00]), Buffer.from(leafPreimage(leaf), "utf8"));
}

function nodeHash(left: Buffer, right: Buffer): Buffer {
  return sha256(Buffer.from([0x01]), left, right);
}

/** 레벨별 노드 (levels[0] = leaf 해시들, 마지막 = [root]) */
function buildLevels(leaves: Buffer[]): Buffer[][] {
  if (leaves.length === 0) throw new Error("merkle_empty");
  const levels: Buffer[][] = [leaves];
  while (levels[levels.length - 1].length > 1) {
    const cur = levels[levels.length - 1];
    const next: Buffer[] = [];
    for (let i = 0; i < cur.length; i += 2) {
      next.push(i + 1 < cur.length ? nodeHash(cur[i], cur[i + 1]) : cur[i]);
    }
    levels.push(next);
  }
  return levels;
}

export function merkleRoot(leaves: Buffer[]): Buffer {
  const levels = buildLevels(leaves);
  return levels[levels.length - 1][0];
}

/** index번째 leaf의 포함 증명 경로 */
export function merkleProof(leaves: Buffer[], index: number): ProofStep[] {
  if (index < 0 || index >= leaves.length) throw new Error("merkle_index_out_of_range");
  const levels = buildLevels(leaves);
  const path: ProofStep[] = [];
  let i = index;
  for (let lv = 0; lv < levels.length - 1; lv++) {
    const cur = levels[lv];
    const isRight = i % 2 === 1;
    const sib = isRight ? i - 1 : i + 1;
    if (sib < cur.length) {
      path.push({ sibling: cur[sib].toString("hex"), side: isRight ? "L" : "R" });
    }
    // 짝이 없으면(홀수 마지막) 그대로 올라가므로 단계 생략
    i = Math.floor(i / 2);
  }
  return path;
}

/** leaf + path → root 재계산 (검증기·테스트용) */
export function rootFromProof(leaf: Buffer, path: ProofStep[]): Buffer {
  let acc = leaf;
  for (const step of path) {
    const sib = Buffer.from(step.sibling, "hex");
    acc = step.side === "L" ? nodeHash(sib, acc) : nodeHash(acc, sib);
  }
  return acc;
}

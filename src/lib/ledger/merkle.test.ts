import { describe, it, expect } from "vitest";
import { leafHash, merkleRoot, merkleProof, rootFromProof, leafPreimage } from "./merkle";

const leafs = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    leafHash({
      linkId: `link${i}`,
      finalHash: i.toString(16).padStart(64, "0"),
      certifiedAt: new Date(Date.UTC(2026, 9, 1, 0, 0, i)),
    }),
  );

describe("ledger merkle", () => {
  it("leaf 원상 형식 고정", () => {
    expect(
      leafPreimage({ linkId: "abc", finalHash: "AB".repeat(32), certifiedAt: new Date("2026-10-01T00:00:00Z") }),
    ).toBe(`oripics-ledger-v1|abc|${"ab".repeat(32)}|2026-10-01T00:00:00.000Z`);
  });

  it("leaf 1개면 root = leaf", () => {
    const l = leafs(1);
    expect(merkleRoot(l).equals(l[0])).toBe(true);
    expect(merkleProof(l, 0)).toEqual([]);
  });

  it.each([2, 3, 5, 8, 13, 100])("leaf %i개 — 모든 증명 경로가 root로 복원", (n) => {
    const l = leafs(n);
    const root = merkleRoot(l);
    for (let i = 0; i < n; i++) {
      expect(rootFromProof(l[i], merkleProof(l, i)).equals(root)).toBe(true);
    }
  });

  it("다른 leaf로는 root가 복원되지 않음", () => {
    const l = leafs(7);
    const root = merkleRoot(l);
    const forged = leafs(8)[7];
    expect(rootFromProof(forged, merkleProof(l, 3)).equals(root)).toBe(false);
  });

  it("빈 배치는 거부", () => {
    expect(() => merkleRoot([])).toThrow("merkle_empty");
  });
});

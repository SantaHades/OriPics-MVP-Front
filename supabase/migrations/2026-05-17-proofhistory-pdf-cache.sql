-- 2026-05-17: ProofHistory에 PDF 캐시 필드 추가 (B-2 흐름 + 증명서 PDF 캐시)
--
-- 실행: Supabase Dashboard → SQL Editor → 붙여넣기 → Run
-- 안전성: nullable column 추가만, 기존 row 영향 없음.

ALTER TABLE "ProofHistory"
  ADD COLUMN IF NOT EXISTS "pdfStoragePath" TEXT,
  ADD COLUMN IF NOT EXISTS "pdfIssuedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "ProofHistory_userId_createdAt_idx"
  ON "ProofHistory"("userId", "createdAt");

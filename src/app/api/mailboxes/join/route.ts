// 사서함 추가 (A-72, 2026-09-05) — POST /api/mailboxes/join { query, password? }
// query=사서함 번호 또는 이름. DB 함수 join_mailbox가 찾기·비밀번호 검증·사용자 목록 추가를 한 번에 처리.
import { NextRequest, NextResponse } from "next/server";

import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { joinErrorStatus } from "@/lib/channels/server";
import { eventsDb } from "@/lib/events/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  const db = eventsDb();
  if (!db) return NextResponse.json({ detail: "server_misconfigured" }, { status: 500 });
  let body: { query?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "invalid_json" }, { status: 400 });
  }
  const query = typeof body.query === "string" ? body.query.trim().slice(0, 80) : "";
  const password = typeof body.password === "string" ? body.password.slice(0, 80) : "";
  if (!query) return NextResponse.json({ detail: "query_required" }, { status: 400 });

  const { data, error } = await db.rpc("join_mailbox", { p_user_id: userId, p_query: query, p_password: password || null });
  if (error) {
    const m = joinErrorStatus(error.message);
    if (m.status === 500) console.error("[mailboxes] join failed:", error.message);
    return NextResponse.json({ detail: m.detail }, { status: m.status });
  }
  const id = data as string;
  const { data: row } = await db.from("mailboxes").select("id, name, description, email, visibility, status").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ detail: "not_found" }, { status: 404 });
  console.log(`[mailboxes] joined user=${userId} mailbox=${id}`);
  return NextResponse.json({
    mailbox: { ...row, private: row.visibility !== "public" },
  });
}

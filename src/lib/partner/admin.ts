// 어드민 게이트 (A-82 최소 어드민) — ADMIN_EMAILS(콤마 구분)에 든 이메일의 세션만 허용.
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { adminEmails } from "./mailer";

export async function requireAdmin(): Promise<{ userId: string; email: string } | null> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase();
  const userId = (session?.user as any)?.id as string | undefined;
  if (!email || !userId) return null;
  if (!adminEmails().includes(email)) return null;
  return { userId, email };
}

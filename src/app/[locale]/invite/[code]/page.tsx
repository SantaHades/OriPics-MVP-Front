"use client";
// 사서함 초대 랜딩 (A-81 W4, 2026-09-09) — 초대문 링크·QR의 목적지. 로그인 불필요.
// 서버 공개 API(/api/mailboxes/invites/:code)는 사서함 이름·개설자·초대받는 이름·상태만 내려준다(사진·참여자 비노출).
// 앱 설치자는 [앱에서 열기](oripics://invite/CODE) → 앱 제출 탭 > 사서함 참여 미리보기. 미설치자는 설치 후 코드를 직접 입력.
// iOS는 설치 직후 딥링크가 유실될 수 있어 코드를 크게 보여 주고 복사 버튼을 둔다.
import { Link } from "@/navigation";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { ArrowLeft, Check, Copy, Mailbox, Smartphone } from "lucide-react";

import { ANDROID_STORE_URL, IOS_APP_URL } from "@/lib/appLinks";

interface InviteInfo {
  code: string;
  code_display: string;
  state: "valid" | "used" | "expired" | "revoked" | "closed";
  mailbox_name: string;
  owner_name: string;
  invitee_name: string;
  role_text: string | null;
  can_capture: boolean;
  capture_billing: string;
  expires_at: string;
}

function normalize(raw: string): string | null {
  const s = decodeURIComponent(raw).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z0-9]{8}$/.test(s) ? s : null;
}

export default function InviteLanding() {
  const params = useParams();
  const lang = ((params?.locale as string) || "ko") === "en" ? "en" : "ko";
  const ko = lang === "ko";
  const code = normalize((params?.code as string) || "");
  const [info, setInfo] = useState<InviteInfo | null | "loading" | "missing">(code ? "loading" : "missing");
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!code) return;
    fetch(`/api/mailboxes/invites/${code}`, { cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()).invite as InviteInfo) : "missing"))
      .then((v) => setInfo(v))
      .catch(() => setInfo("missing"));
    if (typeof window !== "undefined") {
      QRCode.toDataURL(window.location.href, { margin: 1, width: 320 }).then(setQr).catch(() => {});
    }
  }, [code]);

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(`${code.slice(0, 4)}-${code.slice(4)}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 화면에 코드가 있어 수동 복사 가능
    }
  };

  const openApp = () => {
    if (!code) return;
    window.location.href = `oripics://invite/${code}`;
  };

  const isAndroid = typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);
  const storeUrl = isAndroid ? ANDROID_STORE_URL : IOS_APP_URL;

  const stateText: Record<InviteInfo["state"], string> = {
    valid: ko ? "유효한 초대코드입니다" : "This invite code is valid",
    used: ko ? "이미 사용된 초대코드입니다. 개설자에게 새 코드를 요청하세요." : "This code has already been used. Ask the owner for a new one.",
    expired: ko ? "만료된 초대코드입니다. 개설자에게 새 코드를 요청하세요." : "This code has expired. Ask the owner for a new one.",
    revoked: ko ? "취소된 초대코드입니다. 개설자에게 문의하세요." : "This code was cancelled. Please contact the owner.",
    closed: ko ? "초대가 종료되어 참여할 수 없는 사서함입니다. 개설자에게 문의하세요." : "Invitations to this mailbox are closed. Please contact the owner.",
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-xl mx-auto px-6 py-12">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-8">
          <ArrowLeft size={14} /> OriPics
        </Link>

        <div className="rounded-3xl bg-white border border-slate-200 p-8 shadow-sm">
          <div className="flex items-center gap-2 text-blue-600 mb-3">
            <Mailbox size={20} />
            <span className="text-sm font-semibold">{ko ? "사진 사서함 초대" : "Photo mailbox invitation"}</span>
          </div>

          {info === "loading" ? (
            <p className="text-sm text-slate-500">{ko ? "초대 정보를 확인하고 있습니다…" : "Checking the invitation…"}</p>
          ) : info === "missing" || info === null ? (
            <>
              <h1 className="text-xl font-bold mb-2">{ko ? "초대코드를 찾을 수 없어요" : "Invite code not found"}</h1>
              <p className="text-sm text-slate-500">
                {ko ? "링크가 잘렸거나 코드가 잘못되었습니다. 초대문을 다시 확인해 주세요." : "The link may be truncated or the code is wrong. Please check the invitation again."}
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold leading-snug mb-1">{info.mailbox_name}</h1>
              <p className="text-sm text-slate-600 mb-5">
                {ko ? `개설자 ${info.owner_name}` : `Owner: ${info.owner_name}`}
                {" · "}
                {ko ? `초대받는 분 ${info.invitee_name}` : `Invitee: ${info.invitee_name}`}
                {info.role_text ? ` (${info.role_text})` : ""}
              </p>
              <div className={`rounded-xl px-4 py-3 text-sm mb-6 ${info.state === "valid" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-amber-50 text-amber-800 border border-amber-200"}`}>
                {stateText[info.state]}
                {info.state === "valid" ? (
                  <span className="block text-xs mt-1 opacity-80">
                    {ko ? `${new Date(info.expires_at).toLocaleDateString("ko-KR")}까지 1회만 사용할 수 있습니다.` : `Single use, valid until ${new Date(info.expires_at).toLocaleDateString("en-US")}.`}
                  </span>
                ) : null}
              </div>

              <div className="text-center mb-6">
                <p className="text-xs text-slate-500 mb-1">{ko ? "초대코드" : "Invite code"}</p>
                <p className="font-mono text-3xl font-bold tracking-widest">{info.code_display}</p>
                <button
                  type="button"
                  onClick={copyCode}
                  className="mt-2 inline-flex items-center gap-1 text-sm text-blue-600 font-semibold hover:underline"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? (ko ? "복사됨" : "Copied") : ko ? "코드 복사" : "Copy code"}
                </button>
              </div>

              {info.state === "valid" ? (
                <div className="grid gap-2">
                  <button
                    type="button"
                    onClick={openApp}
                    className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold"
                  >
                    <Smartphone size={16} /> {ko ? "OriPics 앱에서 열기" : "Open in the OriPics app"}
                  </button>
                  <a
                    href={storeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-slate-300 hover:bg-slate-50 text-sm font-semibold"
                  >
                    {ko ? "앱이 없다면 설치하기" : "Don't have the app? Install"}
                  </a>
                  <p className="text-xs text-slate-500 text-center mt-2 leading-relaxed">
                    {ko
                      ? "설치 후: 앱 > 제출 탭 > 사서함 > 초대받은 사서함 [+ 추가하기]에 위 코드를 입력하세요. 참여에는 로그인이 필요합니다."
                      : "After installing: App > Submit tab > Mailboxes > Invited mailboxes [+ Add] and enter the code above. Sign-in is required."}
                  </p>
                </div>
              ) : null}

              {qr && info.state === "valid" ? (
                <div className="mt-8 flex flex-col items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qr} alt="QR" className="w-40 h-40 rounded-lg border border-slate-200" />
                  <p className="text-xs text-slate-400">{ko ? "다른 기기에서 앱 스캐너로 찍어도 됩니다" : "Scan with the app on another device"}</p>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

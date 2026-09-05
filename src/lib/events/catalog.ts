// 이벤트 카탈로그 (A-72, 2026-09-05) — 앱 apps/mobile/src/lib/event/events.ts와 id·기간이 일치해야 한다.
// 출품·좋아요 데이터는 DB(event_entries/event_likes), 이벤트 정의는 여기(코드)에서 관리.
export type Lang = "ko" | "en";

export interface EventDef {
  id: string;
  name: Record<Lang, string>;
  summary: Record<Lang, string>;
  details: Record<Lang, string>;
  rules: Record<Lang, string[]>;
  period: Record<Lang, string>;
  /** 접수 마감 ISO — 지나면 출품 API 403 */
  endsAt: string;
}

const RULES_KO = (what: string) => [
  `참여 방법: 오리픽스 앱 → 제출 탭 → 이벤트에서 ${what}을 골라 [참여하기] (미인증 사진은 전송 전에 인증·공개링크가 자동 생성됩니다)`,
  "심사: 출품작이 받은 좋아요 순",
  "상품: 좋아요 상위 참여자에게 소정의 상품",
  "명예의 전당: 이 페이지에 수상작을 사진·검증 링크와 함께 소개",
  "출품 후에는 취소할 수 없습니다 (출품 전 사진을 확인해 주세요)",
  "좋아요: 로그인한 사용자만 가능, 같은 작품에는 1회 (작품 수 제한 없음)",
  "출품작은 홈페이지·SNS 소개에 활용될 수 있습니다",
];
const RULES_EN = (what: string) => [
  `How to enter: OriPics app → Submit tab → Events → pick ${what} and tap [Enter] (uncertified photos are certified and published automatically first)`,
  "Judging: number of likes on entries",
  "Prize: a small prize for the top-liked entrants",
  "Hall of Fame: winners are featured on this page with photo and verification link",
  "Entries cannot be withdrawn once submitted (please review your photos first)",
  "Likes: signed-in users only, one like per entry (no limit on how many entries you like)",
  "Entries may be used in website and social media features",
];

export const EVENTS: EventDef[] = [
  {
    id: "real-photo-contest",
    name: { ko: "이 사진 진짜예요? 콘테스트", en: "“Is This Photo Real?” Contest" },
    summary: {
      ko: "가짜 같은 진짜 사진을 오리픽스 앱으로 찍어 보내 주세요. 좋아요 순으로 소정의 상품과 명예의 전당 등재.",
      en: "Shoot a real photo that looks fake with the OriPics app. Top-liked entries win a small prize and a Hall of Fame spot.",
    },
    details: {
      ko: "너무 완벽해서 합성 같은 풍경, 우연이 만든 믿기 힘든 장면, AI가 그린 것 같은 실제 순간 — 가짜 같은 진짜 사진을 오리픽스 앱으로 찍어 보내 주세요.\n\n오리픽스로 찍은 사진은 촬영 시각·위치와 원본 여부가 공개링크로 검증되기 때문에, “이 사진 진짜예요?”라는 질문에 사진 스스로 답할 수 있습니다.\n\n좋아요를 많이 받은 순으로 소정의 상품을 드리고, 이 페이지 명예의 전당에 사진과 함께 올려 드립니다.",
      en: "Scenery too perfect to be real, unbelievable coincidences, real moments that look AI-generated — shoot real photos that look fake with the OriPics app and send them in.\n\nPhotos taken with OriPics carry a public verification link for capture time, location and originality, so the photo itself answers “Is this real?”.\n\nThe most-liked entries receive a small prize and are featured in the Hall of Fame on this page.",
    },
    rules: { ko: RULES_KO("사진"), en: RULES_EN("photos") },
    period: { ko: "접수 기간: 2026년 10월 31일까지", en: "Entry period: through October 31, 2026" },
    endsAt: "2026-10-31T23:59:59+09:00",
  },
  {
    id: "proof-shot-contest",
    name: { ko: "인증샷 콘테스트", en: "Proof Shot Contest" },
    summary: {
      ko: "멋진 인증샷을 오리픽스 앱으로 찍어 보내 주세요. 좋아요 순으로 소정의 상품과 명예의 전당 등재.",
      en: "Take a great proof shot with the OriPics app. Top-liked entries win a small prize and a Hall of Fame spot.",
    },
    details: {
      ko: "여행지 도착 인증, 완주 인증, 오늘의 도전 인증 — 멋진 인증샷을 오리픽스 앱으로 찍어 보내 주세요.\n\n오리픽스로 찍은 인증샷은 “그 시각, 그 장소에서, 원본 그대로”임을 공개링크로 증명하기 때문에 진짜 인증샷이 됩니다.\n\n좋아요를 많이 받은 순으로 소정의 상품을 드리고, 이 페이지 명예의 전당에 사진과 함께 올려 드립니다.",
      en: "Arrival at a destination, finishing a race, today's challenge done — take a great proof shot with the OriPics app and send it in.\n\nA proof shot taken with OriPics proves “that time, that place, unaltered” through its public verification link, making it a real proof shot.\n\nThe most-liked entries receive a small prize and are featured in the Hall of Fame on this page.",
    },
    rules: { ko: RULES_KO("인증샷"), en: RULES_EN("proof shots") },
    period: { ko: "접수 기간: 2026년 10월 31일까지", en: "Entry period: through October 31, 2026" },
    endsAt: "2026-10-31T23:59:59+09:00",
  },
];

export function getEvent(id: string): EventDef | undefined {
  return EVENTS.find((e) => e.id === id);
}

export function isEventOpen(e: EventDef, now = new Date()): boolean {
  return new Date(e.endsAt).getTime() > now.getTime();
}

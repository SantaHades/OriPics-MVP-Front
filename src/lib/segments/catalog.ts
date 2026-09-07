// 직군별 랜딩 데이터 (GTM, 2026-09-07) — docs/gtm-pro-segments-2026-09.md 의 카피를 코드로.
// 문구 원칙: 검증 가능한 표현만(촬영 시점 기기 검증은 앱 촬영분에만 — FAQ에 명시), 법적 효력 단정 금지.
export type Lang = "ko" | "en";
type L = Record<Lang, string>;

export interface SegmentDef {
  slug: string;
  eyebrow: L;
  title: L;
  subtitle: L;
  ctaSecondary: L; // 샘플 PDF 문구 (링크는 준비 전까지 사용 사례 페이지로)
  problems: { title: L; body: L }[];
  steps: { title: L; body: L }[];
  pricing: L;
  faq: { q: L; a: L }[];
  /** 파트너 코드 안내 */
  partnerNote: L;
}

const TRUST: { title: L; body: L }[] = [
  {
    title: { ko: "촬영 시점 기기 검증", en: "Device attestation at capture" },
    body: {
      ko: "Apple App Attest · Google Play Integrity로 '그 시각, 그 자리, 실제 기기'를 서버가 검증합니다 (앱 촬영분).",
      en: "Apple App Attest and Google Play Integrity let the server verify 'that time, that place, that device' (app captures).",
    },
  },
  {
    title: { ko: "국제 표준 C2PA 적합성 인증 제품", en: "C2PA-conformant product" },
    body: {
      ko: "국내 개인 사용자용 서비스 중 유일하게 공식 적합 제품 목록에 등재. Adobe Inspect 등 외부 도구에서도 검증됩니다.",
      en: "Listed on the official C2PA Conforming Products List; verifiable in third-party tools such as Adobe Inspect.",
    },
  },
  {
    title: { ko: "픽셀 단위 원본 판정", en: "Pixel-level originality" },
    body: {
      ko: "픽셀 하나만 바뀌어도 '변조'로 판정. 공개링크는 1년, Pro는 구독 중 계속 보관됩니다.",
      en: "A single changed pixel is flagged as altered. Public links are kept for a year, and while subscribed on Pro.",
    },
  },
];
export const SEGMENT_TRUST = TRUST;

export const SEGMENTS: SegmentDef[] = [
  {
    slug: "construction",
    eyebrow: { ko: "시공업자를 위한 원본 사진 증명", en: "Proof of original photos for contractors" },
    title: {
      ko: "공사 전·중·후 사진이 그날 그 현장에서 찍혔다는 걸,\n사진이 스스로 증명합니다.",
      en: "Your before, during and after photos prove\nthey were taken on site, that day.",
    },
    subtitle: {
      ko: "하자 분쟁에서 \"나중에 찍은 거 아니냐\"는 말이 나오지 않게. 셔터를 누른 순간 촬영 시각·위치·기기를 보이지 않는 지문으로 새기고, 고객에게는 누구나 검증할 수 있는 공개링크와 기록서 PDF를 건넵니다.",
      en: "No more \"you took that later\" in defect disputes. The moment you press the shutter, time, place and device are embedded as an invisible fingerprint — and your client gets a public link anyone can verify.",
    },
    ctaSecondary: { ko: "시공 기록 사용 사례 보기", en: "See construction use cases" },
    problems: [
      { title: { ko: "몇 달 뒤의 하자 주장", en: "Defect claims months later" }, body: { ko: "준공 후 \"원래 이랬다\"는 주장에 카톡으로 보낸 사진은 날짜도 원본 여부도 증명이 안 됩니다.", en: "Photos sent over chat prove neither the date nor originality when a client claims 'it was always like this'." } },
      { title: { ko: "흩어진 현장 사진", en: "Scattered site photos" }, body: { ko: "현장마다 수십 장이 폰 갤러리에 뒤섞여 어느 현장 어느 공정인지 찾기 어렵습니다.", en: "Dozens of photos per site pile up in the gallery with no way to tell which site or which stage." } },
      { title: { ko: "\"믿어 달라\"는 말뿐", en: "Nothing but 'trust me'" }, body: { ko: "고객에게 기록을 보여주고 싶어도 검증할 수단이 없어 말로만 설득해야 합니다.", en: "You want to show your record, but there is no way for the client to verify it." } },
    ],
    steps: [
      { title: { ko: "평소처럼 찍기", en: "Shoot as usual" }, body: { ko: "촬영 탭에서 찍는 순간 시각·위치·기기 검증이 사진에 새겨집니다.", en: "Time, place and device attestation are embedded the moment you capture in the app." } },
      { title: { ko: "메모 붙이고 인증", en: "Add a note, certify" }, body: { ko: "목록 탭에서 공정별 메모(\"주방 배관 교체 전\")를 붙이고 인증하면 공개링크가 생성됩니다.", en: "On the List tab, add a note per stage and certify — a public link is created." } },
      { title: { ko: "링크·기록서 전달", en: "Send link or record" }, body: { ko: "고객·시공사·감리에게 공개링크나 시공 기록서 PDF를 보냅니다. 받는 쪽은 앱 없이 링크만 열어 검증합니다.", en: "Send the public link or a PDF record to the client or inspector. They verify with just the link, no app needed." } },
    ],
    pricing: {
      ko: "Pro 월 9,900원 — 표준 인증 최대 333회, 보관함 5GB, 인증서 PDF 월 5회. 현장 1곳에 사진 40장이면 월 8현장을 기록할 수 있습니다.",
      en: "Pro ₩9,900/month — up to 333 standard proofs, 5GB storage, 5 certificate PDFs a month. Forty photos per site covers eight sites a month.",
    },
    faq: [
      { q: { ko: "갤러리에 있는 예전 사진도 되나요?", en: "Can I certify older photos from my gallery?" }, a: { ko: "인증과 공개링크는 됩니다. 다만 촬영 시점 기기 검증은 앱 카메라로 찍은 사진에만 붙습니다.", en: "Yes, certification and public links work. Device attestation at capture applies only to photos taken with the app camera." } },
      { q: { ko: "고객이 앱을 깔아야 하나요?", en: "Does my client need the app?" }, a: { ko: "아닙니다. 공개링크를 열면 브라우저에서 바로 검증됩니다.", en: "No. The public link verifies in any browser." } },
      { q: { ko: "법정 증거가 되나요?", en: "Is it admissible evidence?" }, a: { ko: "증거 능력은 법원이 판단합니다. OriPics는 촬영 시각·원본 여부를 제3자가 검증할 수 있는 형태로 제출할 수 있게 해 줍니다.", en: "Admissibility is decided by courts. OriPics lets you submit photos whose capture time and originality can be verified by third parties." } },
    ],
    partnerNote: { ko: "시공 매칭 플랫폼·협회 파트너 코드가 있다면 첫 달 Pro가 무료입니다.", en: "With a partner code from your platform or association, the first month of Pro is free." },
  },
  {
    slug: "rental",
    eyebrow: { ko: "임대·중개 실무자를 위한 원본 사진 증명", en: "Proof of original photos for landlords and agents" },
    title: {
      ko: "입주 날 그 집의 상태를,\n그날 그 자리에서 찍은 사진으로 증명합니다.",
      en: "Prove the condition on move-in day\nwith photos taken there, that day.",
    },
    subtitle: {
      ko: "보증금 분쟁의 쟁점은 늘 \"원래 있던 흠집인가\"입니다. 입주·퇴실 사진에 촬영 시각·위치·기기 검증을 새기고, 세입자와 임대인 모두에게 같은 공개링크를 건네세요.",
      en: "Deposit disputes always come down to 'was that scratch already there?'. Embed time, place and device attestation in move-in and move-out photos, and give tenant and landlord the same public link.",
    },
    ctaSecondary: { ko: "입주·퇴실 사용 사례 보기", en: "See move-in / move-out use cases" },
    problems: [
      { title: { ko: "퇴실 정산의 진실 공방", en: "Move-out standoffs" }, body: { ko: "세입자는 \"원래 있던 거\", 임대인은 \"새로 생긴 거\" — 양쪽 사진 모두 시점 증명이 없습니다.", en: "Tenant says it was there, landlord says it's new — neither side's photos prove when." } },
      { title: { ko: "뒤섞이는 세대 사진", en: "Mixed-up unit photos" }, body: { ko: "관리 세대가 많으면 어느 집 어느 시점 사진인지 금방 뒤섞입니다.", en: "With many units, it's soon unclear which photo belongs to which unit and when." } },
      { title: { ko: "중개사는 입증할 수 없다", en: "Agents can't arbitrate" }, body: { ko: "중간에 선 중개사는 어느 쪽 말도 입증해 줄 수단이 없습니다.", en: "The agent in the middle has no way to back either side." } },
    ],
    steps: [
      { title: { ko: "입주 당일 촬영", en: "Shoot on move-in day" }, body: { ko: "방·설비별로 찍으면 시각·위치·기기 검증이 새겨집니다.", en: "Capture each room and fixture; attestation is embedded." } },
      { title: { ko: "상태 메모·인증", en: "Note the condition, certify" }, body: { ko: "\"거실 마루 긁힘 3cm, 입주 전\"처럼 메모를 붙여 인증하면 공개링크가 생성됩니다.", en: "Add notes like 'living room floor scratch 3cm, pre-move-in' and certify to create a public link." } },
      { title: { ko: "양측에 같은 증거", en: "Same evidence for both" }, body: { ko: "세입자에게 링크와 상태 확인서 PDF를 보냅니다. 퇴실 때 같은 절차로 비교합니다.", en: "Send the link and a condition report PDF to the tenant. Repeat at move-out and compare." } },
    ],
    pricing: {
      ko: "Pro 월 9,900원 — 관리 세대 30곳, 입·퇴실 월 10건 × 사진 30장이면 300건, Pro 계정 하나로 충분합니다.",
      en: "Pro ₩9,900/month — thirty units with ten move-ins/outs a month at thirty photos each is 300 proofs, within one Pro account.",
    },
    faq: [
      { q: { ko: "세입자도 같은 링크를 볼 수 있나요?", en: "Can the tenant see the same link?" }, a: { ko: "네. 공개링크는 누구나 열어 촬영 시각·원본 여부를 확인할 수 있어 양측이 같은 증거를 갖습니다.", en: "Yes. Anyone can open the public link and check capture time and originality, so both sides hold the same evidence." } },
      { q: { ko: "예전에 찍어 둔 사진은요?", en: "What about photos taken earlier?" }, a: { ko: "인증은 되지만 촬영 시점 기기 검증은 앱 카메라 촬영분에만 붙습니다.", en: "They can be certified, but device attestation at capture applies only to app camera captures." } },
      { q: { ko: "법정 증거가 되나요?", en: "Is it admissible evidence?" }, a: { ko: "증거 능력은 법원이 판단합니다. 촬영 시각·원본 여부를 제3자가 검증할 수 있는 형태로 제출할 수 있게 해 줍니다.", en: "Admissibility is decided by courts. OriPics makes capture time and originality third-party verifiable." } },
    ],
    partnerNote: { ko: "협회 연수교육·지회 파트너 코드가 있다면 첫 달 Pro가 무료입니다.", en: "With a partner code from your association training, the first month of Pro is free." },
  },
  {
    slug: "rental-fleet",
    eyebrow: { ko: "인수·반납 실무를 위한 원본 사진 증명", en: "Proof of original photos for pick-up and return" },
    title: {
      ko: "인수할 때 없던 흠집이 반납할 때 생겼는지,\n사진이 시각과 장소로 증명합니다.",
      en: "Whether a scratch appeared between pick-up and return,\nthe photo proves it with time and place.",
    },
    subtitle: {
      ko: "흠집 분쟁의 핵심은 \"언제 생겼나\"입니다. 인수·반납 사진에 촬영 시각·위치·기기 검증을 새기고, 고객에게 같은 공개링크를 보내 분쟁을 시작부터 막으세요.",
      en: "Scratch disputes hinge on 'when did it happen'. Embed time, place and device attestation in pick-up and return photos, and share the same link with the customer to stop disputes before they start.",
    },
    ctaSecondary: { ko: "인수·반납 사용 사례 보기", en: "See pick-up / return use cases" },
    problems: [
      { title: { ko: "\"원래 있었다\"", en: "'It was already there'" }, body: { ko: "반납 시 발견한 흠집을 고객은 인수 전부터 있었다고 말합니다. 시점 증명이 없으면 결론이 나지 않습니다.", en: "A scratch found at return is claimed to have existed before pick-up. Without proof of timing there is no resolution." } },
      { title: { ko: "직원마다 다른 기록", en: "Inconsistent records" }, body: { ko: "지점 직원마다 촬영 방식이 달라 기록 품질이 들쭉날쭉합니다.", en: "Every staff member shoots differently, so record quality varies." } },
      { title: { ko: "비대면은 사진이 전부", en: "Contactless means photos are everything" }, body: { ko: "카셰어링·P2P 대여는 사진이 유일한 증거인데 시점 증명이 없습니다.", en: "In car sharing and peer-to-peer rental, photos are the only evidence — and they don't prove when." } },
    ],
    steps: [
      { title: { ko: "인수 시 촬영", en: "Shoot at pick-up" }, body: { ko: "4면과 계기판을 앱으로 찍고 \"앞범퍼 좌측 기존 흠집\"처럼 메모합니다.", en: "Capture all four sides and the dashboard in the app, with notes like 'existing scratch, front-left bumper'." } },
      { title: { ko: "인증·링크 전송", en: "Certify and send" }, body: { ko: "인증하면 공개링크가 생성되고, 고객에게 문자로 보냅니다.", en: "Certify to create a public link and text it to the customer." } },
      { title: { ko: "반납 시 같은 절차", en: "Repeat at return" }, body: { ko: "비대면 대여는 고객이 앱으로 직접 찍게 하면 양측 기록이 모두 검증됩니다.", en: "For contactless rentals, have the customer shoot with the app so both records are verifiable." } },
    ],
    pricing: {
      ko: "Pro 월 9,900원 — 지점 1곳, 하루 10건 인수·반납 × 6장이면 직원별 Pro 계정 2~3개로 운영할 수 있습니다. 사업자 다계정은 문의해 주세요.",
      en: "Pro ₩9,900/month — one branch with ten pick-ups/returns a day at six photos each runs on two or three staff accounts. Ask us about business multi-seat billing.",
    },
    faq: [
      { q: { ko: "고객이 직접 찍게 할 수 있나요?", en: "Can the customer shoot themselves?" }, a: { ko: "네. 고객이 앱으로 찍으면 고객 측 사진에도 촬영 시점 검증이 붙어 양측 기록이 모두 검증됩니다.", en: "Yes. If the customer shoots with the app, their photos carry attestation too, so both records are verifiable." } },
      { q: { ko: "여러 지점·직원 계정은요?", en: "Multiple branches and staff?" }, a: { ko: "직원별 Pro 계정으로 시작할 수 있고, 사업자 다계정 결제는 별도로 안내드립니다.", en: "Start with a Pro account per staff member; business multi-seat billing is available on request." } },
      { q: { ko: "법정 증거가 되나요?", en: "Is it admissible evidence?" }, a: { ko: "증거 능력은 법원이 판단합니다. 촬영 시각·원본 여부를 제3자가 검증할 수 있는 형태로 제출할 수 있게 해 줍니다.", en: "Admissibility is decided by courts. OriPics makes capture time and originality third-party verifiable." } },
    ],
    partnerNote: { ko: "렌터카 조합·카셰어링 플랫폼 파트너 코드가 있다면 첫 달 Pro가 무료입니다.", en: "With a partner code from your association or platform, the first month of Pro is free." },
  },
];

export function getSegment(slug: string): SegmentDef | undefined {
  return SEGMENTS.find((s) => s.slug === slug);
}

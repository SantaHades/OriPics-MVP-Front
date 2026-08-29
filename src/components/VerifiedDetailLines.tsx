// Verified(기기 검증) 상세 표시 — 판독 결과(Home.verify.*)와 공개링크 뷰어(LinkViewer.*)
// 공용. 쉬운 말(플랫폼별 확인 사실) + 어려운 말(기술 상세·증명 데이터) 병기 (2026-08-29 대표 요청).
// 값은 발행본 C2PA 서명 어서션(com.oripics.verified) 기재분만 — 편집 불가한 사실.
import React from "react";

/** com.oripics.verified 어서션 원값 (snake_case) */
export interface VerifiedAssertionData {
  platform?: string;
  device_integrity?: string;
  zoom_factor?: number;
  lens_position?: string;
  device_model?: string;
  os_version?: string;
  app_version?: string;
  iso?: number;
  exposure_time?: number;
  f_number?: number;
  focal_length?: number;
  attest_token_hash?: string;
  stamp_version?: number;
}

function fmtExposure(sec: number): string {
  return sec >= 1 ? `${sec}s` : `1/${Math.round(1 / sec)}s`;
}

export function VerifiedDetailLines({
  vd,
  t,
  keyPrefix = "",
}: {
  vd?: VerifiedAssertionData | null;
  /** next-intl t — 호출 측 네임스페이스 (Home이면 keyPrefix="verify.") */
  t: (key: string) => string;
  keyPrefix?: string;
}) {
  const k = (key: string) => t(`${keyPrefix}${key}`);
  const platform = vd?.platform;

  const deviceParts = [
    vd?.device_model,
    vd?.os_version
      ? platform === "ios"
        ? `iOS ${vd.os_version}`
        : platform === "android"
          ? `Android ${vd.os_version}`
          : `OS ${vd.os_version}`
      : null,
    vd?.app_version ? `OriPics ${vd.app_version}` : null,
  ].filter(Boolean) as string[];

  const captureParts = [
    vd?.lens_position
      ? `${k("lens_label")} ${k(`lens_${vd.lens_position.replace("-", "_")}`)}`
      : null,
    vd?.zoom_factor != null ? `${k("zoom_label")} ${vd.zoom_factor.toFixed(1)}×` : null,
    vd?.iso != null ? `ISO ${vd.iso}` : null,
    vd?.exposure_time != null ? fmtExposure(vd.exposure_time) : null,
    vd?.f_number != null ? `f/${vd.f_number}` : null,
    vd?.focal_length != null ? `${vd.focal_length}mm` : null,
  ].filter(Boolean) as string[];

  const evidenceParts = [
    platform ? `platform=${platform}` : null,
    vd?.device_integrity ? `device_integrity=${vd.device_integrity}` : null,
    vd?.stamp_version != null ? `stamp_version=${vd.stamp_version}` : null,
    vd?.attest_token_hash ? `attest_sha256=${vd.attest_token_hash}` : null,
  ].filter(Boolean) as string[];

  return (
    <>
      <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
        {platform === "ios"
          ? k("tier_verified_desc_ios")
          : platform === "android"
            ? k("tier_verified_desc_android")
            : k("tier_verified_desc")}
      </p>
      {deviceParts.length > 0 && (
        <p className="text-xs text-slate-500 mt-0.5">{deviceParts.join(" · ")}</p>
      )}
      {captureParts.length > 0 && (
        <p className="text-xs text-slate-500 mt-0.5">{captureParts.join(" · ")}</p>
      )}
      <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
        {platform === "ios"
          ? k("tier_verified_tech_ios")
          : platform === "android"
            ? k("tier_verified_tech_android")
            : k("tier_verified_tech")}
      </p>
      {evidenceParts.length > 0 && (
        <p className="text-[10px] text-slate-400 mt-0.5 font-mono break-all">
          {evidenceParts.join(" · ")}
        </p>
      )}
    </>
  );
}

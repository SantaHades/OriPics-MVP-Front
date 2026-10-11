// c2pa-web WASM(8.6MB)을 public/vendor로 복사 — 브라우저 C2PA 판독(/verify, 2026-10-01 2단계)을 자체 호스팅.
// 외부 CDN을 쓰지 않는다(사진 검사 페이지에서 제3자 요청 최소화). 경로에 버전을 넣어 캐시 무효화.
// postinstall·build에서 실행. 산출물은 .gitignore(public/vendor).
import { copyFileSync, mkdirSync, readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgDir = join(root, "node_modules/@contentauth/c2pa-web");
if (!existsSync(pkgDir)) {
  console.warn("[copy-c2pa-assets] @contentauth/c2pa-web 없음 — 건너뜀");
  process.exit(0);
}
const { version } = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
const outDir = join(root, "public/vendor/c2pa-web", version);
mkdirSync(outDir, { recursive: true });
copyFileSync(join(pkgDir, "dist/resources/c2pa_bg.wasm"), join(outDir, "c2pa_bg.wasm"));
console.log(`[copy-c2pa-assets] c2pa-web ${version} → public/vendor/c2pa-web/${version}/`);

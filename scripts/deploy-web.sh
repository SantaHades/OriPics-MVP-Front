#!/usr/bin/env bash
# 웹(ori.pics) 배포 — apps/web 서브트리를 split해 front 리모트(SantaHades/OriPics-MVP-Front) main으로 push → Vercel 자동 빌드.
# 사용: apps/web/scripts/deploy-web.sh   (리포 어디서 호출하든 루트로 이동)
# 규칙(메모리 project_vercel_config): 로컬 main 직접 push 금지, split SHA만 push. split은 결정적이라 보통 fast-forward.
set -euo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
git fetch front main -q
SPLIT=$(git subtree split --prefix=apps/web 2>/dev/null)
if [[ "$(git rev-parse front/main)" == "$SPLIT" ]]; then
  echo "WEB: 이미 최신 (front/main == split $SPLIT)"
  exit 0
fi
if git merge-base --is-ancestor front/main "$SPLIT"; then
  git push front "$SPLIT:main"
else
  echo "WEB: split이 front/main의 후손이 아님 — 이력 확인 필요(--force 자동 실행 안 함)" >&2
  exit 1
fi
echo "WEB: pushed $SPLIT → front/main. Vercel 빌드 확인: vercel ls ori-pics-mvp-front --scope oripics-projects"

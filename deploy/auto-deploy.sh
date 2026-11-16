#!/bin/bash
# 자동 배포: GitHub 에 새 커밋이 있으면 받아서 학습지 컨테이너를 다시 만든다. cron 이 1분마다 실행한다.
# (서버의 22번 포트가 밖에서 막혀 있어, 밖에서 밀어 넣는 대신 서버가 스스로 가져온다.)
# 빌드가 실패하면 기존 컨테이너가 그대로 돈다. 같은 커밋은 다시 시도하지 않는다 → deploy/auto-deploy.log 확인.
set -euo pipefail
cd "$(dirname "$0")"
exec 9>.auto-deploy.lock; flock -n 9 || exit 0   # 앞의 배포가 아직 돌고 있으면 건너뛴다

git pull --ff-only -q
sha=$(git rev-parse HEAD)
[ "$sha" = "$(cat .tried 2>/dev/null || true)" ] && exit 0
echo "$sha" > .tried
echo "$(date '+%F %T') deploying $sha"
docker compose up -d --build && docker image prune -f >/dev/null && echo "$(date '+%F %T') OK $sha"

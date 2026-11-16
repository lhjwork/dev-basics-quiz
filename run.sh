#!/bin/sh
# 학습지 실행: Docker와 MSSQL 컨테이너(mssql)를 켜고 http://localhost:5080 을 연다.
cd "$(dirname "$0")" || exit 1
[ -d node_modules ] || npm install   # TypeScript 컴파일러 (처음 한 번)
if ! docker info >/dev/null 2>&1; then
  echo "Docker를 켜는 중..."
  open -a Docker
  until docker info >/dev/null 2>&1; do sleep 2; done
fi
docker start mssql >/dev/null || exit 1
# sa 비밀번호는 파일에 적지 않고 컨테이너 설정에서 읽어 온다.
QUIZ_SQL_PASSWORD="$(docker inspect mssql --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^MSSQL_SA_PASSWORD=//p')"
export QUIZ_SQL_PASSWORD
(sleep 5 && open http://localhost:5080) &
exec dotnet run

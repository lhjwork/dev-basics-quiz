# 기초 학습지

개발 기초를 4지선다 문제로 익히는 학습지입니다. 문제를 풀기 전에 개념을 읽고, 코드를 직접 쳐서 실행해 실제 결과를 확인할 수 있습니다.

- 개발 기초(`/`): 16개 종류, 155문제. MSSQL, C#, Blazor, JavaScript, TypeScript, Node.js, React, Next.js, Tailwind CSS, Rust, IT 면접 기초, 네트워크 기초, 설계와 아키텍처, 테스트, 보안, 성능과 동시성
- 일본어 학습지(`/ja`): Lv1(글자)~Lv6(N1) 60문제. 글자·문법·어휘·빈칸·듣기(브라우저 음성)·읽기 (`wwwroot/q/jp*.js`, 화면은 `wwwroot/ja.js`)
  - 로그인하면 푼 문제가 서버 DB(SQLite, `QUIZ_DATA/learn.db`)에 쌓이고, "성장 기록"에서 주별·레벨별·유형별 정답률과 자주 틀린 문제를 본다
  - "내 단어장": 문제의 단어를 담아 1→3→7→14→30→60일 간격으로 복습한다
- 문제마다 개념 설명(코드 → 결과)과, 오답 보기마다 "왜 오답으로 넣었는지" 해설
- SQL · C# · JavaScript · TypeScript · Rust 문제는 코드를 직접 실행해 결과 표와 실제 에러 메시지를 확인

## 실행

```sh
./run.sh
```

Docker와 MSSQL 컨테이너를 켜고 http://localhost:5080 을 엽니다.

### 필요한 것

- .NET 10 SDK (서버, C# 실행)
- Node.js (JavaScript · TypeScript 실행). 처음 한 번 `npm install`
- Rust (`rustc`) — Rust 문제를 실행할 때만
- Docker와 `mssql` 이라는 이름의 SQL Server 컨테이너. 없으면 한 번 만듭니다.

```sh
docker run -d --name mssql --platform linux/amd64 \
  -e ACCEPT_EULA=Y -e MSSQL_SA_PASSWORD='직접_정한_비밀번호' \
  -p 1433:1433 mcr.microsoft.com/mssql/server:2022-latest
```

비밀번호는 `run.sh`가 컨테이너 설정에서 읽어 오므로 파일에 적지 않습니다.

## 주의

이 서버는 화면에서 받은 코드를 그대로 실행합니다. 기본 상태에서는 `localhost`에서 온 요청만 받습니다.

밖에서 접속하게 하려면 환경 변수로 설정합니다. 비밀번호 없이는 서버가 시작되지 않습니다.

| 환경 변수 | 내용 |
|---|---|
| `QUIZ_PUBLIC_ORIGIN` | 밖에서 접속하는 주소. 예: `https://quiz.example.com` |
| `QUIZ_PASSWORD` | 코드 실행(`/run`)과 학습 기록(`/api`) 비밀번호. 화면과 문제는 누구나 보고, "실행"이나 일본어 "로그인"을 누를 때만 브라우저 로그인 창이 뜬다(아이디는 아무거나) |
| `QUIZ_DATA` | 학습 기록 DB 폴더. 기본값 `./data`, 컨테이너는 `/data`(볼륨 `quiz_data`) |
| `QUIZ_URL` | 서버가 듣는 주소. 기본 `http://localhost:5080` |
| `QUIZ_SQL_HOST` | MSSQL 주소. 기본 `localhost,1433` |

공개할 때는 반드시 HTTPS 뒤에 두고, 서버 전체를 컨테이너처럼 격리된 환경에서 돌리세요. 비밀번호를 아는 사람은 그 환경에서 임의의 코드를 실행할 수 있습니다.

SQL은 실행할 때마다 `QuizScratch` 라는 연습용 DB를 새로 만들어 그 안에서 돌립니다.

## 텔레그램 봇과 자동 배포 (서버)

서버에서 한 번 `sudo deploy/setup-bot.sh` 를 실행하고, 끝에 나오는 안내를 따릅니다.

- **자동 배포**: 서버가 1분마다 GitHub 를 확인해, 새 커밋이 있으면 받아서 다시 빌드합니다(`deploy/auto-deploy.sh`, 기록은 `deploy/auto-deploy.log`). 빌드가 실패하면 기존 버전이 그대로 돕니다.
- **텔레그램 봇**: 전용 계정 `quizbot` 에서 Claude Code(Opus)가 텔레그램과 연결돼 돕니다(`bot.sh`, 규칙은 `CLAUDE.md`). "MSSQL 문제 내 줘"로 문제를 풀거나 문제 추가를 시키면, 봇이 고쳐서 GitHub 에 올리고 자동 배포가 사이트에 반영합니다. 이 계정에는 sudo·docker 권한이 없습니다.

## 구조

| 파일 | 내용 |
|---|---|
| `Program.cs` | 서버. 화면 제공 + 코드 실행 API (`/run/sql`, `/run/cs`, `/run/js`, `/run/ts`, `/run/rust`) |
| `wwwroot/index.html` | MSSQL · C# · Blazor 문제 |
| `wwwroot/q/*.js` | 나머지 종류의 문제 (`jp*.js` 는 `/ja` 일본어 학습지) |
| `wwwroot/app.js` | 화면 동작, "직접 실행" 설정 |
| `wwwroot/style.css` | 디자인 |
| `check.mjs` | 점검: 문제 데이터 확인 + 실행 예시를 서버에서 전부 돌려 보기 (`node check.mjs`) |

## 문제 추가하기

`wwwroot/q/` 의 파일에 아래 모양으로 추가합니다.

```js
Q.push({
  id: 'J11', t: 'JavaScript', lv: '하',
  q: '문제',
  code: '문제에 보여줄 코드',
  c: ['보기 1', '보기 2', '보기 3', '보기 4'], a: 1,        // a = 정답 번호(0부터)
  k: ['개념 설명', '개념을 보여주는 코드 → 결과'],
  ex: '정답 해설',
  w: ['보기 1이 오답인 이유', null, '보기 3 …', '보기 4 …'],  // 정답 자리는 null
  run: { lang: 'js' },                                      // 직접 실행 칸 (sql, cs, js, ts, rust)
});
```

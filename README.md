# 기초 학습지

개발 기초를 4지선다 문제로 익히는 학습지입니다. 문제를 풀기 전에 개념을 읽고, 코드를 직접 쳐서 실행해 실제 결과를 확인할 수 있습니다.

- 12개 종류, 108문제: MSSQL, C#, Blazor, JavaScript, TypeScript, Node.js, React, Next.js, Tailwind CSS, Rust, IT 면접 기초, 네트워크 기초
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

이 서버는 화면에서 받은 코드를 그대로 실행합니다. 내 컴퓨터에서 혼자 쓰는 용도이며, 외부에 공개된 서버에 배포하면 안 됩니다. `localhost`에서 온 요청만 받도록 막아 두었습니다.

SQL은 실행할 때마다 `QuizScratch` 라는 연습용 DB를 새로 만들어 그 안에서 돌립니다.

## 구조

| 파일 | 내용 |
|---|---|
| `Program.cs` | 서버. 화면 제공 + 코드 실행 API (`/run/sql`, `/run/cs`, `/run/js`, `/run/ts`, `/run/rust`) |
| `wwwroot/index.html` | MSSQL · C# · Blazor 문제 |
| `wwwroot/q/*.js` | 나머지 종류의 문제 |
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

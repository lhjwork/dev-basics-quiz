// 화면 로직. 문제 데이터는 index.html(Q, K, W)과 q/*.js(Q.push)에 있다.

// ── MSSQL · C# 문제의 "직접 실행" 설정: setup = 미리 만들어 둘 테이블, code = 예시 코드(없으면 문제의 코드) ──
const T_CUSTOMER = `CREATE TABLE Customer (
    Id   INT PRIMARY KEY,
    Name NVARCHAR(50) NOT NULL
);
INSERT INTO Customer VALUES (1, N'A'), (2, N'B'), (3, N'C');`;
const T_QUOTE = `CREATE TABLE Quote (
    Id         INT IDENTITY(1,1) PRIMARY KEY,
    CustomerId INT NOT NULL
);
INSERT INTO Quote (CustomerId) VALUES (1), (1), (2);`;
const T_QUOTE_STATUS = `CREATE TABLE Quote (
    Id         INT IDENTITY(1,1) PRIMARY KEY,
    CustomerId INT NOT NULL,
    Status     NVARCHAR(20) NOT NULL
);
INSERT INTO Quote (CustomerId, Status) VALUES (1, 'Open'), (1, 'Ordered'), (2, 'Open');`;
const T_PRODUCT = `CREATE TABLE Product (
    Id    INT IDENTITY(1,1) PRIMARY KEY,
    Name  NVARCHAR(100) NOT NULL,
    Stock INT NOT NULL CHECK (Stock >= 0),
    Price DECIMAL(10, 2) NOT NULL CHECK (Price >= 0)
);
INSERT INTO Product (Name, Stock, Price) VALUES (N'마스크 KF94', 10, 1000), (N'덴탈 마스크', 50, 300), (N'장갑', 20, 500);`;
const sql = (setup, code) => ({ lang: 'sql', setup, code });
const cs = code => ({ lang: 'cs', code });

const RUN = {
  S1: sql(T_CUSTOMER + '\n' + T_QUOTE),
  S2: sql(T_QUOTE),
  S3: sql(`CREATE TABLE Quote (
    Id         INT IDENTITY(1,1) PRIMARY KEY,
    CustomerId INT NOT NULL,
    Memo       NVARCHAR(100) NULL
);
INSERT INTO Quote (CustomerId, Memo) VALUES (1, N'급함'), (1, NULL), (2, NULL), (3, N'재견적'), (3, NULL);`),
  S4: sql(`CREATE TABLE Quote (
    Id         INT IDENTITY(1,1) PRIMARY KEY,
    CustomerId INT NOT NULL
);
INSERT INTO Quote (CustomerId) VALUES (1), (1), (2), (2), (3), (3), (1), (2), (3), (1), (2), (3);`, 'SELECT * FROM Quote;'),
  S5: sql(`CREATE TABLE Product (
    Id    INT IDENTITY(1,1) PRIMARY KEY,
    Name  NVARCHAR(100) NOT NULL,
    Price DECIMAL(10, 2) NULL
);
INSERT INTO Product (Name, Price) VALUES (N'마스크', 10), (N'장갑', NULL), (N'소독제', 30);`),
  S6: sql(T_QUOTE_STATUS),
  S7: sql(T_QUOTE_STATUS),
  S8: sql(`CREATE TABLE Quote (
    Id           INT IDENTITY(1,1) PRIMARY KEY,
    CustomerName NVARCHAR(50) NOT NULL,
    CreatedAt    DATE NOT NULL
);
INSERT INTO Quote (CustomerName, CreatedAt) VALUES (N'A사', '2026-11-10'), (N'A사', '2026-11-12'), (N'B사', '2026-11-10');`),
  S9: sql(T_PRODUCT),
  S10: sql(T_QUOTE + '\n' + T_PRODUCT + `
CREATE TABLE QuoteItem (
    Id        INT IDENTITY(1,1) PRIMARY KEY,
    QuoteId   INT NOT NULL REFERENCES Quote(Id),
    ProductId INT NOT NULL REFERENCES Product(Id),
    Qty       INT NOT NULL
);`),
  S11: sql(T_QUOTE + '\n' + T_PRODUCT),
  S12: sql('', `CREATE TABLE Quote (
    Id         INT IDENTITY(1,1) PRIMARY KEY,
    CustomerId INT NOT NULL
);
SELECT name, type_desc FROM sys.indexes WHERE object_id = OBJECT_ID('Quote');`),
  S13: sql(`CREATE TABLE Quote (
    Id         INT IDENTITY(1,1) PRIMARY KEY,
    CustomerId INT NOT NULL,
    CreatedAt  DATETIME2(0) NOT NULL
);
CREATE INDEX IX_Quote_CreatedAt ON Quote (CreatedAt);
INSERT INTO Quote (CustomerId, CreatedAt) VALUES (1, '2026-10-30 09:00'), (1, '2026-11-01 00:00'), (2, '2026-11-15 14:30'), (3, '2026-11-30 23:59'), (3, '2026-12-01 00:00');`,
    `SELECT Id, CreatedAt FROM Quote
WHERE YEAR(CreatedAt) = 2026 AND MONTH(CreatedAt) = 11;`),
  S14: sql(T_PRODUCT, "SELECT Name FROM Product WHERE Name LIKE '마스크%';"),
  S15: sql(T_PRODUCT, `CREATE INDEX IX_Product_Name  ON Product (Name);
CREATE INDEX IX_Product_Price ON Product (Price);
SELECT name, type_desc FROM sys.indexes WHERE object_id = OBJECT_ID('Product');`),
  S16: sql(T_PRODUCT, "SELECT * FROM Product WHERE Name = '' OR 1=1 --';"),

  C1: cs('int a = 5 / 2;\nConsole.WriteLine(a);'),
  C2: cs('var x = 10;\nx = "hello";\nConsole.WriteLine(x);'),
  C3: cs('Console.WriteLine(0.1 + 0.2 == 0.3);\nConsole.WriteLine(0.1m + 0.2m == 0.3m);'),
  C4: cs('string? name = null;\nint len = name?.Length ?? 0;\nConsole.WriteLine(len);'),
  C5: cs(`var a = new Product { Price = 100 };
var b = a;
b.Price = 200;
Console.WriteLine(a.Price);

class Product
{
    public decimal Price { get; set; }
}`),
  C6: cs(`var p = new Product();
p.ChangePrice(100);
Console.WriteLine(p.Price);
// p.Price = -1;   // 앞의 //를 지우고 실행해 보세요

class Product
{
    public decimal Price { get; private set; }
    public void ChangePrice(decimal price) { Price = price; }
}`),
  C7: cs(`var nums = new[] { 1, 2, 3, 4 };
var result = nums.Where(x => x % 2 == 0).Select(x => x * 10);
Console.WriteLine(string.Join(", ", result));`),
  C8: cs(`var quotes = new List<string>();
var b = quotes.FirstOrDefault();
Console.WriteLine(b == null);
var a = quotes.First();
Console.WriteLine("여기까지 오지 못한다");`),
  C9: cs(`var q = GetQuoteAsync(1);
Console.WriteLine(q is Task<Quote>);
var r = await GetQuoteAsync(1);
Console.WriteLine(r.Status);

async Task<Quote> GetQuoteAsync(int id)
{
    await Task.Delay(100);
    return new Quote { Status = "Open" };
}

class Quote
{
    public string Status { get; set; } = "";
}`),
};

// ── 공통 ──
const MARK = { ok: '○', hint: '△', bad: '／', skip: '–' };   // 채점 표시: 맞음 / 보고 맞음 / 틀림 / 모름
const LANG = { sql: 'SQL', cs: 'C#', js: 'JavaScript', ts: 'TypeScript', rust: 'Rust' };
const conceptOf = x => x.k ?? K[x.id];
const wrongOf = x => x.w ?? W[x.id];
const runOf = x => x.run ?? RUN[x.id];
console.assert(new Set(Q.map(x => x.id)).size === Q.length, '문제 id 중복');
Q.forEach(x => console.assert(
  x.c.length === 4 && x.a >= 0 && x.a < 4 && conceptOf(x)
  && wrongOf(x)?.length === 4 && wrongOf(x).every((w, n) => (w === null) === (n === x.a))
  && (!isJa(x) || (['글자', '문법', '어휘', '빈칸', '듣기', '읽기'].includes(x.kind) && (x.kind === '듣기') === !!x.say)),
  '문제 데이터 오류: ' + x.id));

const app = document.getElementById('app');
let list = [];    // 지금 풀고 있는 문제들
let i = 0;
let learning = true;
const res = [];   // 'ok' | 'hint'(개념이나 실행 결과를 보고 맞음) | 'bad' | 'skip'
const hinted = [];
const el = (tag, text, cls) => {
  const e = document.createElement(tag);
  if (text != null) e.textContent = text;
  if (cls) e.className = cls;
  return e;
};

// 주소가 /ja 면 일본어 학습지, 아니면 개발 기초 학습지. 두 쪽 문제는 섞지 않는다.
const JA = /\/ja\/?$/.test(globalThis.location?.pathname ?? '');
const POOL = Q.filter(x => isJa(x) === JA);
document.title = JA ? '일본어 학습지' : '기초 학습지';

// 화면마다 주소(#t=종류&n=번호, #words, #stats)를 둬서 브라우저 뒤로 가기가 앞 화면으로 돌아오게 한다.
let listKey = null;   // 지금 푸는 묶음(같은 묶음 안에서 오가면 채점 기록을 유지한다)
function go(h) { if (location.hash.slice(1) === h) route(); else location.hash = h; }
function goAt(n) { const p = new URLSearchParams(location.hash.slice(1)); p.set('n', n); go(p.toString()); }
function route() {
  const p = new URLSearchParams(location.hash.slice(1));
  if (JA && p.has('words')) return needLogin(words);
  if (JA && p.has('stats')) return needLogin(stats);
  const t = p.get('t'), ids = p.get('ids');
  const qs = ids ? ids.split(',').map(id => POOL.find(x => x.id === id)).filter(Boolean)
    : t === '전체' ? POOL : POOL.filter(x => x.t === t);
  if (!qs.length) return home();
  const key = t ?? ids;
  if (key !== listKey) { list = qs; listKey = key; res.length = hinted.length = 0; }
  i = Math.min(Math.max(+p.get('n') || 0, 0), list.length);
  show();
}
addEventListener('hashchange', route);

function home() {
  listKey = null;
  scrollTo(0, 0);
  // 개발 / 일본어 학습지는 주소로 나뉜다. 맨 위에서 오간다.
  const tabs = el('nav', null, 'tabs');
  [['개발', '/'], ['일본어', '/ja']].forEach(([label, href]) => {
    const a = el('a', label, (href === '/ja') === JA ? 'on' : '');
    a.href = href;
    tabs.append(a);
  });
  app.replaceChildren(
    tabs,
    el('h1', document.title, 'title'),
    el('p', JA ? '종류를 골라서 풀어 보세요. 문제마다 개념과 예문을 먼저 읽고 풀어요.'
               : '종류를 골라서 풀어 보세요. 문제마다 개념을 먼저 읽고, 코드를 직접 쳐서 실행해 볼 수 있어요.', 'lead'));
  const grid = el('div', null, 'home');
  const add = (label, qs) => {
    const b = el('button', null, 'topic');
    b.append(el('span', label, 'tn'), el('span', null, 'leader'), el('span', `${qs.length}문제`, 'tc'));
    b.onclick = () => go(new URLSearchParams({ t: label }).toString());
    grid.append(b);
  };
  for (const t of new Set(POOL.map(x => x.t))) add(t, POOL.filter(x => x.t === t));
  add('전체', POOL);

  // 학습 모드(기본): 개념을 펼쳐 놓고 배우면서 푼다. 끄면 개념을 접어 두고 실력을 확인한다.
  const label = el('label', null, 'mode');
  const box = el('input');
  box.type = 'checkbox';
  box.checked = learning;
  box.onchange = () => { learning = box.checked; };
  label.append(box, ' 학습 모드: 문제마다 개념 설명을 펼쳐 놓고 풀기 (끄면 개념을 접어 두고 실력을 확인하는 진단 모드)');
  app.append(label);
  if (JA) app.append(jaNav());
  app.append(grid);
}

function show() {
  app.replaceChildren();
  scrollTo(0, 0);
  // 학습지 머리(종류 / 난이도 / 문제 번호)와 채점 표시가 쌓이는 진행 칸
  const head = el('header', null, 'sheet-head');
  const back = el('button', '종류 선택', 'back');
  back.onclick = () => go('');
  const field = (name, value) => {
    const f = el('div', null, 'field');
    f.append(el('span', name), el('b', value));
    head.append(f);
  };
  const track = el('ol', null, 'track');
  list.forEach((_, n) => track.append(el('li', MARK[res[n]] ?? '', n === i ? 'now' : '')));
  head.append(back);
  app.append(head, track);
  if (i >= list.length) return result();
  const x = list[i];
  field('종류', x.t);
  field('난이도', x.lv);
  field('문제', `${i + 1} / ${list.length}`);
  const stem = el('h2', null, 'stem');
  stem.append(el('span', `${i + 1}.`, 'qno'), x.q);
  app.append(stem);
  if (x.code) app.append(el('pre', x.code));
  if (x.say) app.append(listenBox(x));

  const [kText, kCode] = conceptOf(x);
  const concept = el('details', null, 'concept');
  concept.append(el('summary', learning ? '먼저 읽기: 이 문제의 개념' : '개념 먼저 보기'), el('div', kText, 'ex'));
  if (kCode) concept.append(el('pre', kCode));
  concept.open = learning;
  concept.ontoggle = () => { if (concept.open) hinted[i] = true; };
  app.append(concept, ...runBox(x, i));

  // 보기 순서를 매번 섞는다 (정답 위치로 찍지 못하게)
  const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
  const btns = order.map((n, pos) => {
    const b = el('button', null, 'choice');
    b.append(el('span', '①②③④'[pos], 'num'), el('span', x.c[n]));
    b.onclick = () => answer(n);
    return b;
  });
  const btnOf = n => btns[order.indexOf(n)];
  const why = n => `「${x.c[n]}」\n${wrongOf(x)[n]}`;
  const skip = el('button', '모르겠어요 (찍지 말고 이걸 누르세요)', 'skip');
  skip.onclick = () => answer(-1);
  app.append(...btns, skip);
  if (JA) furi(app);

  function answer(n) {
    // 학습 모드에서는 개념을 보는 게 정상이라 '보고 맞음'으로 따로 세지 않는다.
    res[i] = n === x.a ? (hinted[i] && !learning ? 'hint' : 'ok') : n === -1 ? 'skip' : 'bad';
    track.children[i].textContent = MARK[res[i]];
    [...btns, skip].forEach(b => b.disabled = true);
    btnOf(x.a).classList.add('ok');
    const wrong = n >= 0 && n !== x.a;
    if (wrong) {
      btnOf(n).classList.add('bad');
      app.append(el('h3', '고른 보기가 오답인 이유'), el('div', why(n), 'ex bad'));
    }
    app.append(el('h3', '정답 해설'), el('div', x.ex, 'ex'));
    if (x.exCode) app.append(el('pre', x.exCode));
    if (isJa(x)) app.append(jaAfter(x, res[i]));
    const others = el('details');
    others.append(el('summary', wrong ? '나머지 오답 보기는 왜 넣었을까' : '오답 보기는 왜 넣었을까'));
    order.filter(m => m !== x.a && m !== n).forEach(m => others.append(el('div', why(m), 'ex')));
    const next = el('button', i + 1 < list.length ? '다음 문제' : '결과 보기', 'next');
    next.onclick = () => goAt(i + 1);
    app.append(others, next);
    if (JA) furi(app);
  }
}

// 코드를 직접 쳐서 실행해 보는 칸. 실행은 서버(Program.cs)가 한다.
function runBox(x, idx) {
  const spec = runOf(x);
  if (!spec) return [];
  const isSql = spec.lang === 'sql';
  const example = spec.code ?? x.code;
  const box = el('div', null, 'run');
  const ta = el('textarea', null, 'code');
  ta.spellcheck = false;
  ta.rows = Math.max(4, example.split('\n').length + 1);
  ta.placeholder = '코드를 직접 따라 쳐 보세요. 값을 바꿔서 실행해 봐도 좋아요.\n실행: ⌘ + Enter';
  const out = el('div');
  const bar = el('div', null, 'bar');
  const button = (label, fn, cls) => {
    const b = el('button', label, cls);
    b.onclick = fn;
    bar.append(b);
  };
  button('▶ 실행', () => run(ta.value), 'go');
  button('예시 코드 넣기', () => { ta.value = example; ta.focus(); });
  if (isSql && spec.setup) button('준비된 테이블 보기', () => run(''));
  ta.onkeydown = e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') run(ta.value);
    else if (e.key === 'Tab') {   // 코드 칸에서는 Tab = 들여쓰기
      e.preventDefault();
      ta.setRangeText('    ', ta.selectionStart, ta.selectionEnd, 'end');
    }
  };
  box.append(el('b', `직접 실행해 보기 (${LANG[spec.lang]})`), ta, bar, out);
  return [box];

  async function run(code) {
    if (!code.trim() && !isSql) return out.replaceChildren(el('p', '코드를 먼저 입력해 주세요.', 'meta'));
    if (code.trim()) hinted[idx] = true;
    out.replaceChildren(el('p', isSql ? '실행 중…' : '실행 중… (처음 실행은 몇 초 걸려요)', 'meta'));
    try {
      const r = await fetch('run/' + spec.lang, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setup: spec.setup || null, code }),
      });
      if (!r.ok) throw new Error(r.status);
      const d = await r.json();
      out.replaceChildren(...(isSql ? sqlResult(d, code) : [el('pre', d.text || '(출력 없음)', d.ok ? '' : 'err')]));
    } catch {
      out.replaceChildren(el('p', '실행 서버에 연결할 수 없어요. 터미널에서 quiz/run.sh 를 실행한 뒤 http://localhost:5080 으로 열어 주세요.', 'err'));
    }
  }
}

function sqlResult(d, code) {
  const nodes = d.output.map(o => o.type === 'table' ? table(o) : el('p', o.text, o.type === 'error' ? 'err' : 'meta'));
  if (code.trim() && !d.output.length) nodes.push(el('p', '실행됐어요. (화면에 보여줄 결과 줄은 없는 명령)', 'meta'));
  if (d.tables.length) {
    nodes.push(el('h3', code.trim() ? '실행 후 테이블 상태' : '준비된 테이블'));
    d.tables.forEach(t => nodes.push(table(t)));
  }
  return nodes;
}

function table(t) {
  const wrap = el('div', null, 'scroll');
  if (t.name) wrap.append(el('div', t.name, 'tname'));
  const tb = el('table');
  const head = el('tr');
  t.columns.forEach(c => head.append(el('th', c)));
  tb.append(head);
  t.rows.forEach(r => {
    const tr = el('tr');
    r.forEach(v => tr.append(v === null ? el('td', 'NULL', 'null') : el('td', v)));
    tb.append(tr);
  });
  if (!t.rows.length) {
    const td = el('td', '(0줄)', 'null');
    td.colSpan = t.columns.length;
    const tr = el('tr');
    tr.append(td);
    tb.append(tr);
  }
  wrap.append(tb);
  return wrap;
}

function result() {
  const good = res.filter(r => r === 'ok' || r === 'hint').length;
  const score = el('div', null, 'score');
  score.append(el('b', `${Math.round(good / list.length * 100)}점`), el('small', `${list.length}문제 중 ${good}문제를 맞혔어요.`));
  app.append(score);
  const lines = [];
  for (const t of new Set(list.map(x => x.t))) {
    const ids = k => list.filter((x, n) => x.t === t && res[n] === k).map(x => x.id);
    const total = list.filter(x => x.t === t).length;
    lines.push(learning
      ? `[학습] ${t} 맞음 ${ids('ok').length}/${total} | 틀림: ${ids('bad').join(' ') || '-'} | 모름: ${ids('skip').join(' ') || '-'}`
      : `[진단] ${t} 혼자 맞음 ${ids('ok').length}/${total} | 개념·실행 보고 맞음: ${ids('hint').join(' ') || '-'} | 틀림: ${ids('bad').join(' ') || '-'} | 모름: ${ids('skip').join(' ') || '-'}`);
  }
  lines.forEach(l => app.append(el('p', l)));
  const weak = list.filter((x, n) => res[n] !== 'ok');
  if (weak.length) {
    app.append(el('h2', '다시 볼 문제'));
    const ul = el('ul');
    weak.forEach(x => ul.append(el('li', `${x.id} (${x.t}) ${x.q}`)));
    app.append(ul);
  }
  app.append(el('h2', 'Claude에게 붙여넣을 결과'));
  const ta = el('textarea');
  ta.readOnly = true;
  ta.value = lines.join('\n');
  const copy = el('button', '결과 복사', 'next');
  copy.onclick = () => { ta.select(); navigator.clipboard?.writeText(ta.value); copy.textContent = '복사됨'; };
  const again = el('button', '같은 문제 다시 풀기', 'next');
  again.onclick = () => { res.length = hinted.length = 0; goAt(0); };
  app.append(ta, copy, again);
}

route();

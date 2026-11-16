// 일본어 학습지(/ja) 전용: 듣기, 학습 기록, 내 단어장, 성장 기록. 화면 공통 부분은 app.js 에 있다.
// 기록과 단어장은 서버 DB(/api, 비밀번호 필요)에 저장한다. 로그인하지 않으면 문제만 풀 수 있다.
const isJa = x => x.id.startsWith('JP');
const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};
let loggedIn = store.get('jaLogin') === '1';

async function api(path, body, method) {
  const r = await fetch('/api/' + path, body === undefined && !method ? {} : {
    method: method ?? 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}),
  });
  if (r.status === 401) { loggedIn = false; store.set('jaLogin', '0'); }
  if (!r.ok) throw new Error(r.status);
  return r.headers.get('content-type')?.includes('json') ? r.json() : null;
}

// 브라우저 로그인 창이 뜬다(비밀번호만 맞으면 된다). 한 번 맞히면 브라우저가 기억한다.
async function login() {
  try { await api('me'); loggedIn = true; store.set('jaLogin', '1'); return true; }
  catch { return false; }
}

function jaNav() {
  const nav = el('div', null, 'jnav');
  const btn = (label, fn) => { const b = el('button', label); b.onclick = fn; nav.append(b); };
  btn('내 단어장', () => needLogin(words));
  btn('성장 기록', () => needLogin(stats));
  nav.append(el('span', loggedIn ? '기록 중: 푼 문제가 저장됩니다' : '로그인하면 푼 문제와 단어장이 저장돼요', 'meta'));
  if (!loggedIn) btn('로그인', async () => { if (await login()) home(); });
  return nav;
}

async function needLogin(page) {
  if (!loggedIn && !(await login())) return alertBox('비밀번호가 맞지 않거나 로그인 창을 닫았어요.');
  page();
}

function alertBox(text) { app.prepend(el('p', text, 'err')); }

function pageHead(title) {
  app.replaceChildren();
  scrollTo(0, 0);
  const back = el('button', '← 문제 고르기', 'back plain');
  back.onclick = home;
  app.append(back, el('h1', title, 'title'));
}

// ── 듣기: 브라우저에 들어 있는 일본어 음성으로 읽는다 ──
function speak(text, rate = 1) {
  const s = globalThis.speechSynthesis;
  if (!s) return false;
  s.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ja-JP';
  u.rate = rate;
  const v = s.getVoices().find(v => v.lang.replace('_', '-').startsWith('ja'));
  if (v) u.voice = v;
  s.speak(u);
  return true;
}

function listenBox(x) {
  const box = el('div', null, 'run listen');
  const bar = el('div', null, 'bar');
  const msg = el('p', '', 'meta');
  const play = (label, rate, cls) => {
    const b = el('button', label, cls);
    b.onclick = () => { if (!speak(x.say, rate)) msg.textContent = '이 브라우저는 음성 읽기를 지원하지 않아요. 크롬이나 사파리에서 열어 주세요.'; };
    bar.append(b);
  };
  play('▶ 듣기', 1, 'go');
  play('▶ 천천히', 0.7);
  box.append(el('b', '듣기 문제: 소리만 듣고 고르세요 (여러 번 들어도 돼요)'), bar, msg);
  return box;
}

// ── 답한 뒤: 기록 저장, 듣기 원문, 이 문제의 단어 ──
function jaAfter(x, result) {
  const wrap = el('div');
  if (loggedIn) api('answers', { qid: x.id, topic: x.t, kind: x.kind ?? '문법', result }).catch(() => {});
  if (x.say) {
    const p = el('pre', x.say);
    const again = el('button', '▶ 다시 듣기', 'mini');
    again.onclick = () => speak(x.say);
    wrap.append(el('h3', '들려준 문장'), p, again);
  }
  if (x.v?.length) {
    wrap.append(el('h3', '이 문제의 단어'));
    for (const [word, reading, meaning] of x.v) {
      const row = el('div', null, 'wrow');
      const add = el('button', '+ 단어장', 'mini');
      add.onclick = async () => {
        if (!loggedIn && !(await login())) return add.textContent = '로그인 필요';
        try { await api('words', { word, reading, meaning }); add.textContent = '추가됨'; add.disabled = true; }
        catch { add.textContent = '실패 — 다시 누르기'; }
      };
      const say = el('button', '🔊', 'mini');
      say.onclick = () => speak(reading || word);
      row.append(el('b', word), el('span', reading, 'meta'), el('span', meaning), say, add);
      wrap.append(row);
    }
  }
  return wrap;
}

// ── 내 단어장: 추가, 오늘 복습(카드), 전체 목록 ──
async function words() {
  pageHead('내 단어장');
  let list;
  try { list = await api('words'); } catch { return alertBox('단어장을 불러오지 못했어요.'); }

  const form = el('div', null, 'wform');
  const inp = ph => { const i = el('input'); i.placeholder = ph; form.append(i); return i; };
  const w = inp('단어 (例: 水)'), r = inp('읽기 (みず)'), m = inp('뜻 (물)');
  const add = el('button', '추가', 'go');
  add.onclick = async () => {
    if (!w.value.trim()) return w.focus();
    try { await api('words', { word: w.value, reading: r.value, meaning: m.value }); words(); }
    catch { alertBox('추가하지 못했어요.'); }
  };
  form.append(add);
  app.append(el('p', '문제를 푼 뒤 "+ 단어장"을 누르거나 여기서 직접 넣으세요. 복습에서 알았다고 하면 1 → 3 → 7 → 14 → 30 → 60일 뒤에 다시 나와요.', 'lead'), form);

  const due = list.filter(x => x.isDue);
  app.append(el('h2', `오늘 복습할 단어 ${due.length}개`));
  if (due.length) app.append(card(due, 0));
  else app.append(el('p', list.length ? '오늘 복습은 끝났어요.' : '아직 단어가 없어요.', 'meta'));

  app.append(el('h2', `전체 ${list.length}개`));
  for (const x of list) {
    const row = el('div', null, 'wrow');
    const del = el('button', '삭제', 'mini');
    del.onclick = async () => { await api('words/' + x.id, null, 'DELETE').catch(() => {}); row.remove(); };
    row.append(el('b', x.word), el('span', x.reading, 'meta'), el('span', x.meaning),
      el('span', `${'●'.repeat(x.box)}${'○'.repeat(6 - x.box)} 다음 ${x.due}`, 'meta'), del);
    app.append(row);
  }
}

function card(due, n) {
  const box = el('div', null, 'card');
  if (n >= due.length) { box.append(el('p', '오늘 복습 끝! 수고했어요.')); return box; }
  const x = due[n];
  box.append(el('span', `${n + 1} / ${due.length}`, 'meta'), el('div', x.word, 'cword'));
  const back = el('div', null, 'cback');
  back.hidden = true;
  back.append(el('div', x.reading, 'meta'), el('div', x.meaning));
  const bar = el('div', null, 'bar');
  const b = (label, fn, cls) => { const e = el('button', label, cls); e.onclick = fn; bar.append(e); return e; };
  b('🔊', () => speak(x.reading || x.word));
  const show = b('뜻 보기', () => { back.hidden = false; show.remove(); knew.hidden = miss.hidden = false; }, 'go');
  const next = async known => {
    await api(`words/${x.id}/review`, { known }).catch(() => {});
    box.replaceWith(card(due, n + 1));
  };
  const knew = b('알았어요', () => next(true), 'go');
  const miss = b('몰랐어요', () => next(false));
  knew.hidden = miss.hidden = true;
  box.append(back, bar);
  return box;
}

// ── 성장 기록: 주별 정답률, 레벨·유형별 실력, 자주 틀린 문제, 다음 할 일 ──
async function stats() {
  pageHead('성장 기록');
  let s;
  try { s = await api('stats'); } catch { return alertBox('기록을 불러오지 못했어요.'); }
  const pct = (ok, n) => n ? Math.round(ok / n * 100) : null;
  const total = s.weeks.reduce((a, w) => a + w.n, 0);
  if (!total) {
    app.append(el('p', '아직 기록이 없어요. 로그인한 상태로 문제를 풀면 여기에 쌓여요.', 'lead'));
  }

  // 이번 주 vs 지난주
  const monday = d => { const t = new Date(d); t.setDate(t.getDate() - (t.getDay() + 6) % 7); return t.toLocaleDateString('sv'); };
  const now = new Date();
  const thisW = s.weeks.find(w => w.week === monday(now));
  const lastW = s.weeks.find(w => w.week === monday(new Date(now - 7 * 864e5)));
  const sum = el('div', null, 'score');
  const r1 = thisW ? pct(thisW.ok, thisW.n) : null, r0 = lastW ? pct(lastW.ok, lastW.n) : null;
  sum.append(el('b', r1 == null ? '–' : `${r1}%`),
    el('small', `이번 주 ${thisW?.n ?? 0}문제 정답률` + (r0 == null ? '' : ` · 지난주 ${r0}% (${lastW.n}문제) → ${r1 == null ? '' : (r1 - r0 >= 0 ? '+' : '') + (r1 - r0) + '%p'}`)));
  app.append(sum, ...advice(s, pct));

  app.append(el('h2', '주별 정답률 (최근 12주)'));
  app.append(bars(s.weeks.map(w => [w.week.slice(5).replace('-', '/') + ' 주', pct(w.ok, w.n), `${w.n}문제`])));

  app.append(el('h2', '최근 4주 매일 푼 문제'));
  app.append(bars(s.days.map(d => [d.day.slice(5).replace('-', '/'), pct(d.ok, d.n), `${d.n}문제`])));

  app.append(el('h2', '레벨별 실력'));
  app.append(bars(s.topics.map(t => [t.topic, pct(t.ok, t.n), `${t.n}문제` + (t.n7 ? ` · 최근 7일 ${pct(t.ok7, t.n7)}%` : '')])));

  app.append(el('h2', '유형별 실력'));
  app.append(bars(s.kinds.map(k => [k.kind, pct(k.ok, k.n), `${k.n}문제`])));

  const weak = s.weak.map(w => Q.find(x => x.id === w.qid)).filter(Boolean);
  app.append(el('h2', '최근 30일 자주 틀린 문제'));
  if (!weak.length) app.append(el('p', '없어요.', 'meta'));
  else {
    const ul = el('ul');
    s.weak.forEach(w => { const x = Q.find(q => q.id === w.qid); if (x) ul.append(el('li', `${w.wrong}번 틀림 · ${x.t} · ${x.q}`)); });
    const again = el('button', '이 문제들 다시 풀기', 'next');
    again.onclick = () => { list = weak; i = 0; res.length = hinted.length = 0; show(); };
    app.append(ul, again);
  }

  const wd = s.words;
  app.append(el('h2', '단어장'), el('p', `전체 ${wd.total}개 · 오늘 복습 ${wd.due ?? 0}개 · 익힌 단어(4칸 이상) ${wd.learned ?? 0}개`));
}

// 기록을 보고 다음에 할 일을 짧게 알려 준다.
function advice(s, pct) {
  const tips = [];
  const enough = s.topics.filter(t => t.n >= 10);
  for (const t of enough) {
    const p = pct(t.ok, t.n);
    if (p >= 80) tips.push(`${t.topic} 정답률 ${p}% — 다음 레벨로 올라가도 좋아요.`);
    else if (p < 50) tips.push(`${t.topic} 정답률 ${p}% — 개념 설명을 다시 읽고 틀린 문제부터 다시 풀어 보세요.`);
  }
  const kinds = s.kinds.filter(k => k.n >= 5).sort((a, b) => a.ok / a.n - b.ok / b.n);
  if (kinds.length > 1) tips.push(`가장 약한 유형은 「${kinds[0].kind}」(${pct(kinds[0].ok, kinds[0].n)}%)예요.`);
  const days = s.days.length;
  if (days) tips.push(`최근 4주 중 ${days}일 공부했어요.` + (days < 8 ? ' 주 2~3번 이상 꾸준히 풀면 실력이 더 빨리 늘어요.' : ''));
  if (s.words.due) tips.push(`오늘 복습할 단어가 ${s.words.due}개 있어요.`);
  if (!tips.length) return [];
  const ul = el('ul', null, 'tips');
  tips.forEach(t => ul.append(el('li', t)));
  return [el('h2', '지금 상태와 다음 할 일'), ul];
}

function bars(rows) {
  const box = el('div', null, 'bars');
  if (!rows.length) box.append(el('p', '기록 없음', 'meta'));
  for (const [label, p, note] of rows) {
    const bar = el('span', null, 'bar-fill');
    bar.style.width = `${p ?? 0}%`;
    const track = el('span', null, 'bar-track');
    track.append(bar);
    box.append(el('span', label, 'bl'), track, el('span', `${p ?? '–'}% · ${note}`, 'meta'));
  }
  return box;
}

// 학습지 점검: 문제 데이터가 맞게 짜였는지 확인하고, "직접 실행" 예시를 서버에서 전부 실제로 돌려 본다.
// 사용: 서버(run.sh)를 켠 상태에서  node check.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const dir = new URL('./wwwroot/', import.meta.url);
const html = readFileSync(new URL('index.html', dir), 'utf8');
const inline = html.split('<script>')[1].split('</script>')[0];
const files = [...html.matchAll(/<script src="([^"]+)">/g)].map(m => m[1]);

// 가짜 화면: 모든 문제를 한 번씩 그려 보고 답을 눌러 본다.
const node = () => ({
  children: [], classList: { add() {} },
  append(...c) { this.children.push(...c); }, replaceChildren(...c) { this.children = c; },
  focus() {}, select() {}, setRangeText() {},
});
const ctx = vm.createContext({ console, document: { getElementById: node, createElement: node }, scrollTo() {}, navigator: {} });
let failed = 0;
ctx.console = { ...console, assert: (ok, msg) => { if (!ok) { failed++; console.log('데이터 오류:', msg); } } };
vm.runInContext(inline, ctx);
for (const f of files) vm.runInContext(readFileSync(new URL(f, dir), 'utf8'), ctx, { filename: f });

const { Q, specs } = vm.runInContext(`({ Q, specs: Q.map(x => [x.id, runOf(x), x.code]) })`, ctx);
const topics = {};
Q.forEach(x => topics[x.t] = (topics[x.t] || 0) + 1);
console.log(`문제 ${Q.length}개`, topics);

vm.runInContext(`
  list = Q; i = 0; learning = false;
  for (let n = 0; n < Q.length; n++) {
    show();
    const buttons = app.children.filter(c => c.onclick);
    buttons[n % 5].onclick();                           // 보기 4개와 "모르겠어요"를 돌아가며 누른다
    app.children.filter(c => c.onclick).at(-1).onclick();   // 다음 문제
  }
`, ctx);
console.log('전 문항 풀어 보기:', vm.runInContext('res.length', ctx), '문항 기록, 데이터 오류', failed);

// 직접 실행 예시를 서버에서 실제로 돌려 본다.
for (const [id, spec, code] of specs) {
  if (!spec) continue;
  const body = JSON.stringify({ setup: spec.setup || null, code: spec.code ?? code });
  const r = await fetch('http://localhost:5080/run/' + spec.lang, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  const d = await r.json();
  const text = spec.lang === 'sql'
    ? d.output.map(o => o.type === 'table' ? `[표 ${o.columns.join(',')}: ${o.rows.map(row => row.join('|')).join(' / ')}]` : o.text).join(' ; ')
      + (d.tables.length ? `  {테이블: ${d.tables.map(t => `${t.name}(${t.rows.length}줄)`).join(', ')}}` : '')
    : (d.ok ? '' : '(실패) ') + d.text;
  console.log(`\n${id} [${spec.lang}] ${text.replace(/\n/g, ' ⏎ ').slice(0, 420)}`);
}

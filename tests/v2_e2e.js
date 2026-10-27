/* 급여관리 시스템 v2 자동 시험 (가상 데이터만 사용)
 *
 *   node tests/v2_e2e.js
 *
 * 공유 폴더는 브라우저 안의 가상 폴더(OPFS)로 대신하고, Power Automate 결과(.json)는 시험 코드가 직접 만든다.
 * 시험 환경 Chromium은 가상 폴더에 한글 이름을 못 만들어서 이름만 바꿔 저장한다(실제 PC 폴더와 무관).
 */
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const APP = '/dist/' + encodeURIComponent('급여조견표_관리시스템_v2.html');
const FIXTURE = path.join(ROOT, 'samples', '가상_실양식_급여테이블.xlsx');
const EXE = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell') ? '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' : undefined);

const STUB = `
  const enc = n => n.replace(/[^\\x00-\\x7f]/g, c => '_u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  const dec = n => n.replace(/_u([0-9a-f]{4})/g, (m, x) => String.fromCharCode(parseInt(x, 16)));
  const nd = Object.getOwnPropertyDescriptor(FileSystemHandle.prototype, 'name');
  Object.defineProperty(FileSystemHandle.prototype, 'name', { get(){ return dec(nd.get.call(this)); } });
  for(const m of ['getFileHandle', 'getDirectoryHandle', 'removeEntry']){
    const f = FileSystemDirectoryHandle.prototype[m];
    FileSystemDirectoryHandle.prototype[m] = function(n, o){ return f.call(this, enc(n), o); };
  }
  FileSystemHandle.prototype.queryPermission = async () => 'granted';
  FileSystemHandle.prototype.requestPermission = async () => 'granted';
  window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('급여조견표', { create:true });
`;
const OLE = Buffer.concat([Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]), Buffer.alloc(600)]);

let failed = 0;
const ok = (cond, msg) => { console.log((cond ? '  통과 ' : '  실패 ') + msg); if(!cond) failed++; };
const put = (p, name, buf) => p.evaluate(([name, b64]) => {
  const bin = atob(b64), u = new Uint8Array(bin.length); for(let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const dt = new DataTransfer(); dt.items.add(new File([u], name)); const inp = document.getElementById('fileInput');
  inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles:true }));
}, [name, buf.toString('base64')]);
const listDir = (p, sub) => p.evaluate(async sub => {
  const d = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('급여조견표')).getDirectoryHandle(sub);
  const out = []; for await (const h of d.values()) out.push(h.name); return out;
}, sub);
/* Power Automate 대신 02_연동데이터에 결과 JSON을 만든다 */
const fakeFlow = (p, base) => p.evaluate(async ([base, b64]) => {
  const bin = atob(b64), u = new Uint8Array(bin.length); for(let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const ws = XLSX.read(u, { type:'array' }).Sheets['급여테이블(변경후)'];
  const values = XLSX.utils.sheet_to_json(ws, { header:1, defval:'' });
  const d = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('급여조견표')).getDirectoryHandle('02_연동데이터');
  const w = await (await d.getFileHandle(base + '.json', { create:true })).createWritable();
  await w.write(JSON.stringify({ v:2, kind:'PAYTABLE', sheet:'급여테이블(변경후)', file:'보호.xlsx', start:'A1', values })); await w.close();
}, [base, fs.readFileSync(FIXTURE).toString('base64')]);
const seedFolders = p => p.evaluate(async () => {
  const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('급여조견표', { create:true });
  for(const n of ['01_원본', '02_연동데이터', '03_조견표', '04_스냅샷', '05_보고서']) await d.getDirectoryHandle(n, { create:true });
});

(async () => {
  const srv = http.createServer((q, r) => {
    const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(p, (e, d) => { if(e){ r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); r.end(d); });
  }).listen(0);
  const base = `http://localhost:${srv.address().port}`;
  const b = await chromium.launch(EXE ? { executablePath: EXE } : {});
  const newPage = async () => {
    const ctx = await b.newContext({ viewport:{ width:1400, height:950 } });
    await ctx.addInitScript(STUB);
    const p = await ctx.newPage(); p.errs = [];
    p.on('pageerror', e => p.errs.push(e.message));
    await p.route(/fonts\.(googleapis|gstatic)|\/api\//, r => r.abort());
    return p;
  };

  console.log('1. 실양식 가상 파일 읽기');
  let p = await newPage();
  await p.goto(base + APP); await p.waitForSelector('#v2Wizard:not([hidden])');
  const parsed = await p.evaluate(b64 => { const bin = atob(b64), u = new Uint8Array(bin.length); for(let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const r = parsePaytable(XLSX.read(u, { type:'array' })); return { center: r.centerName, jobs: r.jobs.length, totals: r.jobs.filter(j => j.monthlyTotal > 0).length }; },
    fs.readFileSync(FIXTURE).toString('base64'));
  ok(parsed.jobs === 7 && parsed.totals === 7, `직무 ${parsed.jobs}개, 월 합계 있는 직무 ${parsed.totals}개 (기대 7·7)`);
  ok(parsed.center === '가상시 민원상담콜센터', `센터명 인식: ${parsed.center}`);

  console.log('2. 폴더 미연결 상태에서 보안 파일 올리기 → 오류 대신 연결 안내 → 연결 후 자동 이어서 처리');
  await seedFolders(p);
  await p.fill('#v2Name', '홍길동'); await p.fill('#v2Ini', 'hgd'); await p.click('#v2Next1');
  await p.click('#v2Later');
  await put(p, '보안_가상.xlsx', OLE);
  await p.waitForFunction(() => document.getElementById('v2State').textContent === '연결 필요');
  const meta = await p.textContent('#fileMeta');
  ok(!/찾을 수 없|오류/.test(meta), `오류 문구 없음: "${meta}"`);
  ok(await p.isVisible('#v2NeedConnect'), '[공유 폴더 연결하기] 버튼 표시');
  if(process.env.SHOTS) await p.screenshot({ path: path.join(process.env.SHOTS, 'v2_need.png') });
  await p.click('#v2NeedConnect');
  await p.check('#v2Synced'); await p.click('#v2Next2'); await p.click('#v2Pick');
  await p.waitForFunction(() => window.__v2.pending && window.__v2.pending.base);
  const pend = await p.evaluate(() => window.__v2.pending);
  ok(/^\d{8}-HGD-01_보안_가상$/.test(pend.base), `연결 직후 자동으로 이어서 처리: ${pend.stored}`);
  ok((await listDir(p, '01_원본')).includes(pend.stored), '01_원본에 요청번호 붙은 파일 저장');
  await p.click('#v2Done');

  console.log('3. M365 결과(.json)가 생기면 조견표로 읽기');
  await p.selectOption('#v2q_centerType', '금융');
  await fakeFlow(p, pend.base);
  await p.waitForFunction(() => document.getElementById('fileMeta').textContent.includes('자동연동'), null, { timeout: 20000 });
  ok(true, (await p.textContent('#fileMeta')).slice(0, 60));

  console.log('4. 일반 엑셀은 바로 읽고 원본만 보관');
  await put(p, 'plain_fixture.xlsx', fs.readFileSync(FIXTURE));
  await p.waitForFunction(() => document.getElementById('fileMeta').textContent.includes('plain_fixture'));
  ok((await listDir(p, '01_원본')).some(n => n.endsWith('_plain_fixture.xlsx')), '01_원본에 보관');

  console.log('5. 통계 저장 → 04_스냅샷');
  await p.evaluate(() => { checkState.issues.filter(i => i.level === 'confirm').forEach(i => { checkState.acked.add(i.key); checkState.reasons[i.key] = '시험'; }); renderChecklist(); generateTables(); });
  await p.waitForFunction(() => document.getElementById('snapPanel').style.display === 'block');
  await p.click('#snapSaveBtn'); await p.waitForTimeout(500);
  ok((await listDir(p, '04_스냅샷')).length === 1, '스냅샷 파일 1건');

  console.log('6. 다시 열면 안내 없이 바로 연결');
  await p.reload(); await p.waitForTimeout(1500);
  ok(await p.$eval('#v2Wizard', e => e.hidden), '첫 실행 안내 안 뜸');
  ok((await p.textContent('#v2Conn')).includes('연결됨'), await p.textContent('#v2Conn'));
  ok(p.errs.length === 0, `스크립트 오류 ${p.errs.length}건 ${p.errs.join(' / ')}`);

  await b.close(); srv.close();
  console.log(failed ? `\n실패 ${failed}건` : '\n모두 통과');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

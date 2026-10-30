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

  await p.evaluate(() => { SETTINGS.uploadMode = 'auto'; });   // 2~5번은 자동(M365) 방식 시험
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
  await p.waitForSelector('#v2Compare:not([hidden])');
  const cmp = await p.$$eval('#v2Compare tbody tr', trs => ({ n: trs.length, down: trs.filter(t => t.classList.contains('v2-down')).length }));
  ok(cmp.n === 7 && cmp.down === 0, `변경전 대비 비교표 ${cmp.n}행, 감소 ${cmp.down}개 (기대 7·0)`);

  console.log('5. 통계 저장 → 04_스냅샷');
  await p.evaluate(() => { checkState.issues.filter(i => i.level === 'confirm').forEach(i => { checkState.acked.add(i.key); checkState.reasons[i.key] = '시험'; }); renderChecklist(); generateTables(); });
  await p.waitForFunction(() => document.getElementById('snapPanel').style.display === 'block');
  await p.click('#v2Flow [data-flow="save"]');   // 단계 탭: 통계 저장
  await p.click('#snapSaveBtn'); await p.waitForTimeout(500);
  ok((await listDir(p, '04_스냅샷')).filter(n => /\.json$/i.test(n)).length === 1, '스냅샷 파일 1건 (이력 폴더 제외)');

  console.log('5-1. 같은 센터를 다시 올리면 지난 답변으로 자동 채움');
  await p.evaluate(() => sysStore.setKV('lastAnswers', {}));
  await put(p, 'plain_again.xlsx', fs.readFileSync(FIXTURE));
  await p.waitForSelector('#v2Prefill:not([hidden])', { state:'attached' });
  ok(await p.inputValue('#v2q_centerType') === '금융', '센터유형 "금융" 자동 채움: ' + await p.textContent('#v2Prefill'));

  console.log('5-2. 결과 자동 보관 (ZIP → 03_조견표)');
  await p.evaluate(() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['zip'])); a.download = '급여조견표_끔.zip'; a.click(); });
  await p.waitForTimeout(500);
  ok(!(await listDir(p, '03_조견표')).some(n => n.includes('끔')), '기본(꺼짐): 공유 폴더에 저장하지 않음');
  await p.evaluate(() => { SETTINGS.autoArchive = true; });
  await p.evaluate(() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['zip'])); a.download = '급여조견표_시험.zip'; a.click(); });
  await p.waitForTimeout(800);
  ok((await listDir(p, '03_조견표')).some(n => n.endsWith('_급여조견표_시험.zip')), '03_조견표에 저장');

  console.log('5-3. 상태 점검 · 처리 이력');
  await p.evaluate(async () => { const d = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('급여조견표')).getDirectoryHandle('02_연동데이터');
    const w = await (await d.getFileHandle('20990101-ZZZ-01_실패시험.error.json', { create:true })).createWritable(); await w.write('{"kind":"PAYTABLE_ERROR"}'); await w.close(); });
  await p.click('#v2HealthBtn');
  await p.waitForFunction(() => !document.querySelector('#v2HealthList .hint'));
  const health = await p.$$eval('#v2HealthList li', lis => lis.map(l => l.dataset.state + ':' + l.querySelector('b').textContent));
  ok(health.includes('ok:쓰기·읽기 시험') && health.includes('warn:처리 실패 기록'), '점검 결과 ' + health.join(' / '));
  if(process.env.SHOTS) await p.screenshot({ path: path.join(process.env.SHOTS, 'v2_health.png') });
  await p.click('#v2HealthClose');
  await p.click('#tabBtnHistory');
  await p.waitForFunction(() => !/읽는 중/.test(document.getElementById('v2HistBody').textContent));
  const hist = await p.$$eval('#v2HistBody tr', trs => trs.map(t => t.cells[5] ? t.cells[5].textContent.trim() : ''));   // 열: 시각·사람·센터·산업·파일·상태
  ok(hist.includes('완료') && hist.includes('실패') && hist.includes('처리 중'), '처리 이력 상태: ' + hist.join(', '));
  if(process.env.SHOTS) await p.screenshot({ path: path.join(process.env.SHOTS, 'v2_history.png') });
  await p.click('#v2HistBody [data-open]');
  await p.waitForFunction(() => document.getElementById('tabCreate').classList.contains('on') && document.getElementById('fileMeta').textContent.includes('자동연동'));
  ok(true, '이력에서 [열기] → 다시 올리지 않고 조견표 화면');

  console.log('5-4. 도움말 · 관리자 메뉴');
  await p.locator('.v2-help:visible').first().click();
  ok(await p.isVisible('.v2-pop'), '도움말: ' + (await p.textContent('.v2-pop')).slice(0, 30));
  await p.click('#tabBtnSettings');
  const hasLinks = await p.evaluate(() => !!(window.V2_CONFIG.links && window.V2_CONFIG.links.folder));
  const cards = await p.$$eval('.v2-linkcard', a => a.length);
  ok(hasLinks ? cards >= 7 : cards === 0, `관리자 바로가기 ${cards}개 (주소 설정 ${hasLinks ? '있음' : '없음'})`);
  if(process.env.SHOTS) await p.screenshot({ path: path.join(process.env.SHOTS, 'v2_admin.png') });
  await p.evaluate(() => { SETTINGS.admins = ['ZZZ']; window.__v2.applyRole(); });
  ok(await p.$eval('#v2Admin', e => e.hidden), '관리자가 아니면 관리자 바로가기 숨김');
  await p.evaluate(() => { SETTINGS.admins = []; window.__v2.applyRole(); });

  console.log('7. 붙여넣기 방식(기본): 보안 파일을 PC 밖으로 보내지 않음');
  await p.evaluate(() => { SETTINGS.uploadMode = 'paste'; });
  await p.click('#tabBtnCreate');
  const srcBefore = (await listDir(p, '01_원본')).length;
  await put(p, '보안_붙여넣기.xlsx', OLE);
  await p.waitForFunction(() => document.getElementById('v2State').textContent === '붙여넣기');
  ok((await listDir(p, '01_원본')).length === srcBefore, '보안 파일을 01_원본(OneDrive)에 복사하지 않음');
  ok(await p.isVisible('#v2PasteInput'), '붙여넣기 안내 3단계와 붙여넣기 칸 표시');
  if(process.env.SHOTS) await p.screenshot({ path: path.join(process.env.SHOTS, 'v2_paste.png') });
  /* PC Excel의 붙여넣기 스크립트 v2 출력 흉내: 값 + 변경전 값 → Base64 → PAYTABLE-V1 … END */
  const pasteText = await p.evaluate(b64 => {
    const bin = atob(b64), u = new Uint8Array(bin.length); for(let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const wb = XLSX.read(u, { type:'array' });
    const grid = n => XLSX.utils.sheet_to_json(wb.Sheets[n], { header:1, defval:'', raw:true });
    const json = JSON.stringify({ v:2, kind:'PAYTABLE', sheet:'급여테이블(변경후)', file:'보안_붙여넣기.xlsx', start:'A1', values: grid('급여테이블(변경후)'), before: grid('급여테이블(변경전)') });
    const bytes = new TextEncoder().encode(json); let s = ''; bytes.forEach(b => { s += String.fromCharCode(b); });
    const enc = btoa(s), rows = ['PAYTABLE-V1']; for(let i = 0; i < enc.length; i += 30000) rows.push('p' + enc.slice(i, i + 30000)); rows.push('END');
    return rows.join('\r\n');
  }, fs.readFileSync(FIXTURE).toString('base64'));
  await p.evaluate(t => { const dt = new DataTransfer(); dt.setData('text/plain', t); document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles:true })); }, pasteText);
  await p.waitForFunction(() => document.getElementById('fileMeta').textContent.includes('붙여넣기'));
  ok(await p.textContent('#v2State') === '완료', '화면 아무 곳에서 Ctrl+V → 읽기 완료');
  ok(await p.isVisible('#v2Compare'), '붙여넣기 데이터로도 변경전 대비 비교표 표시');
  await put(p, 'plain_paste_mode.xlsx', fs.readFileSync(FIXTURE));
  await p.waitForFunction(() => document.getElementById('fileMeta').textContent.includes('plain_paste_mode'));
  ok((await listDir(p, '01_원본')).length === srcBefore, '일반 엑셀도 PC 밖으로 복사하지 않음');
  await p.click('#tabBtnSettings');
  ok(await p.isChecked('#v2ModePaste'), '기준정보 › 보안 파일 처리 방식: 붙여넣기 선택됨');

  console.log('8. 웹 업로드 방식: SharePoint에 직접 올리고 결과만 자동 감지');
  await p.evaluate(() => { SETTINGS.uploadMode = 'web'; });
  await p.click('#tabBtnCreate');
  const srcBefore2 = (await listDir(p, '01_원본')).length;
  await put(p, '보안_웹.xlsx', OLE);
  await p.waitForFunction(() => document.getElementById('v2State').textContent === '웹 업로드');
  ok((await listDir(p, '01_원본')).length === srcBefore2, '원본을 동기화 폴더(01_원본)에 복사하지 않음');
  ok((await p.textContent('#v2JobAct')).includes('끌어다 놓습니다'), '업로드 2단계 안내 표시');
  if(process.env.SHOTS) await p.screenshot({ path: path.join(process.env.SHOTS, 'v2_web.png') });
  await fakeFlow(p, '보안_웹 (1)');    // SharePoint가 같은 이름이 있으면 ' (1)'을 붙이는 경우
  await p.waitForFunction(() => document.getElementById('fileMeta').textContent.includes('자동연동'), null, { timeout: 20000 });
  ok(await p.textContent('#v2State') === '완료', '결과(.json) 자동 감지 → 조견표 화면');
  await p.click('#tabBtnHistory');
  await p.waitForFunction(() => /웹/.test(document.getElementById('v2HistBody').textContent));
  ok(true, '처리 이력에 웹 업로드 결과 표시');

  console.log('8-1. [SharePoint에 바로 올리기] 한 번만: 시스템에 파일을 올리지 않아도 새 결과 자동 수신');
  await p.evaluate(() => { window.V2_CONFIG.links = Object.assign({}, window.V2_CONFIG.links, { upload: 'about:blank' }); window.__v2.renderLinks(); });
  await p.click('#tabBtnCreate'); await p.click('#v2Flow [data-flow="up"]');
  ok(await p.isVisible('#v2WebGo'), '[SharePoint에 바로 올리기] 버튼 표시');
  const [popup] = await Promise.all([p.context().waitForEvent('page'), p.click('#v2WebGo')]);
  await popup.close();
  await p.waitForFunction(() => document.getElementById('v2State').textContent === '웹 업로드');
  await p.waitForTimeout(6000);
  await fakeFlow(p, '센터B_급여테이블');
  await fakeFlow(p, '다른사람_급여테이블');
  // 바로 올리기는 누구 파일인지 몰라 바로 열지 않고 도착한 결과 이름을 보여 주고 고르게 함
  await p.waitForFunction(() => document.getElementById('v2State').textContent === '결과 확인', null, { timeout: 25000 });
  const picks = await p.$$eval('#v2JobAct [data-pick]', bs => bs.map(b => b.textContent));
  ok(picks.length === 3 && picks.some(t => /센터B/.test(decodeURIComponent(t.replace(/_u([0-9a-f]{4})/g, (m, c) => String.fromCharCode(parseInt(c, 16)))))), '결과 2건 도착 → 파일 이름으로 고르기 + 계속 기다리기: ' + picks.length + '개 버튼');
  const idx = await p.$$eval('#v2JobAct [data-pick]', bs => bs.findIndex(b => /센터B|_uc13c_ud130B/i.test(b.textContent)));
  await p.click(`#v2JobAct [data-pick="${Math.max(0, idx)}"]`);
  await p.waitForFunction(() => document.getElementById('fileMeta').textContent.includes('자동연동'), null, { timeout: 25000 });
  // (시험 환경은 한글 파일명이 인코딩되어 보이므로 상태로 확인)
  ok(await p.textContent('#v2State') === '완료', '시스템에 파일을 올리지 않고도 새 결과를 받아 조견표 화면');

  console.log('8-2. [기준정보 › SharePoint 주소] 저장 → 공유 폴더 99_설정/settings.json에 기록(모든 사용자 적용)');
  await p.click('.app-tab[data-tab="settings"]'); await p.click('[data-settab-go="system"]');
  await p.fill('#v2SpFolder', 'https://dummy.sharepoint.com/sites/paysys/Shared Documents/급여조견표');
  await p.click('#v2SpSave'); await p.waitForTimeout(800);
  const shared = await p.evaluate(async () => {
    const d = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('급여조견표')).getDirectoryHandle('99_설정');
    return JSON.parse(await (await (await d.getFileHandle('settings.json')).getFile()).text()).settings.links;
  });
  ok(shared && shared.folder === 'https://dummy.sharepoint.com/sites/paysys/Shared Documents/급여조견표', 'settings.json에 SharePoint 주소 저장: ' + (shared && shared.folder));
  ok(/모든 사용자에게 적용/.test(await p.textContent('#v2SpMsg')), await p.textContent('#v2SpMsg'));

  console.log('8-3. 자동 백업(하루 1회, 99_설정/백업) · 기준정보 › 데이터에서 되돌리기');
  const backups = () => p.evaluate(async () => {
    const d = await (await (await (await navigator.storage.getDirectory()).getDirectoryHandle('급여조견표')).getDirectoryHandle('99_설정')).getDirectoryHandle('백업');
    const out = []; for await (const h of d.values()) out.push(h.name); return out.sort();
  });
  await p.waitForTimeout(500);
  let bk = await backups();
  ok(bk.length === 1 && /^백업_\d{8}\.json$/.test(bk[0]), '연결되면 오늘 백업 1개 자동 생성: ' + bk.join(', '));
  await p.evaluate(() => window.__v2settings.autoBackup()); await p.waitForTimeout(300);
  ok((await backups()).length === 1, '같은 날 다시 열어도 자동 백업은 1개');
  await p.click('.app-tab[data-tab="settings"]'); await p.click('[data-settab-go="data"]');
  await p.waitForSelector('#v2BackupBody [data-restore]');
  await p.evaluate(async () => { SETTINGS.centerTypes = SETTINGS.centerTypes.concat(['시험용유형']); await saveSettings(); });
  p.once('dialog', d => d.accept());
  await p.click(`#v2BackupBody [data-restore="${bk[0]}"]`);
  await p.waitForFunction(() => /되돌렸습니다/.test(document.getElementById('v2BackupMsg').textContent), null, { timeout: 10000 });
  ok(await p.evaluate(() => !SETTINGS.centerTypes.includes('시험용유형')), '되돌리기: 기준정보가 백업 시점으로 · ' + await p.textContent('#v2BackupMsg'));
  bk = await backups();
  ok(bk.some(n => /되돌리기전/.test(n)), '되돌리기 직전 상태도 백업: ' + bk.join(', '));
  ok(await p.evaluate(() => document.querySelector('.app-tab[data-tab="data"]').hidden) && await p.isVisible('#dataBody'), '[급여 데이터] 메뉴는 숨기고 기준정보 › 데이터에서 목록 표시');

  console.log('6. 다시 열면 안내 없이 바로 연결');
  await p.reload(); await p.waitForTimeout(1500);
  ok(await p.$eval('#v2Wizard', e => e.hidden), '첫 실행 안내 안 뜸');
  ok((await p.textContent('#v2Conn')).includes('연결됨'), await p.textContent('#v2Conn'));
  console.log('9. 연결 정보가 지워진 상태에서 "이전에 연결한 폴더 다시 사용"');
  await p.evaluate(() => sysStore.setKV('onboarded', null));
  await p.click('#v2Conn');          // 연결됨 상태에서 누르면 권한만 확인 → 그대로 연결 유지
  ok((await p.textContent('#v2Conn')).includes('연결됨'), '연결 상태 유지');
  ok(p.errs.length === 0, `스크립트 오류 ${p.errs.length}건 ${p.errs.join(' / ')}`);

  await b.close(); srv.close();
  console.log(failed ? `\n실패 ${failed}건` : '\n모두 통과');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

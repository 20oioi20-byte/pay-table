/* v2.6.6 변경동의서(호봉별 Word) 시험 (가상 실양식 파일만 사용)
 *   node tests/v2_consent.js
 */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const http = require('http');
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if(e){ r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(d); } }); }).listen(0);
const APP = () => `http://localhost:${srv.address().port}/dist/` + encodeURIComponent('급여조견표_관리시스템_v2.html');
const FIXTURE = fs.readFileSync(path.join(ROOT, 'samples', '가상_실양식_급여테이블.xlsx')).toString('base64');
const EXE = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell') ? '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' : undefined);
let failed = 0;
const ok = (c, m) => { console.log((c ? '  통과 ' : '  실패 ') + m); if(!c) failed++; };

(async () => {
  const b = await chromium.launch(EXE ? { executablePath: EXE } : {});
  const ctx = await b.newContext({ viewport:{ width:1400, height:950 }, acceptDownloads:true });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.route(/fonts\./, r => r.abort());
  await p.route(/\/api\//, r => r.abort());
  await p.goto(APP());
  await p.waitForSelector('#v2Wizard:not([hidden])');
  await p.fill('#v2Name', '홍길동'); await p.fill('#v2Ini', 'HGD'); await p.click('#v2Next1'); await p.click('#v2Later');

  /* 가상 실양식을 자동연동 JSON처럼 만들어 넣는 도우미 (mutate로 수식·변경전 값을 바꿔 시험) */
  const load = (mutate) => p.evaluate(([b64, mutate]) => {
    document.getElementById('fileMeta').textContent = '';   // 이전 불러오기 표시를 지워 waitParsed가 새 결과를 기다리게
    const bin = atob(b64), u = new Uint8Array(bin.length); for(let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const wb = XLSX.read(u, { type:'array', cellFormula:true });
    const grid = n => { const ws = wb.Sheets[n], rg = XLSX.utils.decode_range(ws['!ref']);
      const values = XLSX.utils.sheet_to_json(ws, { header:1, defval:'', raw:true }), formulas = [];
      for(let r = rg.s.r; r <= rg.e.r; r++){ const row = []; for(let c = rg.s.c; c <= rg.e.c; c++){ const x = ws[XLSX.utils.encode_cell({ r, c })]; row.push(x && x.f ? '=' + x.f : ''); } formulas.push(row); }
      return { values, formulas }; };
    const cur = grid('급여테이블(변경후)'), prev = grid('급여테이블(변경전)');
    const extra = wb.SheetNames.filter(n => !n.includes('급여테이블') && /견적|대비|대사/.test(n)).map(n => {
      const rg = XLSX.utils.decode_range(wb.Sheets[n]['!ref']); rg.s = { r:0, c:0 };
      return { name:n, values: XLSX.utils.sheet_to_json(wb.Sheets[n], { header:1, defval:'', raw:true, range:rg }) }; });
    const payload = { v:2, kind:'PAYTABLE', sheet:'급여테이블(변경후)', file:'시험.xlsx', start:'A1', values: cur.values, formulas: cur.formulas, before: prev.values, extra };
    if(mutate) (new Function('p', mutate))(payload);
    handleLinkedJsonFile(new File([JSON.stringify(payload)], '시험.json'));
  }, [FIXTURE, mutate || '']);
  const issues = () => p.evaluate(() => checkState.issues.map(i => `${i.level}:${i.key}`));
  const waitParsed = () => p.waitForFunction(() => document.getElementById('fileMeta').textContent.includes('자동연동') && checkState && checkState.issues);
  const docText = (b64) => require('child_process').execFileSync('python3', ['-I', '-c', `
import sys, zipfile, io, re, base64
x = zipfile.ZipFile(io.BytesIO(base64.b64decode(sys.stdin.read()))).read('word/document.xml').decode()
print('\\n'.join(''.join(re.findall(r'<w:t[^>]*>([^<]*)</w:t>', p)) for p in re.findall(r'<w:p[ >].*?</w:p>', x, re.S)))`], { input: b64 }).toString();
  /* 호봉 하나의 동의서 값 · Word 글자 */
  const consentOf = (label, extra) => p.evaluate(async ([label, extra]) => {
    const v = window.__v2, pr = v.comparePairs.find(x => jobLabel(x.j).includes(label));
    const vals = Object.assign({ YY:'26', CENTER: parsedData.centerName, BRIEF:'0000년 00월 00일', CHANGE:'주요 변경사항 기재', EFF:'' }, extra || {},
      window.__v2consent.valuesFor(pr.p, pr.j, v.comparePrev.notes, parsedData.notes));
    const blob = await window.__v2consent.makeDocx(vals), buf = new Uint8Array(await blob.arrayBuffer());
    let s = ''; for(let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
    return { vals, b64: btoa(s) };
  }, [label, extra || null]);

  console.log('1. 시행일: 관리번호 오른쪽 센터명/날짜 → 없거나 애매하면 빈칸');
  const eff = await p.evaluate(() => ['가상센터/2026년1월', '가상센터/2026년 3월 15일', '가상센터/2026.07.01', '가상센터/20261001', '가상센터/2026년', '가상센터', '']
    .map(s => { const e = window.__v2consent.parseEffective(s); return e ? `${e.y}-${e.m}-${e.d}` : '빈칸'; }));
  ok(eff.join(',') === '2026-1-1,2026-3-15,2026-7-1,2026-10-1,빈칸,빈칸,빈칸', eff.join(', '));

  console.log('2. 기본: 근무형태·휴게시간·상동·업적수당 S~E');
  await load(); await waitParsed();
  let c = await consentOf('상담1');
  ok(c.vals.WORKT_B === '일8H/주5일/주 40시간' && c.vals.WORKT_A === '상동', `근무시간 ${c.vals.WORKT_B} → ${c.vals.WORKT_A}`);
  ok(c.vals.REST_B === '12:00 ~ 13:00' && c.vals.REST_A === '상동', `휴게시간 ${c.vals.REST_B} → ${c.vals.REST_A}`);
  ok(c.vals.BASIC_B1 === '시급 10,320원 기준 산정' && c.vals.BASIC_A1 === '상동', `기본급 ${c.vals.BASIC_B1} → ${c.vals.BASIC_A1}`);
  ok(c.vals.PERF_B === '120,000원 ~ 0원' && c.vals.PERF_A === '상동', `업적수당 S~E ${c.vals.PERF_B}`);
  ok(c.vals.MEAL_B === '90,000원' && c.vals.MEAL_A === '100,000원', `급식비 ${c.vals.MEAL_B} → ${c.vals.MEAL_A}`);
  let t = docText(c.b64);
  ok(!/근로조건 :/.test(t), '근무시간이 그대로면 근로조건 줄 삭제');
  ok(!/\{\{/.test(t) && /‘26년 가상시 민원상담콜센터근로조건\/급여테이블 변경 동의서/.test(t) && /붙임 : ‘26년 가상시 민원상담콜센터 급여테이블 1부/.test(t), '제목·붙임에 센터명, 남은 토큰 없음');
  ok(/0000년 00월 00일 실시된/.test(t) && /주요 변경사항 기재/.test(t), '나중에 작성: 원본 문구 그대로');
  ok(/202 {2}년 {5}월 {4}일/.test(t) && /성명/.test(t), '서명 날짜·소속·사번·성명은 빈칸 그대로');
  ok(/기본급\n시급 10,320원 기준 산정\n {2}- 일 8시간 기준 2,156,880원\n상동\n직무수당/.test(t), '기본급 같으면 변경 칸은 상동 한 줄');

  console.log('2-1. 제목 한 줄 / 두 줄(근로조건부터 둘째 줄) · 1쪽 맞춤(빈 줄 줄이기)');
  const xmlOf = (b64) => require('child_process').execFileSync('python3', ['-I', '-c', `
import sys, zipfile, io, base64
print(zipfile.ZipFile(io.BytesIO(base64.b64decode(sys.stdin.read()))).read('word/document.xml').decode())`], { input: b64 }).toString();
  const titleXml = x => (x.match(/<w:p[ >](?:(?!<w:p[ >])[\s\S])*?근로조건\/급여테이블 변경[\s\S]*?<\/w:p>/) || [''])[0];
  const blanks = x => (x.split('<w:body>')[1].match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []).filter(q => !/<w:t[^>]*>[^<]+<\/w:t>/.test(q) && !/<w:tc>/.test(q)).length;
  const short = await consentOf('상담1', { CENTER:'평택고객센터' });
  let sx = xmlOf(short.b64);
  ok(!/<w:br\/>/.test(titleXml(sx)) && /평택고객센터 근로조건/.test(docText(short.b64)), `한 줄에 조금 넘치는 센터명: 제목 한 줄 (글자 ${(titleXml(sx).match(/<w:sz w:val="(\d+)"/) || [])[1] / 2}pt)`);
  const tiny = await consentOf('상담1', { CENTER:'평택센터' });
  ok(/<w:sz w:val="36"\/>/.test(titleXml(xmlOf(tiny.b64))) && !/<w:br\/>/.test(titleXml(xmlOf(tiny.b64))), '짧은 센터명: 원래 크기(18pt) 한 줄');
  const nShort = blanks(sx);
  ok(/<w:br\/><w:t xml:space="preserve">근로조건\/급여테이블 변경/.test(titleXml(xmlOf(c.b64))), '긴 센터명: 줄바꿈 뒤 둘째 줄이 "근로조건…"으로 시작');
  const nLong = blanks(xmlOf(c.b64));
  ok(nLong < nShort, `제목이 두 줄이면 아래 빈 줄을 줄임 (빈 줄 ${nShort} → ${nLong})`);

  console.log('3. 주 근로시간 변경(25 → 20시간) → 근로조건 줄 표시, 기본급 시급 역산');
  await load(`
    const row = p.before.findIndex(r => r && r[0] === '상담사' && /근무일|주 5일/.test(String(r[2])));
    p.before[row][2] = '주 5일(월~금), 25시간(일 5H)';
    const r2 = p.values.findIndex(r => r && r[0] === '상담사' && /주 5일/.test(String(r[2])));
    p.values[r2][2] = '주 5일(월~금), 20시간(일 4H)'; p.values[r2][4] = '09:00 ~ 13:00';
  `); await waitParsed();
  c = await consentOf('상담2', { BRIEF:'2025년 12월 15일', CHANGE:'2026년 최저임금 인상 반영', EFF:'2026. 01. 01.' });
  ok(c.vals.WORK === '주 25시간 근무에서 주 20시간 근무로 변경', `근로조건: ${c.vals.WORK}`);
  ok(c.vals.WORKT_B === '일5H/주5일/주 25시간' && c.vals.WORKT_A === '일4H/주5일/주 20시간', `근무시간 ${c.vals.WORKT_B} → ${c.vals.WORKT_A}`);
  ok(c.vals.BASIC_B1 === `시급 ${Math.round(2156880 / 130).toLocaleString('ko-KR')}원 기준 산정` && c.vals.BASIC_B2 === '  - 일 5시간 기준 2,156,880원', `기존 기본급: ${c.vals.BASIC_B1} / ${c.vals.BASIC_B2.trim()}`);
  t = docText(c.b64);
  ok(/○ 근로조건 : 주 25시간 근무에서 주 20시간 근무로 변경\n/.test(t), 'Word 근로조건 줄');
  ok(/2025년 12월 15일 실시된/.test(t) && /급여테이블 변경 : 2026년 최저임금 인상 반영/.test(t) && /시행일 : 2026\. 01\. 01\./.test(t), '지금 입력: 설명회 일자·주요 변경사항·시행일 반영');

  console.log('4. 신규 센터(변경전 시트 없음) → 동의서 없이 조견표 ZIP만');
  await load(`delete p.before;`); await waitParsed();
  ok(await p.evaluate(async () => (await window.__v2consent.prepare()) === null), '신규 센터는 동의서 대상 아님');
  ok(await p.isHidden('#v2Consent'), '입력 창이 뜨지 않음');

  console.log('5. 신규 호봉은 제외 · 입력 창 [나중에 직접 작성]');
  await load(`p.before[33][6] = '상담9';`); await waitParsed();
  await p.evaluate(() => { selectedJobs = new Set(parsedData.jobs.map((j, i) => i)); });
  const pr = p.evaluate(() => window.__v2consent.prepare().then(r => r && { n: r.files.length, fresh: r.meta.fresh, mode: r.meta.mode, brief: r.meta.brief, names: r.files.map(f => f.name) }));
  await p.waitForSelector('#v2Consent:not([hidden])');
  ok(/신규 호봉 1개\(상담 · 상담3\)/.test(await p.textContent('#v2ConInfo')), await p.textContent('#v2ConInfo'));
  await p.check('input[name="v2ConMode"][value="later"]');
  ok(await p.isHidden('#v2ConNow'), '나중에 작성: 입력칸 숨김');
  await p.click('[data-con="ok"]');
  const r = await pr;
  ok(r && r.n === 6 && r.fresh.length === 1 && r.mode === 'later' && r.brief === '', `동의서 ${r && r.n}개 · 제외 ${r && r.fresh.join(',')} · ${r && r.mode}`);
  ok(r && new Set(r.names).size === r.n && r.names.every(n => /^변경동의서_가상시_민원상담콜센터_.+\.docx$/.test(n)), r && r.names.join(' '));
  await p.evaluate(() => window.__v2consent.log({ meta:{ center:'가상시 민원상담콜센터', count:6, jobs:[], fresh:['상담 · 상담3'], eff:'2026. 01. 01.', mode:'later', brief:'', change:'' } }, 'x.zip'));
  await p.click('#tabBtnHistory'); await p.waitForTimeout(400);
  ok(/가상시 민원상담콜센터/.test(await p.textContent('#v2ConLogBody')) && /나중에 작성/.test(await p.textContent('#v2ConLogBody')), '처리 이력 › 변경동의서 생성 기록');

  console.log('6. 실제와 비슷한 더미(평택, 호봉 17개) 엑셀을 화면에서 올려 조견표 + 변경동의서 ZIP');
  const PT_XLSX = fs.readFileSync(path.join(ROOT, 'samples', '더미_평택_급여테이블.xlsx')).toString('base64');
  await p.click('.app-tab[data-tab="create"]');
  await p.evaluate(b64 => {
    const bin = atob(b64), u = new Uint8Array(bin.length); for(let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const dt = new DataTransfer(); dt.items.add(new File([u], '더미_평택_급여테이블.xlsx')); const inp = document.getElementById('fileInput');
    inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles:true }));
  }, PT_XLSX);
  await p.waitForFunction(() => typeof parsedData !== 'undefined' && parsedData && parsedData.centerName === '평택고객센터' && window.__v2.comparePrev, null, { timeout: 30000 });
  ok(await p.evaluate(() => parsedData.jobs.length) === 17, `호봉 ${await p.evaluate(() => parsedData.jobs.length)}개 읽음`);
  if(await p.isVisible('#v2Next [data-n="ackall"]')) await p.click('#v2Next [data-n="ackall"]');
  await p.evaluate(() => { selectedJobs = new Set(parsedData.jobs.map((j, i) => i)); });
  await p.click('#v2Next [data-n="gen"]');
  await p.waitForSelector('#v2Next [data-n="zip"]');
  const dl2 = p.waitForEvent('download', { timeout: 180000 });
  await p.click('#v2Next [data-n="zip"]');
  await p.waitForSelector('#v2Consent:not([hidden])');
  ok(await p.inputValue('#v2ConEff') === '2026. 01. 01.' && await p.inputValue('#v2ConChange') === '2026년 최저임금 인상 및 단축상담 근무시간 조정', '시행일·주요 변경사항(요청사유) 자동 채움');
  ok(/16개/.test(await p.textContent('#v2ConInfo')) && /채팅상담 · 사원/.test(await p.textContent('#v2ConInfo')), '동의서 16개 · 신규 호봉(채팅상담) 제외 안내');
  await p.fill('#v2ConBrief', '2025-12-15');
  if(process.env.CONSENT_SHOT) await p.locator('#v2Consent .v2-card').screenshot({ path: process.env.CONSENT_SHOT });
  await p.click('[data-con="ok"]');
  const zip2 = await (await dl2).path();
  const names2 = require('child_process').execFileSync('python3', ['-I', '-c', 'import sys,zipfile; print("\\n".join(zipfile.ZipFile(sys.argv[1]).namelist()))', zip2]).toString().trim().split('\n');
  ok(names2.filter(n => /\.png$/.test(n)).length === 17 && names2.filter(n => /^변경동의서\/.+\.docx$/.test(n)).length === 16, `ZIP: 조견표 PNG ${names2.filter(n => /\.png$/.test(n)).length}장 + 변경동의서 ${names2.filter(n => /\.docx$/.test(n)).length}개`);
  if(process.env.CONSENT_OUT) fs.copyFileSync(zip2, process.env.CONSENT_OUT);
  const workLines = require('child_process').execFileSync('python3', ['-I', '-c', `
import sys, zipfile, io, re
z = zipfile.ZipFile(sys.argv[1])
for n in sorted(z.namelist()):
    if not n.endswith('.docx'): continue
    x = zipfile.ZipFile(io.BytesIO(z.read(n))).read('word/document.xml').decode()
    t = [''.join(re.findall(r'<w:t[^>]*>([^<]*)</w:t>', p)) for p in re.findall(r'<w:p[ >].*?</w:p>', x, re.S)]
    print(n.split('_', 2)[-1] + '=' + next((s for s in t if s.startswith('○ 근로조건')), '-'))`, zip2]).toString().trim().split('\n');
  const withWork = workLines.filter(l => !l.endsWith('=-'));
  ok(withWork.length === 1 && /단축상담_사원/.test(withWork[0]) && /주 25시간 근무에서 주 20시간 근무로 변경/.test(withWork[0]), `근로조건 줄은 단축상담 · 사원만 (${withWork.join(' / ')})`);

  console.log('7. 지난 접속의 [SharePoint에 바로 올리기] 대기(22시간 전)는 다시 열 때 실패로 띄우지 않고 닫음');
  await p.evaluate(() => window.__v2.kvSet('pending', { requestId:'', file:'SharePoint에 올린 파일', base:'', web:true, any:true, startedAt: Date.now() - 22 * 3600000 }));
  await p.waitForTimeout(300);
  await p.reload(); await p.waitForSelector('#v2Toast:not([hidden])', { timeout: 10000 });
  ok(/업로드 대기\(22시간 전\)를 닫았습니다/.test(await p.textContent('#v2Toast')), await p.textContent('#v2Toast'));
  ok(await p.evaluate(async () => (await window.__v2.kvGet('pending')) === null) && !(await p.isVisible('#v2Retry')), '대기 기록 삭제 · 실패 화면 없음');

  console.log('8. [기준정보 › SharePoint 주소] 입력 → 빌드 없이 웹 업로드·바로가기 사용 (가상 주소)');
  ok(await p.evaluate(() => window.__v2.uploadMode()) === 'paste', '주소가 없으면 붙여넣기 방식');
  await p.click('.app-tab[data-tab="settings"]');
  ok(/입력 안 됨/.test(await p.textContent('#v2SpState')), await p.textContent('#v2SpState'));
  await p.fill('#v2SpFolder', 'javascript:alert(1)'); await p.click('#v2SpSave');
  ok(/https:\/\//.test(await p.textContent('#v2SpMsg')), 'https가 아닌 주소는 저장 안 함');
  await p.fill('#v2SpFolder', 'https://dummy.sharepoint.com/sites/paysys/Shared%20Documents/Forms/AllItems.aspx?id=%2Fsites%2Fpaysys%2FShared%20Documents%2F%EA%B8%89%EC%97%AC%EC%A1%B0%EA%B2%AC%ED%91%9C&viewid=abc');
  await p.fill('#v2SpFlow', 'https://make.powerautomate.com/environments/Default-123/flows/abc-456/details');
  await p.click('#v2SpSave');
  const L = await p.evaluate(() => Object.assign({}, window.V2_CONFIG.links));
  ok(decodeURIComponent(L.folder) === 'https://dummy.sharepoint.com/sites/paysys/Shared Documents/급여조견표', '폴더 주소(AllItems 형태 → 폴더 경로): ' + decodeURIComponent(L.folder));
  ok(decodeURIComponent(L.upload) === 'https://dummy.sharepoint.com/sites/paysys/Shared Documents/급여원본' && decodeURIComponent(L.archive).endsWith('/급여보관'), '업로드·보관 폴더 주소 자동 계산: ' + decodeURIComponent(L.upload));
  ok(L.flowRuns === 'https://make.powerautomate.com/environments/Default-123/flows/abc-456/details', '흐름 실행 기록 주소');
  ok(await p.evaluate(() => window.__v2.uploadMode()) === 'web' && (await p.$$('#v2Links .v2-linkcard')).length >= 8, '웹 업로드 방식으로 전환 · 바로가기 표시');
  await p.reload(); await p.waitForTimeout(1500);
  await p.click('.app-tab[data-tab="create"]');
  ok(await p.isVisible('#v2WebGo') && decodeURIComponent(await p.getAttribute('#v2WebGo', 'href')).endsWith('/급여원본'), '다시 열어도 유지: [SharePoint에 바로 올리기] 버튼이 업로드 폴더로 연결');

  ok(errs.length === 0, `스크립트 오류 ${errs.length}건 ${errs.join(' / ')}`);
  console.log(failed ? `\n실패 ${failed}건` : '\n모두 통과');
  await b.close(); srv.close(); process.exit(failed ? 1 : 0);
})();

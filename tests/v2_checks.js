/* v2.4 검사·비교·진행 막대 시험 (가상 실양식 파일만 사용)
 *   node tests/v2_checks.js
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
    const bin = atob(b64), u = new Uint8Array(bin.length); for(let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const wb = XLSX.read(u, { type:'array', cellFormula:true });
    const grid = n => { const ws = wb.Sheets[n], rg = XLSX.utils.decode_range(ws['!ref']);
      const values = XLSX.utils.sheet_to_json(ws, { header:1, defval:'', raw:true }), formulas = [];
      for(let r = rg.s.r; r <= rg.e.r; r++){ const row = []; for(let c = rg.s.c; c <= rg.e.c; c++){ const x = ws[XLSX.utils.encode_cell({ r, c })]; row.push(x && x.f ? '=' + x.f : ''); } formulas.push(row); }
      return { values, formulas }; };
    const cur = grid('급여테이블(변경후)'), prev = grid('급여테이블(변경전)');
    const payload = { v:2, kind:'PAYTABLE', sheet:'급여테이블(변경후)', file:'시험.xlsx', start:'A1', values: cur.values, formulas: cur.formulas, before: prev.values };
    if(mutate) (new Function('p', mutate))(payload);
    handleLinkedJsonFile(new File([JSON.stringify(payload)], '시험.json'));
  }, [FIXTURE, mutate || '']);
  const issues = () => p.evaluate(() => checkState.issues.map(i => `${i.level}:${i.key}`));
  const waitParsed = () => p.waitForFunction(() => document.getElementById('fileMeta').textContent.includes('자동연동') && checkState && checkState.issues);

  console.log('1. 깨끗한 실양식: 월총액(B등급 포함)·초과근무 비고 자동');
  await load(); await waitParsed();
  let is = await issues();
  ok(!is.some(k => k.includes(':total:')), '월총액 검사 통과 (B등급 업적수당 포함) · ' + is.join(', '));
  const ot = await p.evaluate(() => parsedData.jobs.map(j => j._otAuto ? j._otAuto.text + '/' + j._otAuto.src : '-'));
  ok(ot.filter(x => x === '2H/수식').length === 3 && ot.filter(x => x === '5H/수식').length === 3, '초과근무 시간을 수식에서 산출: ' + ot.join(' '));
  ok(!is.some(k => k.includes(':ot:')), '초과근무 비고 확인 항목 없음');
  ok(!is.some(k => k.includes('fx-')), '수식 검사: 이상 없음');
  ok(await p.$eval('#v2Compare details', d => !d.open), '변경전 비교는 접힌 상태로 표시');

  console.log('2. 수식 이상 심기: 숫자 직접 입력 / 다른 수식 / GAP 행 누락');
  await load(`
    const F = p.formulas; F[50][5] = ''; p.values[50][5] = 2400000;            /* 51행 F열 월 보수 합계 → 숫자 */
    F[55][4] = '=E52*12';                                                      /* 56행 E열 연간 → 다른 행 참조 */
    for(let c = 3; c < 18; c++){ F[60][c] = ''; p.values[60][c] = ''; }       /* 61행 GAP 전체 비움 */
  `);
  await waitParsed();
  is = await issues();
  ok(is.includes('confirm:fx-hard:51'), '숫자 직접 입력 감지 (51행)');
  ok(is.includes('confirm:fx-diff:56'), '다른 수식 감지 (56행)');
  ok(is.includes('confirm:fx-miss:61'), '수식 누락 감지 (61행 GAP)');

  console.log('3. 변경전 비교: 신규·폐지·세분화');
  await load(`
    p.before[33][4] = '상담';      /* 변경전 '상담1' → '상담' : 변경후 '상담1'은 세분화로 짝 */
    p.before[33][6] = '상담9';     /* 변경전 '상담3' → '상담9' : 변경후 '상담3'은 신규, '상담9'는 폐지·통합 */
  `);
  await waitParsed();
  const tags = await p.$$eval('#v2Compare tbody tr', trs => trs.map(t => t.cells[0].textContent.trim() + ':' + t.cells[1].textContent.trim()));
  ok(tags.some(t => /상담1:세분화/.test(t)) && tags.some(t => /상담3:신규/.test(t)) && tags.some(t => /상담9:폐지/.test(t)), tags.join(' | '));
  await p.evaluate(() => handleLinkedJsonFile(new File([JSON.stringify({ v:2, kind:'PAYTABLE', sheet:'급여테이블(변경후)', file:'x', start:'A1', values: [[]] })], 'x.json')));

  console.log('4. 모두 확인함 → 조견표 생성 → ZIP → 통계 저장 (하단 막대)');
  await load(`p.formulas[50][5] = ''; p.values[50][5] = 2400000;`);
  await waitParsed();
  ok(await p.isVisible('.v2-ackall'), '[확인 항목 n개 모두 확인함] 버튼');
  await p.click('#v2Next [data-n="ackall"]');
  ok(await p.evaluate(() => checkGateOpen()), '일괄 확인 후 생성 가능');
  await p.click('#v2Next [data-n="gen"]');
  await p.waitForSelector('#v2Next [data-n="zip"]');
  const dl = p.waitForEvent('download', { timeout: 120000 });
  await p.click('#v2Next [data-n="zip"]');
  const d = await dl;
  // 시험용 Chromium(headless)은 한글 파일명을 'download'로 바꿔 보고함 → 다운로드가 일어났는지와 크기만 확인
  const size = fs.statSync(await d.path()).size;
  ok(size > 10000, `ZIP 다운로드 (${Math.round(size / 1024)}KB, 화면 멈춤 없이 진행률 표시)`);
  await p.waitForSelector('#v2Next [data-n="snap"]');
  ok(true, '다음 단계: 통계에 저장 안내');
  await p.click('#v2Next [data-n="snap"]');
  await p.click('#snapSaveBtn'); await p.waitForTimeout(300);
  await p.waitForSelector('#v2Next [data-n="stats"]');
  ok(true, '완료 단계: 통계 보기·보고서·다른 파일 올리기');

  console.log('5. 통계: 실제 양식 월 보수 합계(B등급) 기준 · 새 통계 화면');
  const snap = await p.evaluate(() => SNAPS.at(-1));
  const j0 = snap.jobs[0];
  ok(j0.perf > 0 && j0.perf < j0.stdPaySum && j0.compareMonthly === j0.monthlyTotal, `비교 금액 = 월 보수 합계 (업적수당 ${j0.perf}, 합계 ${j0.monthlyTotal})`);
  ok(Math.abs(j0.hourly - j0.monthlyTotal / j0.hours) < 0.01, '시급 = 월 보수 합계 ÷ 소정시간');
  ok(snap.jobs.every(j => j.wHours > 0), '직무별 소정시간 저장: ' + snap.jobs.map(j => j.wHours).join(','));
  await p.click('#v2Next [data-n="stats"]');
  await p.waitForSelector('#sGrid .s-ic');
  const big = await p.$eval('#sGrid .s-ic.tot big', e => e.textContent);
  ok(big !== '–', `새 통계 화면 표시 (전체 평균 ${big}만원)`);
  await p.click('#sTabs [data-t="list"]');
  ok((await p.$$('#sList tbody .s-cname')).length === 1, '센터 목록 1곳');
  await p.click('#sOld'); ok(await p.isVisible('#statsBody') || await p.isVisible('#statsEmpty'), '[이전 화면]으로 원래 통계 화면');
  await p.click('#v2StBack button'); ok(await p.isVisible('#sApp'), '[새 통계 화면으로 보기]로 복귀');
  if(process.env.SHOTS) await p.screenshot({ path: path.join(process.env.SHOTS, 'v24_done.png') });
  ok(errs.length === 0, `스크립트 오류 ${errs.length}건 ${errs.join(' / ')}`);
  await b.close(); srv.close();
  console.log(failed ? `\n실패 ${failed}건` : '\n모두 통과');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

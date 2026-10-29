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
  ok(Math.abs(j0.hourly - (j0.stdPaySum + j0.perf) / j0.wHours) < 0.01, `시급 = (소계 + 업적수당) ÷ 수식 시간수 (${Math.round(j0.hourly).toLocaleString()}원)`);
  ok(snap.jobs.every(j => j.wHours > 0), '직무별 소정시간 저장: ' + snap.jobs.map(j => j.wHours).join(','));
  await p.click('#v2Next [data-n="stats"]');
  await p.waitForSelector('#sGrid .s-ic');
  const big = await p.$eval('#sGrid .s-ic.tot big', e => e.textContent);
  ok(big !== '–', `새 통계 화면 표시 (전체 평균 ${big}만원)`);
  await p.click('#sTabs [data-t="list"]');
  ok((await p.$$('#sList tbody .s-cname')).length === 1, '센터 목록 1곳');
  await p.click('#sOld'); ok(await p.isVisible('#statsBody') || await p.isVisible('#statsEmpty'), '[이전 화면]으로 원래 통계 화면');
  await p.click('#v2StBack button'); ok(await p.isVisible('#sApp'), '[새 통계 화면으로 보기]로 복귀');

  console.log('6. 견적 대비 직접인건비: 통계 저장 · 견적 대비 탭 · 센터 메모');
  ok(snap.quote && Math.round(snap.quote.received) === 58122400, `저장된 받는 직접인건비 = 월 보수 가용 범위 (${snap.quote && Math.round(snap.quote.received)})`);
  ok(snap.jobs.every(j => j.heads > 0), '직무별 인원 저장(견적대비 비교 시트): ' + snap.jobs.map(j => j.heads).join(','));
  await p.click('#sTabs [data-t="quote"]');
  const qrow = await p.$$eval('#sQuote tbody tr', trs => trs.map(t => t.textContent));
  ok(qrow.length === 1 && /초과/.test(qrow[0]), '견적 대비 탭: 센터 1곳 · 초과 판정');
  await p.click('#sQuote [data-memo]');
  ok(await p.isVisible('#sMemo'), '메모 창 열림');
  await p.fill('#sMemoText', '재계약 단가 인상 전 선반영(시험)'); await p.click('#sMemoSave'); await p.waitForTimeout(200);
  ok((await p.textContent('#sMemoList')).includes('선반영(시험)'), '메모 저장·이력 표시');
  await p.click('#sMemoClose');
  ok((await p.textContent('#sQuote tbody')).includes('선반영'), '목록에 최근 메모 표시');

  console.log('7. 견적 대비 카드: 엑셀 계산과 일치 · B등급 없음은 직접 입력');
  await p.evaluate(() => switchAppTab('create'));
  await load(); await waitParsed(); await p.waitForSelector('#v2Quote:not([hidden]) .v2-qkpi');
  let R = await p.evaluate(() => window.__v2quote.result);
  ok(Math.round(R.received) === 58122400 && Math.round(R.paid) === 58860090, `받는 ${Math.round(R.received)} · 급여설계 ${Math.round(R.paid)} (엑셀 시트와 같은 값)`);
  ok(Math.abs(R.rate - 1.27) < 0.01 && (await p.textContent('#v2QBody')).includes('일치'), `초과율 +${R.rate.toFixed(2)}% · 엑셀 '견적대비 비교'와 일치`);
  await load(`p.extra = p.extra.filter(s => s.name === '견적서'); p.values[43][4] = 0;`);   /* 비교 시트 없음 + 상담1 B등급 0원 */
  await waitParsed(); await p.waitForTimeout(200);
  R = await p.evaluate(() => window.__v2quote.result);
  ok(Math.round(R.received) === 59920000, `비교 시트 없으면 견적서 직접인건비 소계 × 인원 (${Math.round(R.received)})`);
  ok(await p.isVisible('#v2QBody input[data-qp="상담1"]') && R.missing.length === 7, `B등급 0원 직무는 업적수당 입력칸 · 인원 입력 필요 ${R.missing.length}개`);
  const hs = { '수습':3, '상담1':8, '상담2':6, '상담3':3, '팀장':2, '강사':1, '센터장':1 };
  for(const [k, v] of Object.entries(hs)){ await p.fill(`#v2QBody input[data-qh="${k}"]`, String(v)); await p.press(`#v2QBody input[data-qh="${k}"]`, 'Tab'); }
  await p.fill('#v2QBody input[data-qp="상담1"]', '50000'); await p.press('#v2QBody input[data-qp="상담1"]', 'Tab');
  R = await p.evaluate(() => window.__v2quote.result);
  const c1 = R.jobs.find(x => x.key === '상담1');
  ok(R.missing.length === 0 && c1.perfTotal === 400000 && c1.src === '직접 입력', `입력 반영: 상담1 업적수당 50,000 × 8명 = ${c1.perfTotal}`);
  if(process.env.SHOTS) await p.screenshot({ path: path.join(process.env.SHOTS, 'v24_done.png') });

  console.log('6. 보고서: 정원·연간 인건비(정원기준)로 계약금액 변화 · 2쪽 · Word');
  const s2 = await p.evaluate(() => SNAPS.at(-1));
  ok(s2.jobs.every(j => typeof j.annualCost === 'number' && typeof j.heads === 'number') && s2.jobs.filter(j => j.heads > 0).length >= 6, '정원·연간 인건비 읽기: ' + s2.jobs.map(j => `${j.heads}명/${Math.round(j.annualCost / 10000)}만`).join(', '));
  await p.evaluate(() => switchAppTab('report'));
  await p.waitForSelector('#reportDoc .page');
  ok((await p.$$('#reportDoc .page')).length === 2, '보고서 2쪽');
  const D = s2.jobs.reduce((a, j) => a + (j.annualCost > 0 || !j.heads ? j.annualCost : j.monthlyTotal * 12 * j.heads), 0);
  await p.fill('#repLabor', '5'); await p.dispatchEvent('#repLabor', 'change');
  /* 견적서가 없는 센터의 계산(정원 기준 직접인건비 + 입력한 법정부담·관리비·경비)을 먼저 확인 → 끝나면 견적서 복원 */
  await p.evaluate(() => { const s = SNAPS.at(-1); window.__est = s.estimate; delete s.estimate; renderReport(); });
  await p.fill('#repMgmt', '10'); await p.dispatchEvent('#repMgmt', 'change');
  await p.fill('#repFixed', '0'); await p.dispatchEvent('#repFixed', 'change');
  let A = await p.evaluate(() => { const a = window.__v2report.analyze(); return { D:a.now.D, T:a.now.T, T2:a.next.T, rate:a.rate }; });
  const T = D * (1 + 0.185) * 1.10;
  A.rate = await p.evaluate(() => { const a = window.__v2report.analyze(); return a.next.T / a.now.T - 1; });
  ok(Math.abs(A.D - D) < 1 && Math.abs(A.T - T) < 1 && Math.abs(A.rate - 0.05) < 1e-9, `(견적서 없을 때) 경비 0: 계약금액 ${Math.round(A.T).toLocaleString()} → ${Math.round(A.T2).toLocaleString()} (단가 ${(A.rate * 100).toFixed(2)}%)`);
  await p.fill('#repFixed', '1000'); await p.dispatchEvent('#repFixed', 'change');
  A = await p.evaluate(() => { const a = window.__v2report.analyze(); return { T:a.now.T, T2:a.next.T, rate:a.next.T / a.now.T - 1 }; });
  const expRate = (T * 0.05) / (T + 1e7);
  ok(Math.abs(A.rate - expRate) < 1e-9 && A.rate < 0.05, `(견적서 없을 때) 고정 경비 1,000만: 단가 ${(A.rate * 100).toFixed(2)}% · 증가 ${Math.round(A.T2 - A.T).toLocaleString()}원`);
  /* 견적서 기준: 직접인건비 5% → 간접인건비 비례, 경비 그대로, 관리비·이윤·부가세 비례 */
  await p.evaluate(() => { SNAPS.at(-1).estimate = window.__est; renderReport(); });
  const E = await p.evaluate(() => { const a = window.__v2report.analyze(); return a.est ? { T:a.est.all.now.T, T2:a.est.all.next.T, rate:a.est.all.rate, sheetT:a.est.all.sheetT, role:a.est.role && a.est.role.name, hidden: document.getElementById('repMgmt').closest('label').hidden } : null; });
  const eD = 59920000, eL = 11198056, eF = 720000, eM = 3591893, eP = 3771489, eV = 7920138, eT = eD + eL + eF + eM + eP + eV;
  const b1 = eD * 1.05 + eL * 1.05 + eF, M2 = eM * b1 / (eD + eL + eF), b2 = b1 + M2, P2 = eP * b2 / (eD + eL + eF + eM), sb2 = b2 + P2, eT2 = sb2 + eV * sb2 / (eD + eL + eF + eM + eP);
  ok(E && Math.abs(E.T - eT) < 1 && E.sheetT === eT && Math.abs(E.T2 - eT2) < 1 && E.hidden,
    `견적서 기준: 월 ${E && Math.round(E.T).toLocaleString()} → ${E && Math.round(E.T2).toLocaleString()} (단가 ${E && (E.rate * 100).toFixed(2)}%, 연 +${E && Math.round((E.T2 - E.T) * 12).toLocaleString()}원, ${E && E.role} 1인)`);
  const p1 = await p.$eval('#reportDoc .page', e => e.innerText);
  ok(p1.includes(s2.center) && !p1.includes('우리 센터') && /연 \+[\d,]+원/.test(p1) && p1.includes('견적서 기준'), '1쪽: 센터명 표기 · 견적서 기준 금액 변화 · 연 증가액');
  const RK = await p.evaluate(() => { const a = window.__v2report.analyze(), s = a.snap, exp = s.jobs.reduce((t, j) => { const base = (j.items || {})['기본급'] || 0, h = window.__v2pay(j).hours, hd = typeof j.heads === 'number' ? j.heads : 0;
    return t + (base && hd > 0 ? Math.max(0, a.mwNext * h - base) * hd : 0); }, 0);
    const pg = document.querySelector('#reportDoc .page'); return { tot:a.riskTot, exp, txt: pg.innerText.includes('인상하지 않으면'), dashed: pg.querySelectorAll('svg line[stroke-dasharray="4 3"]').length, h: pg.scrollHeight }; });
  ok(Math.abs(RK.tot - RK.exp) < 1 && RK.tot > 0 && RK.txt, `1쪽 ①: 인상하지 않으면 내년 최저임금 미달 월 ${Math.round(RK.tot).toLocaleString()}원`);
  ok(RK.dashed === 1, '1쪽 ②: 비교 차트에 인상 후 위치(점선)');
  ok(RK.h <= 1124, `1쪽이 A4 한 장 안 (${RK.h}px)`);
  const w = await p.evaluate(async () => { const r = await window.__v2report.buildWord(); return { parts:r.parts.length, head:r.mht.slice(0, 17), pb:/page-break-before:always/.test(r.html) }; });
  ok(w.head === 'MIME-Version: 1.0' && w.parts >= 1 && w.pb, `Word(MHTML) 저장: 차트 ${w.parts}개 · 쪽 나눔`);
  if(process.env.SHOTS){ const pg = await p.$$('#reportDoc .page'); await pg[0].screenshot({ path: path.join(process.env.SHOTS, 'report_p1.png') }); await pg[1].screenshot({ path: path.join(process.env.SHOTS, 'report_p2.png') });
    fs.writeFileSync(path.join(process.env.SHOTS, 'report.doc'), await p.evaluate(async () => (await window.__v2report.buildWord()).mht)); }
  ok(errs.length === 0, `스크립트 오류 ${errs.length}건 ${errs.join(' / ')}`);
  await b.close(); srv.close();
  console.log(failed ? `\n실패 ${failed}건` : '\n모두 통과');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

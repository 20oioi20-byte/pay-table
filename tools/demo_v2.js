/* ============================================================
   v2 시연본 전용 (dist/급여조견표_관리시스템_v2_시연.html 에만 들어감)
   - 저장소: paytable-system-v2-demo (실제 시스템과 섞이지 않음)
   - 가상 센터 60곳 × 2024~2026 급여 데이터·견적 대비·센터 메모·채용시장 표본을 미리 채움
   - 오른쪽 아래 시연 안내: [다음]을 누를 때마다 실제 화면을 순서대로 조작·강조
   ============================================================ */
(() => {
  const $ = id => document.getElementById(id);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const waitFor = async (fn, ms = 8000) => { const t0 = Date.now(); while(Date.now() - t0 < ms){ try{ if(fn()) return true; }catch(e){} await wait(100); } return false; };
  const V2X = () => window.__v2 || {};
  const DEMO_CENTER = '가상시 민원상담콜센터';

  document.head.insertAdjacentHTML('beforeend', `<style>
    .demo-hl{ outline:3px solid #FE2E36 !important; outline-offset:4px; border-radius:10px; animation:demoPulse 1.1s ease-in-out 3; }
    @keyframes demoPulse{ 50%{ outline-color:rgba(254,46,54,.25); } }
    .demo-tour{ position:fixed; right:20px; bottom:20px; z-index:80; width:380px; max-width:calc(100vw - 32px); background:#000; color:#fff; border-radius:14px; box-shadow:0 18px 50px rgba(0,0,0,.35); font-size:13px; line-height:1.6; }
    .demo-tour .dh{ display:flex; align-items:center; gap:8px; padding:12px 16px 0; }
    .demo-tour .dh b{ background:#FE2E36; border-radius:999px; padding:1px 9px; font-size:11.5px; }
    .demo-tour .dh span{ color:#A2A4A3; font-size:12px; }
    .demo-tour .dh button{ margin-left:auto; border:0; background:none; color:#A2A4A3; cursor:pointer; font:inherit; font-size:12px; }
    .demo-tour h4{ margin:6px 16px 2px; font-size:15.5px; }
    .demo-tour p{ margin:0 16px; color:#E4E4E4; }
    .demo-tour .dbar{ height:3px; background:#2B2B2D; margin:12px 16px 0; border-radius:2px; overflow:hidden; } .demo-tour .dbar i{ display:block; height:100%; background:#FE2E36; transition:width .3s; }
    .demo-tour .dbtn{ display:flex; gap:8px; padding:12px 16px 14px; align-items:center; }
    .demo-tour .dbtn button{ border:1px solid #4C4C4E; background:#141414; color:#fff; border-radius:8px; padding:8px 14px; font:inherit; font-weight:700; cursor:pointer; }
    .demo-tour .dbtn button.go{ margin-left:auto; background:#FE2E36; border-color:#FE2E36; }
    .demo-tour .dbtn button:disabled{ opacity:.4; cursor:default; }
    .demo-tour .dreset{ color:#A2A4A3; font-size:11.5px; text-decoration:underline; background:none !important; border:0 !important; padding:0 !important; font-weight:400 !important; }
    .demo-tour.min p, .demo-tour.min h4, .demo-tour.min .dbar{ display:none; }
    .demo-ribbon{ position:fixed; left:50%; top:8px; transform:translateX(-50%); z-index:79; background:#FE2E36; color:#fff; font-size:12px; font-weight:700; padding:3px 12px; border-radius:999px; pointer-events:none; }
  </style>`);
  document.body.insertAdjacentHTML('beforeend', `<div class="demo-ribbon">시연용 · 모든 센터·금액은 가상 데이터</div>
    <div class="demo-tour" id="demoTour" role="dialog" aria-label="시연 안내">
      <div class="dh"><b>시연</b><span id="demoNo">준비 중</span><button type="button" id="demoMin">접기</button></div>
      <h4 id="demoT">가상 데이터를 준비하고 있습니다…</h4><p id="demoD">잠시만 기다려 주세요.</p>
      <div class="dbar"><i id="demoBar" style="width:0"></i></div>
      <div class="dbtn"><button type="button" id="demoPrev">◀ 이전</button><button type="button" class="dreset" id="demoReset">처음부터 다시(데이터 초기화)</button><button type="button" class="go" id="demoNext" disabled>시작 ▶</button></div>
    </div>`);

  /* ---------- 가상 데이터 ---------- */
  let seed = 20261030;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = (a, w) => { let r = rnd() * w.reduce((s, x) => s + x, 0); for(let i = 0; i < a.length; i++){ if((r -= w[i]) < 0) return a[i]; } return a[0]; };
  const MW = { 2024:9860, 2025:10030, 2026:10320 };
  const IND = { '공공':{ k:0.98, n:14, subs:['중앙부처', '지자체', '공공기관'] }, '금융':{ k:1.07, n:16, subs:['보험', '은행', '카드', '증권'] },
    '통신':{ k:1.04, n:9, subs:['이동통신', '유선·인터넷', '알뜰폰'] }, '유통':{ k:0.98, n:12, subs:['이커머스', '홈쇼핑', '대형마트·백화점'] }, '기타':{ k:1.00, n:9, subs:['가전·전자', '자동차', '여행·레저'] } };
  const REG = ['서울', '경기', '인천', '부산', '대구', '광주', '대전', '울산', '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
  const REG_W = [24, 20, 6, 8, 5, 4, 6, 2, 1, 3, 3, 4, 3, 2, 3, 5, 2];
  /* 직무: [이름, 블록, 상담유형, 직책, 직무, 근속, B등급 업적수당, 초과 시간, 인원 범위] */
  const JOBS = [['수습', '상담', '신입상담사', 0, 0, 0, 40000, 0, [1, 4]], ['상담1', '상담', '상담사', 0, 30000, 0, 60000, 2, [6, 18]],
    ['상담2', '상담', '상담사', 0, 50000, 20000, 70000, 2, [4, 12]], ['상담3', '상담', '상담사', 0, 70000, 40000, 80000, 2, [2, 8]],
    ['팀장', '리더그룹', '관리자', 200000, 150000, 50000, 100000, 5, [1, 4]], ['강사', '리더그룹', '관리자', 150000, 100000, 30000, 80000, 5, [0, 2]],
    ['센터장', '리더그룹', '관리자', 400000, 300000, 80000, 150000, 0, [1, 1]]];
  const r10 = v => Math.ceil(v / 10) * 10, r1k = v => Math.round(v / 1000) * 1000;
  function mkJobs(y, k, hours, heads){
    return JOBS.map(([name, block, lt, pos, duty, ten, perf, otH], i) => {
      const hrs = block === '상담' ? hours : 209, base = Math.round(MW[y] * hrs);
      const prem = r1k((k - 1) * 1500000 * (block === '상담' ? 1 : 1.6));
      const items = { '기본급':base, '직책수당':pos, '직무수당':Math.max(0, duty + prem), '근속수당':ten, '급식비':100000, '통근비':0 };
      const std = Object.values(items).reduce((a, b) => a + b, 0), p = r1k(perf * k), ot = otH ? r10(std / 209 * 1.5 * otH) : 0, tot = std + p + ot;
      return { name, block, laborType:lt, items, stdPaySum:std, overtime:ot, night:0, telecom:0, monthlyTotal:tot, gradeB:p, perf:p, compareMonthly:tot,
        hours:hrs, wHours:hrs, fixedPay:std, hourly:(std + p) / hrs, heads:heads[i], annualCost:tot * 12 * heads[i] };
    });
  }
  function mkQuote(jobs, r){
    const js = jobs.map(j => ({ job:`${j.block === '상담' ? '상담' : j.block === '리더그룹' ? 'Staff' : ''} · ${j.name}`, heads:j.heads, base1:j.stdPaySum + j.overtime, perfTotal:j.perf * j.heads, src:'등급별 인원', total:(j.stdPaySum + j.overtime + j.perf) * j.heads }));
    const paid = js.reduce((a, x) => a + x.total, 0), received = Math.round(paid / (1 + r));
    return { incomplete:false, received, paid, gap:paid - received, rate:(paid / received - 1) * 100, recvSrc:"'견적대비 비교' 시트의 월 보수 가용 범위", quoteTotal:Math.round(received / 0.97),
      sheetPaid:paid, sheetGap:received - paid, realRatio:0, missing:[], jobs:js, roles:[] };
  }
  function snap(c, period, jobs, q){
    return { kind:'PAYSNAP', v:2, demo:true, id:`demo2|${c.center}|${period}`, center:c.center, centerType:c.ind, subType:c.sub, region:c.reg, period, version:1,
      savedAt:`${period}-05T09:00:00.000Z`, sourceFile:'가상 데이터', savedBy:'시연', answers:{ centerType:c.ind, region:c.reg, workPattern:c.wp, consultType:'인바운드' },
      jobs, quote:q, checks:{ confirmed:[] }, headcount:{} };
  }
  function buildData(){
    const recs = [], centers = [], cnt = {};
    Object.entries(IND).forEach(([ind, d]) => { for(let i = 0; i < d.n; i++){
      const sub = d.subs[Math.floor(rnd() * d.subs.length)], reg = pick(REG, REG_W), key = reg + sub; cnt[key] = (cnt[key] || 0) + 1;
      const c = { center:`${reg} ${sub}${cnt[key] > 1 ? cnt[key] : ''} 상담센터`, ind, sub, reg, k: d.k * (0.94 + rnd() * 0.13), hours: rnd() < 0.1 ? 167 : 209, wp: rnd() < 0.08 ? '교대' : '주5일 40H' };
      c.heads = JOBS.map(([, , , , , , , , [a, b]]) => a + Math.floor(rnd() * (b - a + 1)));
      c.r = Math.max(-0.09, Math.min(0.10, 0.012 + (rnd() + rnd() + rnd() - 1.5) * 0.06));
      centers.push(c);
    } });
    centers.forEach(c => {
      [2024, 2025, 2026].forEach((y, yi) => {
        if(y === 2026 && rnd() < 0.08) return;   // 일부 센터는 올해 갱신 없음
        const k = c.k * (1 + yi * 0.012), jobs = mkJobs(y, k, c.hours, c.heads);
        const q = y >= 2025 ? mkQuote(jobs, c.r - (2026 - y) * 0.01) : undefined;
        recs.push(snap(c, `${y}-01`, jobs, q));
        if(y === 2026 && rnd() < 0.3){ const j2 = mkJobs(y, k * 1.01, c.hours, c.heads); recs.push(Object.assign(snap(c, '2026-07', j2, mkQuote(j2, c.r + 0.004)), { id:`demo2|${c.center}|2026-07` })); }
      });
    });
    /* 시연 센터의 지난 2년 (올해 것은 시연 중 [통계에 저장]으로 만들어짐) */
    const me = { center:DEMO_CENTER, ind:'공공', sub:'지자체', reg:'경기', k:0.99, hours:209, wp:'주5일 40H' };
    const hd = [3, 8, 6, 3, 2, 1, 1];
    [2024, 2025].forEach(y => { const jobs = mkJobs(y, me.k * (y === 2024 ? 0.985 : 1), 209, hd); recs.push(snap(me, `${y}-01`, jobs, y === 2025 ? mkQuote(jobs, -0.004) : undefined)); });
    return { recs, centers };
  }

  async function seedData(){
    const x = V2X();
    if(await x.kvGet('demoSeeded2')) return;
    const { recs, centers } = buildData();
    for(const r of recs) await sysStore.put(r);
    SNAPS = SNAPS.concat(recs);
    centers.forEach(c => { SETTINGS.centers[c.center] = c.ind; });
    SETTINGS.centers[DEMO_CENTER] = '공공';
    SETTINGS.centerMeta = Object.assign({}, SETTINGS.centerMeta, { [DEMO_CENTER]: { sub:'지자체', region:'경기' } });
    SETTINGS.market = (SETTINGS.market || []).filter(m => !m.demo).concat(['서울', '경기', '부산', '대구', '대전', '광주', '인천', '경남'].flatMap((rg, i) => [
      { id:`demo2-m-${rg}-c`, demo:true, date:'2026-09-15', region:rg, laborType:'상담사', monthly:2420000 + i * 12000, source:'가상 채용공고' },
      { id:`demo2-m-${rg}-m`, demo:true, date:'2026-09-15', region:rg, laborType:'관리자', monthly:3050000 + i * 15000, source:'가상 채용공고' }]));
    await saveSettings();
    /* 초과 설계 상위 센터 메모 */
    const top = centers.filter(c => c.r > 0.04).sort((a, b) => b.r - a.r).slice(0, 4);
    const texts = [['재계약 대비 인상', '26년 4월 재계약 단가 인상 전 선반영. 재계약 시 직접인건비 6% 인상 협의 예정'], ['인력 유지·채용난', '상담1 이탈률 18% → 업적수당 상향으로 유지. 고객사 공유 완료'],
      ['고객사 요청', '고객사 요청으로 야간 상담 인력 증원분 선반영(견적 미반영)'], ['최저임금 인상 선반영', '2027년 최저임금 인상분 일부 선반영']];
    const memos = top.map((c, i) => ({ kind:'PAYMEMO', v:1, id:`demo2-memo-${i}`, center:c.center, period:'2026-01', cat:texts[i][0], text:texts[i][1], at:`2026-0${2 + i}-1${i}T09:00:00.000Z`, by:'시연 PM' }));
    await x.kvSet('centerMemos', memos);
    await x.kvSet('demoSeeded2', true);
    if(typeof refreshNavCounts === 'function') refreshNavCounts();
  }

  /* ---------- 가상 급여테이블(견적서·견적대비 비교 시트 포함) → 자동연동 JSON처럼 불러오기 ---------- */
  function loadSample(){
    const bin = atob(window.DEMO_XLSX), u = new Uint8Array(bin.length); for(let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const wb = XLSX.read(u, { type:'array', cellFormula:true });
    const grid = n => { const ws = wb.Sheets[n], rg = XLSX.utils.decode_range(ws['!ref']);
      const values = XLSX.utils.sheet_to_json(ws, { header:1, defval:'', raw:true }), formulas = [];
      for(let r = rg.s.r; r <= rg.e.r; r++){ const row = []; for(let c = rg.s.c; c <= rg.e.c; c++){ const cell = ws[XLSX.utils.encode_cell({ r, c })]; row.push(cell && cell.f ? '=' + cell.f : ''); } formulas.push(row); }
      return { values, formulas }; };
    const extra = wb.SheetNames.filter(n => !n.includes('급여테이블') && /견적|대비|대사/.test(n)).map(n => {
      const rg = XLSX.utils.decode_range(wb.Sheets[n]['!ref']); rg.s = { r:0, c:0 };
      return { name:n, values: XLSX.utils.sheet_to_json(wb.Sheets[n], { header:1, defval:'', raw:true, range:rg }) }; });
    const cur = grid('급여테이블(변경후)'), prev = grid('급여테이블(변경전)');
    /* 시연용으로 검사 항목 하나를 심어 둠: 51행 F열(상담2 월 보수 합계)을 숫자로 직접 입력 */
    cur.formulas[50][5] = ''; cur.values[50][5] = 2400000;
    const payload = { v:2, kind:'PAYTABLE', sheet:'급여테이블(변경후)', file:'가상시_민원상담콜센터_급여테이블_2026.xlsx', start:'A1', values:cur.values, formulas:cur.formulas, before:prev.values, extra };
    $('fileMeta').textContent = '';
    handleLinkedJsonFile(new File([JSON.stringify(payload)], '가상시_민원상담콜센터_급여테이블_2026.json'));
  }

  /* ---------- 시연 순서 ---------- */
  const panelOf = id => { const e = $(id); return e && (e.closest('.panel') || e); };
  const clickNext = async n => { const b = document.querySelector(`#v2Next [data-n="${n}"]`); if(b){ b.click(); return true; } return false; };
  const firstPage = () => document.querySelector('#reportDoc .page');
  const STEPS = [
    { t:'시연 시작', d:'가상 센터 60곳의 2024~2026년 급여 데이터가 미리 들어 있습니다. 지금부터 급여테이블 1건을 올려 <b>조견표 → 통계 → 인건비 분석 보고서</b>까지 실제 화면으로 진행합니다.',
      run: async () => { switchAppTab('create'); }, el: () => document.querySelector('.app-tab[data-tab="create"]') },
    { t:'① 급여테이블 올리기', d:'실제로는 보안 엑셀을 SharePoint에 한 번 올리면 M365가 자동 변환해 이 화면으로 보내 줍니다. 시연에서는 가상 급여테이블(견적서·견적대비 비교 시트 포함)을 바로 불러옵니다.',
      run: async () => { loadSample(); await waitFor(() => $('fileMeta').textContent.includes('자동연동') && checkState && checkState.issues); await wait(300); }, el: () => panelOf('dropzone') },
    { t:'② 변경전 대비 비교', d:'같은 파일의 변경전 시트와 직무별 월 합계를 자동 비교합니다. 신규·세분화·폐지 직무와 인상률이 한 번에 보입니다.',
      run: async () => { const d = document.querySelector('#v2Compare details'); if(d) d.open = true; }, el: () => $('v2Compare') },
    { t:'③ 자동 검사', d:'구조·최저임금·월 보수 합계·수식(숫자 직접 입력, 다른 수식, GAP 누락)을 자동으로 검사합니다. 여기서는 <b>51행 F열에 숫자가 직접 입력된 칸</b>을 찾아냈습니다.',
      el: () => $('checkPanel') },
    { t:'④ 확인 항목 처리', d:'확인이 필요한 항목은 내용을 보고 체크(사유 입력)하면 진행됩니다. 항목이 많을 때는 [모두 확인함] 한 번으로 처리합니다.',
      run: async () => { if(!(await clickNext('ackall'))){ const b = document.querySelector('.v2-ackall'); if(b) b.click(); } await wait(300); }, el: () => $('checkPanel') },
    { t:'⑤ 견적 대비 직접인건비', d:'견적서 시트에서 <b>받는 직접인건비</b>(월 보수 가용 범위)와 급여설계로 <b>나가는 직접인건비</b>를 비교합니다. 엑셀 시트 계산과 일치 여부도 표시하고, B등급이 없는 직무는 직접 입력받습니다.',
      el: () => $('v2Quote') },
    { t:'⑥ 조견표 생성', d:'버튼 하나로 직무별 조견표가 만들어집니다. 초과근무 비고(2H·5H)는 엑셀 수식에서 자동으로 읽어 넣었습니다.',
      run: async () => { await clickNext('gen'); await waitFor(() => $('results') && $('results').children.length > 0); await wait(400); }, el: () => $('resultPanel') },
    { t:'⑦ 미리보기·편집', d:'직무를 누르면 미리보기가 바뀌고, 왼쪽에서 표 너비·예외 및 특례사항 문구를 고치면 바로 반영됩니다. 출력 형식은 기존 조견표와 같습니다.',
      el: () => $('previewPanel') },
    { t:'⑧ PNG · ZIP 내려받기', d:'직무별 PNG를 한 번에 ZIP으로 내려받습니다. (시연에서는 누르지 않아도 됩니다)', el: () => $('zipBtn') },
    { t:'⑨ 통계에 저장', d:'센터유형·세부유형·지역을 고르고 저장하면 통계와 보고서에 쌓입니다. 같은 센터는 다음부터 자동으로 채워집니다.',
      run: async () => { await clickNext('snap'); await waitFor(() => $('snapPanel').style.display !== 'none');
        $('snapType').value = '공공'; $('snapType').dispatchEvent(new Event('change')); await wait(100);
        $('v2SnapSub').value = '지자체'; $('v2SnapReg').value = '경기';
        $('snapSaveBtn').click(); await waitFor(() => /저장 완료/.test($('snapStatus').textContent)); await wait(300); }, el: () => $('snapPanel') },
    { t:'⑩ 급여 통계 — 산업군 한눈에', d:'산업군·세부유형별 인당 평균 총임금을 카드로 봅니다. 빨간 세로선이 전체 평균이고, 산업군이나 세부유형을 누르면 그 범위로 좁혀집니다.',
      run: async () => { switchAppTab('stats'); await waitFor(() => document.querySelector('#sGrid .s-ic')); }, el: () => $('sGrid') },
    { t:'⑪ 센터 목록', d:'기준 연도·비교 연도(Shift+클릭), 직군, 근무유형, 지역으로 걸러 센터별 총임금·인상률·최저임금 여유·평균 대비를 봅니다. 센터명을 누르면 보고서로 이동합니다.',
      run: async () => { document.querySelector('#sTabs [data-t="list"]').click(); await wait(200); }, el: () => $('sVList') },
    { t:'⑫ 견적 대비 — 초과 설계 순위', d:'받는 직접인건비보다 급여를 많이 설계한 센터가 위로 옵니다. 5% 넘게 초과하면 <b>초과 주의</b>, 산업군별 평균도 함께 보입니다.',
      run: async () => { document.querySelector('#sTabs [data-t="quote"]').click(); await waitFor(() => document.querySelector('#sQuote tbody tr')); }, el: () => $('sVQuote') },
    { t:'⑬ 센터 메모', d:'왜 초과(또는 여유)로 설계했는지 사유를 남깁니다. 분류·작성자·날짜가 함께 기록되고 공유 폴더에 저장되어 모든 사용자가 같이 봅니다.',
      run: async () => { const b = document.querySelector('#sQuote [data-memo]'); if(b) b.click(); await wait(200); }, el: () => document.querySelector('#sMemo .v2-memo-box') },
    { t:'⑭ 인건비 분석 보고서 (내부 검토용)', d:'1쪽에 결론(요청 단가 인상률)과 근거 3가지, 산출 흐름, 금액 변화가 나옵니다. 직접인건비 인상률을 5%로 입력하고 조정 사유를 적었습니다.',
      run: async () => { const m = $('sMemo'); if(m) m.hidden = true;
        reportState.center = DEMO_CENTER; switchAppTab('report'); await waitFor(() => firstPage());
        const mode = document.querySelector('.rep-mode [data-mode="internal"]'); if(mode) mode.click();
        $('repLabor').value = '5'; $('repLabor').dispatchEvent(new Event('change', { bubbles:true })); await wait(200);
        $('repReason').value = '고객사 예산 한도 반영 — 2단계 분할 인상 1차분'; $('repReason').dispatchEvent(new Event('change', { bubbles:true })); await wait(300); },
      el: () => firstPage() },
    { t:'⑮ 3쪽 인상률 시나리오', d:'내부 검토용에만 붙는 쪽입니다. 최저임금 대응·원가 보전·요청안·시장 회복을 나란히 놓고, 이보다 낮추면 최저임금에 미달하는 <b>하한선</b>을 보여 줍니다.',
      el: () => document.querySelectorAll('#reportDoc .page')[2] },
    { t:'⑯ 고객 제출용', d:'고객 제출용을 고르면 원가 구조·견적 대비 지급·자동 산출 내역·시나리오가 빠진 2쪽 보고서가 됩니다. 파일 이름 끝에 _고객제출용이 붙습니다.',
      run: async () => { const b = document.querySelector('.rep-mode [data-mode="client"]'); if(b) b.click(); await wait(300); }, el: () => firstPage() },
    { t:'⑰ Word로 내려받기', d:'화면과 같은 모양의 Word 파일로 내려받습니다. 시연은 여기까지입니다. [처음부터 다시]를 누르면 가상 데이터를 새로 채우고 처음부터 볼 수 있습니다.',
      el: () => $('repWordBtn') }
  ];

  let cur = -1, busy = false; const done = new Set();
  function focusEl(el){
    document.querySelectorAll('.demo-hl').forEach(e => e.classList.remove('demo-hl'));
    if(!el) return;
    el.classList.add('demo-hl');
    el.scrollIntoView({ behavior:'smooth', block: el.offsetHeight > window.innerHeight * 0.7 ? 'start' : 'center' });
  }
  function paint(){
    const s = STEPS[cur];
    $('demoNo').textContent = `${cur + 1} / ${STEPS.length}`;
    $('demoT').textContent = s.t; $('demoD').innerHTML = s.d;
    $('demoBar').style.width = `${(cur + 1) / STEPS.length * 100}%`;
    $('demoPrev').disabled = cur <= 0 || busy;
    $('demoNext').disabled = busy;
    $('demoNext').textContent = busy ? '진행 중…' : cur === STEPS.length - 1 ? '끝' : '다음 ▶';
  }
  async function go(i){
    if(busy || i < 0 || i >= STEPS.length) return;
    cur = i; busy = true; paint();
    try{ if(STEPS[i].run && !done.has(i)){ await STEPS[i].run(); done.add(i); } }catch(e){ console.error(e); }
    busy = false; paint(); await wait(50); focusEl(STEPS[i].el && STEPS[i].el());
  }
  $('demoNext').onclick = () => cur === STEPS.length - 1 ? focusEl(null) : go(cur + 1);
  $('demoPrev').onclick = () => { if(cur > 0){ cur--; paint(); focusEl(STEPS[cur].el && STEPS[cur].el()); } };
  $('demoMin').onclick = () => { const t = $('demoTour'); t.classList.toggle('min'); $('demoMin').textContent = t.classList.contains('min') ? '펼치기' : '접기'; };
  $('demoReset').onclick = async () => {
    if(!confirm('시연 데이터를 지우고 처음부터 다시 시작할까요? (실제 시스템 데이터와는 무관합니다)')) return;
    for(const n of ['paytable-system-v2-demo', 'paytable-link-v2-demo']) await new Promise(r => { const q = indexedDB.deleteDatabase(n); q.onsuccess = q.onerror = q.onblocked = () => r(); });
    location.reload();
  };

  /* ---------- 시작: 안내 창 없이 바로 시연 ---------- */
  (async () => {
    await waitFor(() => window.__v2 && typeof SNAPS !== 'undefined' && typeof SETTINGS !== 'undefined' && SETTINGS.centerTypes, 15000);
    await wait(500);
    const x = V2X();
    await x.kvSet('profile', { name:'시연 담당', ini:'DEMO' }); await x.kvSet('onboarded', 'later');
    for(let k = 0; k < 20; k++){ const w = $('v2Wizard'); if(w && !w.hidden) w.hidden = true; await wait(100); }
    try{ await seedData(); }catch(e){ console.error(e); $('demoT').textContent = '가상 데이터를 준비하지 못했습니다'; $('demoD').textContent = String(e && e.message || e); return; }
    $('demoNo').textContent = `0 / ${STEPS.length}`;
    $('demoT').textContent = '준비 완료';
    $('demoD').innerHTML = `가상 센터 60곳 · 급여 데이터 ${SNAPS.filter(s => s.demo).length}건을 불러왔습니다. <b>[시작 ▶]</b>을 누르면 순서대로 진행합니다.`;
    $('demoNext').disabled = false;
    $('demoNext').onclick = () => { $('demoNext').onclick = () => cur === STEPS.length - 1 ? focusEl(null) : go(cur + 1); go(0); };
    window.__demo = { go, STEPS, get cur(){ return cur; } };
  })();
})();

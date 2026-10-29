/* ============================================================
   급여 통계 (인건비 수준 통계) — stats_prototype 기준
   저장된 스냅샷(SNAPS)을 '연도 × 센터 × 직무' 행으로 펼쳐 산업군·세부유형·지역·근무유형별로 비교
   [이전 화면]으로 원래 통계 화면을 언제든 볼 수 있음
   ============================================================ */
(() => {
  const $ = id => document.getElementById(id);
  const h = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
  const V2X = () => window.__v2 || {};
  const MIN_N = 5;

  /* ---------- 분류 체계: 산업군(=센터유형) › 세부유형 (기준정보에서 편집) ---------- */
  const DEFAULT_TREE = {
    '공공':['중앙부처', '지자체', '공공기관', '공공 그 외'],
    '금융':['보험', '은행', '카드', '증권', '금융 그 외'],
    '통신':['이동통신', '유선·인터넷', '알뜰폰', '통신 그 외'],
    '유통':['이커머스', '홈쇼핑', '대형마트·백화점', '유통 그 외'],
    '기타':['가전·전자', '자동차', '여행·레저', '기타 그 외']
  };
  function industryTree(){
    const t = SETTINGS.industryTree || DEFAULT_TREE, out = {};
    (SETTINGS.centerTypes || []).forEach(c => { out[c] = (t[c] && t[c].length) ? t[c].slice() : [`${c} 그 외`]; });
    return out;
  }
  const REG = ['서울', '경기', '인천', '부산', '대구', '광주', '대전', '울산', '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
  const ZONES = { '수도권':['서울', '경기', '인천'], '충청권':['대전', '세종', '충북', '충남'], '호남권':['광주', '전북', '전남'], '대경권':['대구', '경북'], '동남권':['부산', '울산', '경남'], '강원·제주':['강원', '제주'] };
  const ZONE_OF = Object.fromEntries(Object.entries(ZONES).flatMap(([z, rs]) => rs.map(r => [r, z])));
  const WT = ['주5일(209h)', '주4일(167h)', '단시간(≤130h)', '교대·야간'];
  const WT_S = { '주5일(209h)':'주5', '주4일(167h)':'주4', '단시간(≤130h)':'단시간', '교대·야간':'교대' };
  /* 연도별 최저시급 (설정값이 있으면 우선) */
  const MW = { 2024:9860, 2025:10030, 2026:10320 };
  const mwOf = y => (SETTINGS.minWageByYear || {})[y] || MW[y] || SETTINGS.minWageHourly;

  /* ---------- 스냅샷 → 행 ---------- */
  const num = v => typeof v === 'number' && isFinite(v) ? v : 0;
  /* 인당 월 총임금 = 월 보수 합계(기준급여 소계 + B등급 업적수당 + 고정 초과·야간·통신 수당) */
  function payParts(j){
    const fixed = num(j.overtime) + num(j.night) + num(j.telecom);
    const base = num(j.stdPaySum) || num(j.fixedPay);
    let perf = typeof j.perf === 'number' ? j.perf : null;
    if(perf == null && typeof j.gradeB === 'number' && j.gradeB < base * 0.5) perf = j.gradeB;   // 실제 양식: 등급 행 = 업적수당 금액
    let monthly = num(j.monthlyTotal);
    if(perf == null) perf = Math.max(0, monthly - base - fixed);
    if(!monthly) monthly = base + fixed + perf;
    return { monthly, base, fixed, perf };
  }
  const workType = (hours, pattern) => /교대|야간/.test(pattern || '') && hours >= 200 ? '교대·야간' : hours >= 200 ? '주5일(209h)' : hours >= 150 ? '주4일(167h)' : '단시간(≤130h)';
  const jobGroup = j => j.block === '리더그룹' || j.laborType === '관리자' ? '관리자' : '상담사';
  const basicPay = j => { const k = Object.keys(j.items || {}).find(x => /기본급/.test(x)); return k ? num(j.items[k]) : num(j.fixedPay); };
  /* 가상 데이터에는 세부유형·지역이 없어 이름으로 고정 배정 (화면 확인용) */
  const CITY = { 수원:'경기', 성남:'경기', 고양:'경기', 용인:'경기', 창원:'경남', 김해:'경남', 청주:'충북', 천안:'충남', 전주:'전북', 포항:'경북', 원주:'강원' };
  const hash = s => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  function metaOf(s, tree){
    const ind = s.centerType || '미분류';
    let sub = s.subType, reg = s.region || (s.answers && s.answers.region) || '';
    if(s.demo){
      const city = s.center.split(' ')[0];
      if(!reg) reg = CITY[city] || (REG.includes(city) ? city : '');
      if(!sub && tree[ind]) sub = tree[ind][hash(s.center) % tree[ind].length];
    }
    if(!sub || (tree[ind] && !tree[ind].includes(sub))) sub = `${ind} 미지정`;
    return { ind, sub, reg: reg || '미지정' };
  }

  let D = null;   // { ROWS, CENTERS, YEARS, TREE, IND, SUB_IND, REGS }
  function build(){
    const tree = industryTree();
    /* 센터 × 연도: 그해 마지막(최신 버전) 스냅샷 1건 */
    const pick = new Map();
    for(const s of SNAPS){
      if(!s.period || !s.jobs) continue;
      const key = s.center + '|' + s.period.slice(0, 4), cur = pick.get(key);
      if(!cur || s.period > cur.period || (s.period === cur.period && s.version > cur.version)) pick.set(key, s);
    }
    const ROWS = [], CM = new Map();
    for(const s of pick.values()){
      const year = +s.period.slice(0, 4), m = metaOf(s, tree);
      if(!tree[m.ind]) tree[m.ind] = [];
      if(!tree[m.ind].includes(m.sub)) tree[m.ind].push(m.sub);
      const pattern = s.answers && s.answers.workPattern;
      let c = CM.get(s.center);
      if(!c){ c = { center:s.center, wts:new Set(), years:new Set(), margin:{}, last:'' }; CM.set(s.center, c); }
      if(s.period >= c.last){ Object.assign(c, m, { last:s.period }); }
      c.years.add(year);
      let minMargin = null;
      const allHeads = s.jobs.every(j => j.heads > 0);   // 견적대비 비교 시트의 직무별 인원이 있으면 센터 안에서 인원 가중
      s.jobs.forEach(j => {
        const p = payParts(j); if(!p.monthly) return;
        const hours = j.wHours || j.hours || 209, wt = workType(hours, pattern);
        c.wts.add(wt);
        const b = basicPay(j), mg = b ? (b / (mwOf(year) * hours) - 1) * 100 : null;
        if(mg != null && (minMargin == null || mg < minMargin)) minMargin = mg;
        ROWS.push({ year, center:s.center, ind:m.ind, sub:m.sub, reg:m.reg, zone:ZONE_OF[m.reg] || '미지정', wt, job:jobGroup(j), jobName:j.name, w: allHeads ? j.heads : 1, ...p });
      });
      if(minMargin != null) c.margin[year] = +minMargin.toFixed(1);
    }
    /* 센터의 분류는 최신 스냅샷 기준으로 통일 */
    ROWS.forEach(r => { const c = CM.get(r.center); r.ind = c.ind; r.sub = c.sub; r.reg = c.reg; r.zone = ZONE_OF[c.reg] || '미지정'; });
    const CENTERS = [...CM.values()].map(c => ({ ...c, wts:[...c.wts], start:Math.min(...c.years), end:Math.max(...c.years) }));
    const YEARS = [...new Set(ROWS.map(r => r.year))].sort();
    Object.keys(tree).forEach(i => { if(!tree[i].length || !ROWS.some(r => r.ind === i)) delete tree[i]; });
    const IND = Object.keys(tree);
    const SUB_IND = Object.fromEntries(IND.flatMap(i => tree[i].map(s => [s, i])));
    const REGS = REG.filter(r => ROWS.some(x => x.reg === r)).concat(ROWS.some(x => x.reg === '미지정') ? ['미지정'] : []);
    D = { ROWS, CENTERS, YEARS, TREE:tree, IND, SUB_IND, REGS, PICK:pick };
  }

  /* ---------- 상태 ---------- */
  const st = { job:'상담사', year:null, cmp:null, subs:new Set(), open:new Set(), wts:new Set(WT), reg:'', unit:'y', tab:'pivot', dim:'cls',
    q:'', closed:false, sortKey:'avg', sortDir:-1, pageSize:15, page:0,
    cols:new Set(['reg', 'wt', 'heads', 'cmp', 'avg', 'yoy', 'margin', 'dev']) };
  const COLS = [
    ['reg', '지역'], ['cls', '분류'], ['wt', '근무유형'], ['heads', '직무 수'], ['base', '기준급여 소계(월)'], ['fixed', '고정 수당(월)'], ['perf', 'B등급 업적수당(월)'],
    ['cmp', '비교 연도'], ['avg', '기준 연도 총임금'], ['yoy', '인상률'], ['margin', '최저임금 여유'], ['rank', '순위'], ['dev', '선택 평균 대비']
  ];

  /* ---------- 공통 계산 ---------- */
  const K = n => getComputedStyle($('v2St')).getPropertyValue('--' + n).trim();
  /* 평균 = 센터별 직무 평균(직무별 인원이 있으면 인원 가중)의 단순 평균 — 센터마다 같은 비중 */
  function agg(rows){
    const by = new Map();
    rows.forEach(r => { let c = by.get(r.center); if(!c){ c = { m:0, b:0, f:0, p:0, k:0 }; by.set(r.center, c); } const w = r.w || 1; c.m += r.monthly * w; c.b += r.base * w; c.f += r.fixed * w; c.p += r.perf * w; c.k += w; });
    const n = by.size; if(!n) return { heads:0, n:0, avg:null, base:null, fixed:null, perf:null };
    let m = 0, b = 0, f = 0, p = 0; by.forEach(c => { m += c.m / c.k; b += c.b / c.k; f += c.f / c.k; p += c.p / c.k; });
    return { heads:rows.length, n, avg:m / n, base:b / n, fixed:f / n, perf:p / n };
  }
  const inJob = r => !st.job || r.job === st.job;
  const inCls = r => !st.subs.size || st.subs.has(r.sub);
  const inWt = r => st.wts.has(r.wt), inReg = r => !st.reg || r.reg === st.reg;
  const scoped = (ex = []) => D.ROWS.filter(r => inJob(r) && (ex.includes('cls') || inCls(r)) && (ex.includes('wt') || inWt(r)) && (ex.includes('reg') || inReg(r)));
  const yearOf = (rows, y) => rows.filter(r => r.year === y);
  const fmt = v => v == null ? '–' : `${Math.round(v * (st.unit === 'y' ? 12 : 1) / 10000).toLocaleString()}만`;
  const pct = (a, b) => a != null && b ? (a / b - 1) * 100 : null;
  const pctS = p => p == null ? '–' : `${p > 0 ? '+' : ''}${p.toFixed(1)}%`;
  const unitL = () => st.unit === 'y' ? '연' : '월';
  const jobL = () => st.job || '전체 직군';
  function scope(){
    if(!st.subs.size) return { name:'전체 산업', ind:null, path:[] };
    const inds = [...new Set([...st.subs].map(s => D.SUB_IND[s]))];
    if(inds.length === 1){
      const i = inds[0], all = D.TREE[i];
      if(all.every(s => st.subs.has(s))) return { name:i, ind:i, path:[i] };
      if(st.subs.size === 1){ const s = [...st.subs][0]; return { name:s, ind:i, path:[i, s] }; }
      return { name:`${i} 세부 ${st.subs.size}개`, ind:i, path:[i, `세부 ${st.subs.size}개`] };
    }
    return { name:`산업군 ${inds.length}개 선택`, ind:null, path:[`산업군 ${inds.length}개`] };
  }
  const clsAxis = () => { const sc = scope(); return sc.ind ? { key:'sub', label:`${sc.ind} 세부유형`, opts:D.TREE[sc.ind], ind:sc.ind } : { key:'ind', label:'산업군', opts:D.IND }; };
  const statusOf = d => d >= 3 ? ['평균 이상', K('g1')] : d > -3 ? ['평균 수준', K('g3')] : d > -7 ? ['평균 미만', '#FF9AA0'] : ['점검 필요', K('red')];
  function devBar(dv, thin){
    const w = Math.min(50, Math.abs(dv) / 0.10 * 50), c = thin ? K('g3') : dv >= 0 ? K('g1') : K('red');
    return `<div class="s-bar"><b></b><i style="left:${dv >= 0 ? 50 : 50 - w}%;width:${w}%;background:${c};opacity:${dv >= 0 || thin ? 1 : .7}"></i></div><div class="s-dv">${dv >= 0 ? '+' : ''}${(dv * 100).toFixed(1)}%</div>`;
  }

  /* ---------- 화면 뼈대 ---------- */
  const pane = $('tabStats');
  pane.insertAdjacentHTML('afterbegin', `<div id="v2St">
    <div class="s-card s-none" id="sNone" hidden>저장된 급여 데이터가 없습니다.<br>조견표를 만든 뒤 <b>[통계에 저장]</b>을 누르면 여기에 쌓입니다. 화면만 먼저 보시려면 <b>[급여 데이터] › 가상 데이터 불러오기</b>를 눌러 주세요.</div>
    <div class="s-app" id="sApp">
      <aside class="s-card s-panel">
        <section><div class="s-logo"><b>인건비 통계</b><span class="s-soft sx" id="sDemo" hidden>가상 데이터 포함</span></div></section>
        <section><h4>직군</h4><div class="s-job" id="sJob"><button type="button" data-j="상담사">상담사</button><button type="button" data-j="관리자">관리자</button><button type="button" data-j="">전체</button></div>
          <div class="s-hint">관리자 = 급여테이블에서 '리더그룹'으로 묶인 직무(팀장·파트장 등). 기본은 상담사입니다.</div></section>
        <section><h4>기준 연도 <span style="font-size:11px;color:var(--f);font-weight:400">Shift+클릭: 비교 연도</span></h4><div class="s-yr" id="sYears"></div><div class="s-hint" id="sYearHint"></div></section>
        <section><h4>분류 선택 <button type="button" class="s-lnk" id="sClear">전체 해제</button></h4><div class="s-tree" id="sTree"></div></section>
        <section><h4>근무유형 · 지역</h4><div class="s-chips" id="sWt"></div><select class="s-inp" id="sReg" style="width:100%;margin-top:10px"></select></section>
      </aside>
      <main style="min-width:0">
        <div class="s-card s-top"><div class="s-crumb" id="sCrumb"></div><div class="sp"></div>
          <span class="s-seg" id="sUnit"><button type="button" data-u="y" class="on">연</button><button type="button" data-u="m">월</button></span>
          <button type="button" class="s-btn pri" id="sXls">엑셀 다운로드</button>
          <button type="button" class="s-lnk" id="sOld" title="원래 통계 화면으로 보기">이전 화면</button></div>
        <div class="s-card s-gridh"><h3 id="sGridTitle"></h3><span class="lg2" id="sGridLg"></span></div>
        <div class="s-grid" id="sGrid"></div>
        <div class="s-card s-pad">
          <div class="s-tabs" id="sTabs"><button type="button" data-t="pivot" class="on">구분별 비교</button><button type="button" data-t="list">센터 목록</button><button type="button" data-t="heat">교차표</button><button type="button" data-t="quote">견적 대비</button></div>
          <div id="sVPivot">
            <div class="s-ch"><h3 id="sPivotTitle"></h3><span class="s-seg" id="sDim"><button type="button" data-d="cls" class="on">산업군</button><button type="button" data-d="reg">지역</button><button type="button" data-d="wt">근무유형</button></span></div>
            <div class="s-tw"><table class="s-tbl" id="sPivot"></table></div>
          </div>
          <div id="sVList" hidden>
            <div class="s-ch"><h3 id="sListTitle"></h3>
              <div class="s-tools">표시 <select class="s-inp" id="sPageSize"><option>15</option><option>30</option><option value="9999">전체</option></select>
                <input class="s-inp" id="sQ" type="search" placeholder="센터명·지역 검색" style="width:170px">
                <label style="display:flex;gap:4px;align-items:center;cursor:pointer"><input type="checkbox" id="sClosed">갱신 없는 센터 포함</label>
                <button type="button" class="s-btn" id="sCsv">CSV</button>
                <button type="button" class="s-btn" id="sColBtn" title="표시할 열">⚙ 열</button>
                <div class="s-colpick" id="sColpick" hidden></div></div></div>
            <div class="s-tw"><table class="s-tbl" id="sList"></table></div>
            <div class="s-pager" id="sPager"></div>
          </div>
          <div id="sVQuote" hidden>
            <div class="s-ch"><h3 id="sQTitle"></h3><span style="font-size:11px;color:var(--m)">초과율 = 급여설계 직접인건비 ÷ 받는 직접인건비(월 보수 가용 범위) − 1 · <span class="s-soft sr">초과 주의</span> 5% 초과 <span class="s-soft so">초과</span> <span class="s-soft sx">여유</span></span></div>
            <div class="s-tw"><table class="s-tbl" id="sQuote"></table></div>
            <div class="s-ch" style="margin-top:18px"><h3>산업군별 견적 대비</h3></div>
            <div class="s-tw"><table class="s-tbl" id="sQuoteInd"></table></div>
          </div>
          <div id="sVHeat" hidden>
            <div class="s-ch"><h3 id="sHmTitle"></h3><span style="font-size:11px;color:var(--m)">같은 근무유형 평균 대비 <span class="s-soft so">낮음</span> <span class="s-soft sx">비슷</span> <span class="s-soft sk">높음</span> · 흐린 글씨: 센터 ${MIN_N}개 미만</span></div>
            <div class="s-tw"><table class="s-tbl s-hm" id="sHm"></table></div>
          </div>
        </div>
        <div class="s-foot">산출: 인당 월 총임금 = 월 보수 합계(기준급여 소계 + B등급 업적수당 + 고정 초과·야간·통신 수당) · 연 = 월 × 12 · 평균 = 센터별 직무 평균(견적대비 비교 시트의 직무별 인원이 있으면 인원 가중)의 단순 평균(센터마다 같은 비중) · 직군 = 직무 블록(리더그룹 → 관리자, 그 외 → 상담사) · 근무유형 = 직무별 기본급 수식의 월 소정시간 · 최저임금 여유 = 직무별 기본급 ÷ (그해 최저시급 × 소정시간) − 1 의 센터 내 최솟값 · 운영 중 = 기준 연도에 저장된 급여테이블이 있는 센터 · 센터 ${MIN_N}개 미만 구분은 참고용 · 상여·퇴직급여·법정부담금 제외</div>
      </main>
    </div></div>`);

  /* ---------- 렌더 ---------- */
  function render(){
    build();
    const none = !D.ROWS.length;
    $('sNone').hidden = !none; $('sApp').hidden = none;
    if(none) return;
    $('sDemo').hidden = !SNAPS.some(s => s.demo);
    const Y = D.YEARS;
    if(!Y.includes(st.year)) st.year = Y.at(-1);
    if(st.cmp == null || st.cmp >= st.year || !Y.includes(st.cmp)) st.cmp = Y.filter(y => y < st.year).at(-1) ?? null;
    [...st.subs].forEach(s => { if(!D.SUB_IND[s]) st.subs.delete(s); });
    if(st.reg && !D.REGS.includes(st.reg)) st.reg = '';
    renderPanel(); renderTop(); renderGrid();
    $('sVList').hidden = st.tab !== 'list'; $('sVPivot').hidden = st.tab !== 'pivot'; $('sVHeat').hidden = st.tab !== 'heat'; $('sVQuote').hidden = st.tab !== 'quote';
    if(st.tab === 'pivot') renderPivot();
    if(st.tab === 'list') renderList(agg(yearOf(scoped(), st.year)).avg);
    if(st.tab === 'heat') renderHeat();
    if(st.tab === 'quote') renderQuote();
  }

  function renderPanel(){
    [...$('sJob').children].forEach(b => b.classList.toggle('on', b.dataset.j === st.job));
    $('sYears').innerHTML = D.YEARS.map(y => `<button type="button" data-y="${y}" class="${y === st.year ? 'on' : y === st.cmp ? 'cmp' : ''}">${y}</button>`).join('');
    $('sYearHint').innerHTML = st.cmp ? `기준 <b>${st.year}</b> · 비교 <b>${st.cmp}</b> (${st.year - st.cmp}년 전)` : `기준 <b>${st.year}</b> · 비교할 이전 연도 자료가 없습니다`;
    const cnt = s => D.CENTERS.filter(c => c.sub === s && c.years.has(st.year)).length;
    $('sTree').innerHTML = D.IND.map(i => {
      const subs = D.TREE[i], on = subs.filter(s => st.subs.has(s)).length, open = st.open.has(i);
      return `<div class="row" data-ind="${h(i)}"><span class="tg" data-tog="${h(i)}">${open ? '▾' : '▸'}</span><span class="s-cb ${on === subs.length ? 'on' : on ? 'part' : ''}"></span>${on ? `<b>${h(i)}</b>` : h(i)}<span class="n">${subs.reduce((a, s) => a + cnt(s), 0)}</span></div>`
        + (open ? subs.map(s => `<div class="row c" data-sub="${h(s)}"><span class="s-cb ${st.subs.has(s) ? 'on' : ''}"></span>${st.subs.has(s) ? `<b>${h(s)}</b>` : h(s)}<span class="n">${cnt(s)}</span></div>`).join('') : '');
    }).join('');
    $('sWt').innerHTML = WT.map(w => `<button type="button" class="s-chip ${st.wts.has(w) ? '' : 'off'}" data-wt="${w}">${WT_S[w]}${st.wts.has(w) ? ' ✓' : ''}</button>`).join('');
    $('sReg').innerHTML = `<option value="">지역 전체</option>${D.REGS.map(r => `<option${r === st.reg ? ' selected' : ''}>${h(r)}</option>`).join('')}`;
  }
  function renderTop(){
    const sc = scope();
    $('sCrumb').innerHTML = `<span class="s-soft sr">${h(jobL())}</span><a data-go="">전체 산업</a>${sc.path.map((p, i) => `<span>›</span>${i === sc.path.length - 1 ? `<b>${h(p)}</b>` : `<a data-go="${h(p)}">${h(p)}</a>`}`).join('')}
      <span class="s-soft sx" style="margin-left:6px">${st.year}${st.cmp ? ` vs ${st.cmp}` : ''}</span>${st.wts.size < WT.length ? `<span class="s-soft sx">${[...st.wts].map(w => WT_S[w]).join('·')}</span>` : ''}${st.reg ? `<span class="s-soft sx">${h(st.reg)}</span>` : ''}`;
  }

  /* 산업군·세부유형 카드 묶음: 산업군 금액·비교 연도·인상률 + 세부유형 가로 막대 */
  function renderGrid(){
    const pr = scoped(['cls']), sel = new Set([...st.subs].map(s => D.SUB_IND[s])), sc = scope(), m = st.unit === 'y' ? 12 : 1;
    const one = rs => { const c = agg(yearOf(rs, st.year)), p = agg(yearOf(rs, st.cmp)); return { c, p, yo:pct(c.avg, p.avg) }; };
    const all = one(pr), data = D.IND.map(i => ({ i, ...one(pr.filter(r => r.ind === i)), subs:D.TREE[i].map(s => ({ s, ...one(pr.filter(r => r.sub === s)) })).filter(x => x.c.n).sort((a, b) => b.c.avg - a.c.avg) }));
    const vals = data.flatMap(d => d.subs.map(x => x.c.avg * m / 10000)), stp = m === 12 ? 100 : 10;
    const lo = vals.length ? Math.floor(Math.min(...vals) * 0.97 / stp) * stp : 0, hi = vals.length ? Math.ceil(Math.max(...vals) * 1.01 / stp) * stp : 1;
    const sx = v => v == null ? 0 : Math.max(0, Math.min(100, (v * m / 10000 - lo) / ((hi - lo) || 1) * 100));
    const yoS = yo => yo == null ? '–' : `${yo >= 0 ? '▲' : '▼'} ${Math.abs(yo).toFixed(1)}%`;
    const big = a => a.avg ? Math.round(a.avg * m / 10000).toLocaleString() : '–';
    const cmpT = p => st.cmp ? `${st.cmp}년 ${fmt(p.avg)}` : '';
    $('sGridTitle').innerHTML = `산업군·세부유형별 인당 평균 ${unitL()} 총임금 <span class="s-soft sx">${h(jobL())} · ${st.year}</span>`;
    $('sGridLg').innerHTML = `막대 공통 축 ${lo.toLocaleString()}~${hi.toLocaleString()}만 · <b>┃</b> 전체 산업 평균 ${fmt(all.c.avg)} · 흐린 막대: 센터 ${MIN_N}개 미만 · 산업군·세부유형을 누르면 선택`;
    $('sGrid').innerHTML = data.map(d => `<div class="s-card s-ic ${sel.has(d.i) ? 'on' : sel.size ? 'dim' : ''}">
      <div class="hd" data-pick="${h(d.i)}"><b>${h(d.i)}</b><span>${d.c.n}개 센터 · 직무 ${d.c.heads.toLocaleString()}개</span></div>
      <div class="amt" data-pick="${h(d.i)}"><big>${big(d.c)}</big><small>만원</small><em class="${d.yo >= 0 ? 's-up' : 's-dn'}">${yoS(d.yo)}</em><i>${cmpT(d.p)}</i></div>
      ${d.subs.map(x => { const thin = x.c.n < MIN_N; return `<div class="s-sr2 ${thin ? 'thin' : ''} ${st.subs.has(x.s) && sc.path.length === 2 ? 'on' : ''}" data-pick="${h(x.s)}" title="${h(x.s)} · 센터 ${x.c.n}개${thin ? ' (표본 부족)' : ''}">
        <span class="nm">${h(x.s)}</span><div class="tr"><i style="width:${sx(x.c.avg)}%"></i><b style="left:${sx(all.c.avg)}%"></b></div><span class="v">${fmt(x.c.avg)}</span><span class="y">${pctS(x.yo)}</span></div>`; }).join('') || '<div class="s-hint">기준 연도 자료 없음</div>'}</div>`).join('')
      + `<div class="s-card s-ic tot"><div class="hd"><b>전체 산업</b><span>${all.c.n}개 센터 · 직무 ${all.c.heads.toLocaleString()}개</span></div>
      <div class="amt"><big>${big(all.c)}</big><small>만원</small><em>${yoS(all.yo)}</em><i>${cmpT(all.p)}</i></div>
      <div style="font-size:11.5px;color:#A2A4A3;line-height:1.6">카드의 빨간 세로선이 이 값입니다.<br>임금 구성 (인당 ${unitL()})</div>
      ${all.c.avg ? `<div class="s-mixl"><i style="width:${all.c.base / all.c.avg * 100}%;background:#FFFFFF"></i><i style="width:${all.c.fixed / all.c.avg * 100}%;background:#A2A4A3"></i><i style="width:${all.c.perf / all.c.avg * 100}%;background:#4C4C4E"></i></div>
      <div class="s-mixt"><span>기준급여 ${fmt(all.c.base)}</span><span>고정 수당 ${fmt(all.c.fixed)}</span><span>업적수당 ${fmt(all.c.perf)}</span></div>` : ''}</div>`;
  }

  /* ---------- 구분별 비교 (연도별) ---------- */
  function pivotSpec(){
    if(st.dim === 'cls'){ const ax = clsAxis(); return { key:ax.key, label:ax.label, opts:ax.opts, rows:scoped(['cls']).filter(r => !ax.ind || r.ind === ax.ind), go:true }; }
    return st.dim === 'reg' ? { key:'reg', label:'지역', opts:D.REGS, rows:scoped(['reg']) } : { key:'wt', label:'근무유형', opts:WT, rows:scoped(['wt']) };
  }
  function renderPivot(){
    const sp = pivotSpec(), show = D.YEARS.slice(-5), sc = scope();
    $('sPivotTitle').innerHTML = `${st.dim === 'cls' ? '' : `${h(sc.name)} · `}${h(sp.label)}별 인당 평균 ${unitL()} 총임금 — 연도별 <span class="s-soft sx">${h(jobL())}</span>`;
    const tot = show.map(y => agg(yearOf(sp.rows, y)));
    const list = sp.opts.map(o => { const rs = sp.rows.filter(r => r[sp.key] === o); return { o, ys:show.map(y => agg(yearOf(rs, y))), c:agg(yearOf(rs, st.year)), p:agg(yearOf(rs, st.cmp)) }; }).filter(x => x.ys.some(a => a.n));
    const tc = agg(yearOf(sp.rows, st.year)), tp = agg(yearOf(sp.rows, st.cmp));
    list.sort((a, b) => ((b.c.n >= MIN_N) - (a.c.n >= MIN_N)) || (b.c.avg || 0) - (a.c.avg || 0));
    const row = (name, ys, c, p, cls, go) => { const thin = c.n && c.n < MIN_N;
      return `<tr class="${cls || ''}${thin ? ' thin' : ''}"${go ? ` data-pick="${h(go)}"` : ''}><td>${h(name)}${thin ? ' <span class="s-soft sx">표본 부족</span>' : ''}</td><td class="r">${c.n || '–'}</td><td class="r">${c.heads ? c.heads.toLocaleString() : '–'}</td>
        ${ys.map((a, i) => `<td class="r ${show[i] === st.year ? 'cy' : show[i] === st.cmp ? 'cp' : ''}">${fmt(a.avg)}</td>`).join('')}
        <td class="r ${!thin && c.avg >= p.avg ? 's-up' : !thin && p.avg ? 's-dn' : ''}">${pctS(pct(c.avg, p.avg))}</td><td style="width:150px">${c.avg && tc.avg ? devBar(c.avg / tc.avg - 1, thin) : ''}</td></tr>`; };
    const totName = st.dim === 'cls' ? (clsAxis().ind ? `${clsAxis().ind} 전체` : '전체 산업') : `${sc.name} 전체`;
    $('sPivot').innerHTML = `<thead><tr><th>${h(sp.label)}</th><th class="r">센터</th><th class="r">직무</th>${show.map(y => `<th class="r">${y}</th>`).join('')}<th class="r">${st.cmp ? `${st.cmp}→${st.year}` : '인상률'}</th><th>${h(totName)} 대비</th></tr></thead>
      <tbody>${row(totName, tot, tc, tp, 'total')}${list.map(x => row(x.o, x.ys, x.c, x.p, `${sp.go ? 'go' : ''}${st.subs.has(x.o) ? ' sel' : ''}`, sp.go ? x.o : '')).join('')}</tbody>`;
  }

  /* ---------- 센터 목록 ---------- */
  function centerItems(){
    const rows = scoped(), sc = scope();
    const pool = D.CENTERS.filter(c => (!st.subs.size || st.subs.has(c.sub)) && (!st.reg || c.reg === st.reg) && c.wts.some(w => st.wts.has(w)) && c.start <= st.year);
    const items = pool.map(c => ({ c, live:c.years.has(st.year) })).filter(x => st.closed || x.live)
      .filter(x => !st.q || x.c.center.includes(st.q) || x.c.reg.includes(st.q)).map(x => {
        const c = x.c, rs = rows.filter(r => r.center === c.center), lastY = [...c.years].filter(y => y <= st.year).sort().at(-1);
        const a = agg(yearOf(rs, st.year)), p = agg(yearOf(rs, st.cmp)), last = agg(yearOf(rs, lastY));
        return { c, a, p, last, lastY, live:x.live, yoy:pct(a.avg, p.avg), margin:x.live ? c.margin[st.year] ?? null : null };
      }).filter(x => !x.live || x.a.n);
    const ranked = items.filter(x => x.live && x.a.avg).sort((x, y) => y.a.avg - x.a.avg);
    ranked.forEach((x, i) => { x.rank = i + 1; });
    const val = { avg:x => x.a.avg, cmp:x => x.p.avg, heads:x => x.a.heads, yoy:x => x.yoy, margin:x => x.margin, rank:x => x.rank, dev:x => x.a.avg, base:x => x.a.base, fixed:x => x.a.fixed, perf:x => x.a.perf, name:x => x.c.center, reg:x => x.c.reg, cls:x => x.c.sub };
    const f = val[st.sortKey] || val.avg;
    items.sort((x, y) => (y.live - x.live) || (() => { const a = f(x), b = f(y); if(a == null) return 1; if(b == null) return -1; return (typeof a === 'string' ? a.localeCompare(b) : a - b) * st.sortDir; })());
    return { items, ranked, pool, sc };
  }
  function renderList(scopeAvg){
    const { items, ranked, pool, sc } = centerItems();
    const live = items.filter(x => x.live).length, stale = pool.filter(c => !c.years.has(st.year)).length;
    const pages = Math.max(1, Math.ceil(items.length / st.pageSize)); st.page = Math.max(0, Math.min(st.page, pages - 1));
    const shown = items.slice(st.page * st.pageSize, (st.page + 1) * st.pageSize);
    $('sListTitle').innerHTML = `${h(sc.name)} 센터 목록 <span class="s-soft sk">운영 중 ${live}</span>${stale ? `<span class="s-soft sx">갱신 없음 ${stale}</span>` : ''}<span class="s-soft sx">${h(jobL())}</span>`;
    const C = COLS.filter(([k]) => st.cols.has(k)), numK = new Set(['heads', 'base', 'fixed', 'perf', 'cmp', 'avg', 'yoy', 'margin', 'rank']);
    const head = k => ({ cmp:`${st.cmp || '비교'} 총임금`, avg:`${st.year} 총임금`, yoy:'인상률', dev:`${sc.name} 평균 대비` })[k] || COLS.find(c => c[0] === k)[1];
    const th = (k, l, cls) => `<th class="s ${cls || ''}" data-sort="${k}">${h(l)}${st.sortKey === k ? `<span class="ar"> ${st.sortDir < 0 ? '▼' : '▲'}</span>` : ''}</th>`;
    const cell = (k, x) => {
      if(!x.live) return ({ reg:h(x.c.reg), cls:h(x.c.sub), cmp:fmt(x.last.avg) })[k] ?? '–';
      const d = x.a.avg && scopeAvg ? (x.a.avg / scopeAvg - 1) * 100 : 0;
      return ({ reg:h(x.c.reg), cls:h(x.c.sub), wt:x.c.wts.filter(w => st.wts.has(w)).map(w => `<span class="s-wt">${WT_S[w]}</span>`).join(''), heads:x.a.heads.toLocaleString(),
        base:fmt(x.a.base), fixed:fmt(x.a.fixed), perf:fmt(x.a.perf), cmp:`<span style="color:var(--m)">${fmt(x.p.avg)}</span>`, avg:`<b>${fmt(x.a.avg)}</b>`,
        yoy:`<span class="${x.yoy >= 0 ? 's-up' : 's-dn'}">${pctS(x.yoy)}</span>`,
        margin:x.margin == null ? '–' : `<span class="s-soft ${x.margin < 2 ? 'sr' : x.margin < 4 ? 'so' : 'sx'}">${x.margin >= 0 ? '+' : ''}${x.margin}%</span>`, rank:`${x.rank} / ${ranked.length}`, dev:devBar(d / 100) })[k];
    };
    $('sList').innerHTML = `<thead><tr>${th('name', '센터')}<th>상태</th>${C.map(([k, l]) => k === 'wt' ? `<th>${l}</th>` : th(k, head(k), numK.has(k) ? 'r' : '')).join('')}</tr></thead>
    <tbody>${shown.map(x => { const d = x.a.avg && scopeAvg ? (x.a.avg / scopeAvg - 1) * 100 : 0, s = x.live ? statusOf(d) : [`${x.lastY}년 이후 갱신 없음`, K('s-line')];
      return `<tr class="${x.live ? '' : 'closed'}"><td><button type="button" class="s-cname" data-rep="${h(x.c.center)}" title="이 센터 보고서 만들기">${h(x.c.center)}</button></td><td><span class="s-st" style="border-color:${s[1]}">${s[0]}</span></td>${C.map(([k]) => `<td class="${numK.has(k) ? 'r' : ''}">${cell(k, x)}</td>`).join('')}</tr>`; }).join('')
      || `<tr><td colspan="20" class="s-empty">조건에 맞는 센터가 없습니다. 왼쪽 분류·근무유형 선택을 확인해 주세요.</td></tr>`}</tbody>`;
    $('sPager').innerHTML = `<span>${items.length ? `${st.page * st.pageSize + 1}–${Math.min(items.length, (st.page + 1) * st.pageSize)}` : 0} / ${items.length}개 · 상태 기준: ${h(sc.name)} 평균 대비 ±3% / −7% · 센터명을 누르면 보고서로 이동</span>
      <span style="display:flex;gap:4px;flex-wrap:wrap">${pages > 1 ? `<button type="button" class="s-btn" data-pg="${st.page - 1}" ${st.page ? '' : 'disabled'}>이전</button>${Array.from({ length:pages }, (_, i) => `<button type="button" class="s-btn ${i === st.page ? 'pri' : ''}" data-pg="${i}">${i + 1}</button>`).join('')}<button type="button" class="s-btn" data-pg="${st.page + 1}" ${st.page < pages - 1 ? '' : 'disabled'}>다음</button>` : ''}</span>`;
    $('sColpick').innerHTML = `<h5>표시할 열 (CSV에도 반영)</h5>${COLS.map(([k, l]) => `<div class="row" data-col="${k}"><span class="s-cb ${st.cols.has(k) ? 'on' : ''}"></span>${l}</div>`).join('')}`;
  }

  /* ---------- 교차표 ---------- */
  function renderHeat(){
    const ax = st.dim === 'reg' ? { key:'zone', label:'권역', opts:Object.keys(ZONES).concat(['미지정']) } : clsAxis();
    const yr = yearOf(D.ROWS.filter(r => inJob(r) && inReg(r) && (ax.key === 'zone' ? inCls(r) : !ax.ind || r.ind === ax.ind)), st.year);
    $('sHmTitle').innerHTML = `${h(ax.label)} × 근무유형 (${st.year}, 인당 ${unitL()}) <span class="s-soft sx">${h(jobL())}</span>`;
    const rgb = K('heat');
    const cell = (rs, w) => { const a = agg(rs); if(!a.n) return '<td class="nx">–</td>';
      if(a.n < MIN_N) return `<td class="na">${fmt(a.avg)}<small>${a.n}개</small></td>`;
      const dv = a.avg / agg(yr.filter(r => r.wt === w)).avg - 1, t = Math.min(1, Math.abs(dv) / 0.12);
      const bg = Math.abs(dv) < 0.015 ? K('soft') : dv > 0 ? `rgba(${rgb},${t * .3})` : `rgba(254,46,54,${t * .3})`;
      return `<td style="background:${bg}">${fmt(a.avg)}<small>${a.n}개</small></td>`; };
    const opts = ax.opts.filter(o => yr.some(r => r[ax.key] === o));
    $('sHm').innerHTML = `<thead><tr><th>${h(ax.label)}</th>${WT.map(w => `<th>${w}</th>`).join('')}</tr></thead><tbody>${
      opts.map(o => `<tr><td>${h(o)}</td>${WT.map(w => cell(yr.filter(r => r[ax.key] === o && r.wt === w), w)).join('')}</tr>`).join('') || `<tr><td colspan="5" class="s-empty">기준 연도 자료가 없습니다.</td></tr>`}</tbody>`;
  }

  /* ---------- 견적 대비 (센터별 초과 설계) ---------- */
  function quoteItems(){
    return D.CENTERS.filter(c => (!st.subs.size || st.subs.has(c.sub)) && (!st.reg || c.reg === st.reg)).map(c => {
      const s = D.PICK.get(c.center + '|' + st.year), q = s && s.quote;
      if(!q || !(q.received > 0) || q.incomplete) return null;
      const ps = D.PICK.get(c.center + '|' + st.cmp), pq = ps && ps.quote;
      return { c, s, q, prev: pq && pq.received > 0 ? pq.rate : null };
    }).filter(Boolean).sort((a, b) => b.q.rate - a.q.rate);
  }
  const qStatus = r => r > 5 ? ['초과 주의', 'sr'] : r > 0 ? ['초과', 'so'] : ['여유', 'sx'];
  function rateBar(r){
    const w = Math.min(50, Math.abs(r) / 10 * 50);
    return `<div class="s-bar"><b></b><i style="left:${r >= 0 ? 50 : 50 - w}%;width:${w}%;background:${r > 0 ? K('red') : K('g2')}"></i></div><div class="s-dv">${r > 0 ? '+' : ''}${r.toFixed(1)}%</div>`;
  }
  const fmtS = v => v == null ? '–' : `${v > 0 ? '+' : ''}${fmt(v)}`;
  function renderQuote(){
    const items = quoteItems(), sc = scope(), over = items.filter(x => x.q.rate > 0);
    const skipped = D.CENTERS.filter(c => { const s = D.PICK.get(c.center + '|' + st.year); return s && s.quote && s.quote.incomplete && (!st.subs.size || st.subs.has(c.sub)) && (!st.reg || c.reg === st.reg); }).length;
    const avg = items.length ? items.reduce((a, x) => a + x.q.rate, 0) / items.length : null;
    $('sQTitle').innerHTML = `${h(sc.name)} 견적 대비 직접인건비 (${st.year}, ${unitL()}) <span class="s-soft sk">분석 ${items.length}곳</span><span class="s-soft sr">초과 ${over.length}곳</span>${avg != null ? `<span class="s-soft sx">평균 ${avg > 0 ? '+' : ''}${avg.toFixed(1)}%</span>` : ''}${over.length ? `<span class="s-soft so">최대 ${h(over[0].c.center)} +${over[0].q.rate.toFixed(1)}%</span>` : ''}${skipped ? `<span class="s-soft sx" title="인원·업적수당 입력이 빠진 채 저장되어 제외">입력 누락 제외 ${skipped}곳</span>` : ''}`;
    $('sQuote').innerHTML = `<thead><tr><th class="r">순위</th><th>센터</th><th>분류</th><th>지역</th><th class="r">받는 직접인건비</th><th class="r">급여설계 직접인건비</th><th class="r">차이</th><th>초과율</th><th class="r">${st.cmp || '비교'} 초과율</th><th>판정</th><th>메모</th></tr></thead><tbody>${
      items.map((x, i) => { const s = qStatus(x.q.rate), m = memosOf(x.c.center)[0];
        return `<tr><td class="r">${i + 1}</td><td><button type="button" class="s-cname" data-rep="${h(x.c.center)}" title="이 센터 보고서 만들기">${h(x.c.center)}</button></td>
          <td>${h(x.c.ind)} › ${h(x.c.sub)}</td><td>${h(x.c.reg)}</td><td class="r">${fmt(x.q.received)}</td><td class="r">${fmt(x.q.paid)}</td>
          <td class="r ${x.q.gap > 0 ? 's-dn' : ''}">${fmtS(x.q.gap)}</td><td style="width:150px">${rateBar(x.q.rate)}</td><td class="r" style="color:var(--m)">${x.prev == null ? '–' : `${x.prev > 0 ? '+' : ''}${x.prev.toFixed(1)}%`}</td>
          <td><span class="s-soft ${s[1]}">${s[0]}</span></td>
          <td class="s-memo-cell"><button type="button" class="s-memo-btn" data-memo="${h(x.c.center)}">${m ? `<span class="s-wt">${h(m.cat)}</span>${h(m.text.length > 22 ? m.text.slice(0, 22) + '…' : m.text)}` : '<span style="color:var(--f)">+ 메모</span>'}</button></td></tr>`; }).join('')
      || `<tr><td colspan="11" class="s-empty">${st.year}년에 견적 대비 정보가 저장된 센터가 없습니다. 견적서 시트가 있는 급여테이블을 올려 [통계에 저장]하면 쌓입니다.</td></tr>`}</tbody>`;
    const byInd = D.IND.map(i => { const xs = items.filter(x => x.c.ind === i); if(!xs.length) return null;
      const rec = xs.reduce((a, x) => a + x.q.received, 0), paid = xs.reduce((a, x) => a + x.q.paid, 0);
      return { i, n:xs.length, over:xs.filter(x => x.q.rate > 0).length, avg:xs.reduce((a, x) => a + x.q.rate, 0) / xs.length, tot:(paid / rec - 1) * 100, gap:(paid - rec) / xs.length }; }).filter(Boolean).sort((a, b) => b.avg - a.avg);
    $('sQuoteInd').innerHTML = `<thead><tr><th>산업군</th><th class="r">센터</th><th class="r">초과 센터</th><th class="r">평균 초과율</th><th class="r">합계 기준 초과율</th><th class="r">센터당 평균 차이</th></tr></thead><tbody>${
      byInd.map(x => `<tr class="${x.n < MIN_N ? 'thin' : ''}"><td>${h(x.i)}${x.n < MIN_N ? ' <span class="s-soft sx">표본 부족</span>' : ''}</td><td class="r">${x.n}</td><td class="r">${x.over}</td><td class="r ${x.avg > 0 ? 's-dn' : ''}">${x.avg > 0 ? '+' : ''}${x.avg.toFixed(1)}%</td><td class="r">${x.tot > 0 ? '+' : ''}${x.tot.toFixed(1)}%</td><td class="r">${fmtS(x.gap)}</td></tr>`).join('')
      || '<tr><td colspan="6" class="s-empty">자료 없음</td></tr>'}</tbody>`;
  }

  /* ---------- 센터 메모 (사유 기록) — 이 PC + 공유 폴더 04_스냅샷/메모 에 1건씩 저장 ---------- */
  let MEMOS = [];
  const memoCats = () => SETTINGS.memoCats || ['최저임금 인상 선반영', '재계약 대비 인상', '인력 유지·채용난', '고객사 요청', '기타'];
  const memosOf = c => MEMOS.filter(m => m.center === c).sort((a, b) => b.at.localeCompare(a.at));
  async function memoDir(){
    const x = V2X(); if(!x.shareDir || !(await x.perm(x.shareDir, false))) return null;
    try{ return await (await x.sub(x.SUB.snap, true)).getDirectoryHandle('메모', { create:true }); }catch(e){ return null; }
  }
  async function loadMemos(){
    const x = V2X(); const local = (await x.kvGet('centerMemos')) || [], map = new Map(local.map(m => [m.id, m]));
    const dir = await memoDir();
    if(dir){
      try{ for await (const e of dir.values()){
        if(e.kind !== 'file' || !/\.json$/i.test(e.name)) continue;
        try{ const m = JSON.parse((await (await e.getFile()).text()).replace(/^﻿/, '')); if(m.kind === 'PAYMEMO' && m.id) map.set(m.id, m); }catch(err){}
      } }catch(err){}
    }
    MEMOS = [...map.values()].filter(m => !m.deleted);
    x.kvSet('centerMemos', [...map.values()]);
  }
  async function addMemo({ center, period, cat, text }){
    const x = V2X(), prof = x.profile;
    const m = { kind:'PAYMEMO', v:1, id:`memo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, center, period: period || '', cat, text, at:new Date().toISOString(), by: prof ? prof.name : '' };
    const all = (await x.kvGet('centerMemos')) || []; all.push(m); await x.kvSet('centerMemos', all); MEMOS.push(m);
    const dir = await memoDir(); let filed = false;
    if(dir){ try{ await x.writeFile(dir, m.id + '.json', JSON.stringify(m)); filed = true; }catch(e){} }
    return filed;
  }
  window.__v2memo = { add: addMemo, load: loadMemos, of: memosOf };
  document.body.insertAdjacentHTML('beforeend', `<div class="v2-memo" id="sMemo" hidden><div class="v2-memo-box" role="dialog" aria-modal="true" aria-labelledby="sMemoTitle">
    <div class="v2-memo-h"><b id="sMemoTitle"></b><button type="button" class="btn-ghost btn-sm" id="sMemoClose">닫기</button></div>
    <div class="v2-memo-q" id="sMemoQ"></div>
    <div class="v2-memo-form"><select id="sMemoCat"></select><textarea id="sMemoText" rows="3" placeholder="초과(또는 여유) 설계 사유를 적어 주세요"></textarea>
      <div class="btn-row"><span class="hint" id="sMemoMsg"></span><button type="button" class="btn-primary btn-sm" id="sMemoSave">메모 저장</button></div></div>
    <ul class="v2-memo-list" id="sMemoList"></ul></div></div>`);
  let memoCenter = '';
  function openMemo(center){
    memoCenter = center;
    const s = D.PICK.get(center + '|' + st.year), q = s && s.quote;
    $('sMemoTitle').textContent = `${center} · 메모`;
    $('sMemoQ').innerHTML = q ? `${st.year}년 받는 직접인건비 월 ${Math.round(q.received).toLocaleString()}원 · 급여설계 ${Math.round(q.paid).toLocaleString()}원 · <b>${q.gap > 0 ? '초과' : '여유'} ${Math.abs(Math.round(q.gap)).toLocaleString()}원 (${q.rate > 0 ? '+' : ''}${q.rate.toFixed(1)}%)</b>` : '';
    $('sMemoCat').innerHTML = memoCats().map(c => `<option>${h(c)}</option>`).join('');
    $('sMemoText').value = ''; $('sMemoMsg').textContent = '';
    drawMemoList(); $('sMemo').hidden = false; $('sMemoText').focus();
  }
  function drawMemoList(){
    const list = memosOf(memoCenter);
    $('sMemoList').innerHTML = list.map(m => `<li><div><span class="s-wt">${h(m.cat)}</span><small>${h(m.at.slice(0, 10))}${m.period ? ` · ${h(m.period)}` : ''}${m.by ? ` · ${h(m.by)}` : ''}</small></div><p>${h(m.text)}</p></li>`).join('') || '<li class="empty">아직 메모가 없습니다.</li>';
  }
  $('sMemoClose').onclick = () => { $('sMemo').hidden = true; };
  $('sMemo').addEventListener('click', e => { if(e.target.id === 'sMemo') $('sMemo').hidden = true; });
  document.addEventListener('keydown', e => { if(e.key === 'Escape' && !$('sMemo').hidden) $('sMemo').hidden = true; });
  $('sMemoSave').onclick = async () => {
    const text = $('sMemoText').value.trim(); if(!text){ $('sMemoMsg').textContent = '내용을 적어 주세요.'; return; }
    const s = D.PICK.get(memoCenter + '|' + st.year);
    const filed = await addMemo({ center:memoCenter, period: s ? s.period : String(st.year), cat:$('sMemoCat').value, text });
    $('sMemoText').value = ''; $('sMemoMsg').textContent = filed ? '저장했습니다 (공유 폴더에도 기록).' : '저장했습니다 (이 PC에만 · 공유 폴더 연결 시 함께 기록).';
    drawMemoList(); render();
  };
  $('sQuote').onclick = e => {
    const mb = e.target.closest('[data-memo]'); if(mb){ openMemo(mb.dataset.memo); return; }
    const rep = e.target.closest('[data-rep]'); if(rep){ reportState.center = rep.dataset.rep; switchAppTab('report'); }
  };

  /* ---------- 이벤트 ---------- */
  const pickCls = name => {
    st.page = 0;
    const sc = scope();
    if(!name || (sc.path.length === 1 && sc.ind === name) || (st.subs.size === 1 && st.subs.has(name))){
      if(name && D.SUB_IND[name]) st.subs = new Set(D.TREE[D.SUB_IND[name]]); else st.subs.clear();
    }
    else if(D.TREE[name]){ st.subs = new Set(D.TREE[name]); st.open.add(name); }
    else if(D.SUB_IND[name]){ st.subs = new Set([name]); st.open.add(D.SUB_IND[name]); }
    render();
  };
  $('sJob').onclick = e => { const b = e.target.closest('[data-j]'); if(b){ st.job = b.dataset.j; st.page = 0; render(); } };
  $('sYears').onclick = e => { const b = e.target.closest('button[data-y]'); if(!b) return; const y = +b.dataset.y;
    if(e.shiftKey){ if(y < st.year) st.cmp = y; } else { st.year = y; st.cmp = null; } render(); };
  $('sTree').onclick = e => {
    const tg = e.target.closest('[data-tog]'); if(tg){ const i = tg.dataset.tog; st.open.has(i) ? st.open.delete(i) : st.open.add(i); renderPanel(); return; }
    const r = e.target.closest('.row'); if(!r) return; st.page = 0;
    if(r.dataset.sub){ const s = r.dataset.sub; st.subs.has(s) ? st.subs.delete(s) : st.subs.add(s); }
    else { const subs = D.TREE[r.dataset.ind], all = subs.every(s => st.subs.has(s)); subs.forEach(s => all ? st.subs.delete(s) : st.subs.add(s)); st.open.add(r.dataset.ind); }
    render();
  };
  $('sClear').onclick = () => { st.subs.clear(); render(); };
  $('sWt').onclick = e => { const b = e.target.closest('[data-wt]'); if(!b) return; const w = b.dataset.wt;
    if(st.wts.has(w) && st.wts.size === 1) return; st.wts.has(w) ? st.wts.delete(w) : st.wts.add(w); st.page = 0; render(); };
  $('sReg').onchange = e => { st.reg = e.target.value; st.page = 0; render(); };
  $('sCrumb').onclick = e => { const a = e.target.closest('[data-go]'); if(!a) return; if(!a.dataset.go) st.subs.clear(); else st.subs = new Set(D.TREE[a.dataset.go] || []); render(); };
  ['sGrid', 'sPivot'].forEach(id => { $(id).onclick = e => { const t = e.target.closest('[data-pick]'); if(t && t.dataset.pick) pickCls(t.dataset.pick); }; });
  const seg = (id, key) => $(id).onclick = e => { const b = e.target.closest('button'); if(!b) return;
    [...$(id).children].forEach(x => x.classList.toggle('on', x === b)); st[key] = b.dataset.u || b.dataset.d; render(); };
  seg('sUnit', 'unit'); seg('sDim', 'dim');
  $('sTabs').onclick = e => { const b = e.target.closest('button'); if(!b) return; st.tab = b.dataset.t;
    [...$('sTabs').children].forEach(x => x.classList.toggle('on', x === b)); render(); };
  $('sQ').oninput = e => { st.q = e.target.value.trim(); st.page = 0; render(); };
  $('sClosed').onchange = e => { st.closed = e.target.checked; render(); };
  $('sPageSize').onchange = e => { st.pageSize = +e.target.value; st.page = 0; render(); };
  $('sPager').onclick = e => { const b = e.target.closest('[data-pg]'); if(b && !b.disabled){ st.page = +b.dataset.pg; render(); } };
  $('sList').onclick = e => {
    const rep = e.target.closest('[data-rep]');
    if(rep){ reportState.center = rep.dataset.rep; switchAppTab('report'); return; }
    const t = e.target.closest('[data-sort]'); if(!t) return; const k = t.dataset.sort;
    if(st.sortKey === k) st.sortDir *= -1; else { st.sortKey = k; st.sortDir = ['name', 'reg', 'cls', 'rank'].includes(k) ? 1 : -1; } render(); };
  $('sColBtn').onclick = e => { e.stopPropagation(); $('sColpick').hidden = !$('sColpick').hidden; };
  $('sColpick').onclick = e => { e.stopPropagation(); const r = e.target.closest('[data-col]'); if(!r) return; const k = r.dataset.col; st.cols.has(k) ? st.cols.delete(k) : st.cols.add(k); render(); $('sColpick').hidden = false; };
  document.addEventListener('click', () => { $('sColpick').hidden = true; });

  /* ---------- 내보내기 (이 PC로 내려받기만 함) ---------- */
  const saveAs = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
  function listAoa(){
    const { items, sc } = centerItems(), C = COLS.filter(([k]) => st.cols.has(k) && k !== 'dev');
    const scopeAvg = agg(yearOf(scoped(), st.year)).avg;
    const R = v => v == null ? null : Math.round(v);
    const v = (k, x) => ({ reg:x.c.reg, cls:`${x.c.ind} > ${x.c.sub}`, wt:x.c.wts.map(w => WT_S[w]).join('·'), heads:x.a.heads || null,
      base:R(x.a.base), fixed:R(x.a.fixed), perf:R(x.a.perf), cmp:R(x.live ? x.p.avg : x.last.avg), avg:R(x.a.avg),
      yoy:x.yoy == null ? null : +(x.yoy / 100).toFixed(4), margin:x.margin == null ? null : x.margin / 100, rank:x.rank || null })[k];
    return [['센터', '운영 상태', ...C.map(([k, l]) => ({ cmp:`${st.cmp || '비교'} 인당 월 총임금`, avg:`${st.year} 인당 월 총임금`, yoy:`인상률` })[k] || l), `${st.year} 인당 연 총임금`, `${sc.name} 평균 대비`],
      ...items.map(x => [x.c.center, x.live ? '운영 중' : `${x.lastY}년 이후 갱신 없음`, ...C.map(([k]) => v(k, x)), x.a.avg ? Math.round(x.a.avg * 12) : null, x.a.avg && scopeAvg ? +(x.a.avg / scopeAvg - 1).toFixed(4) : null])];
  }
  const fileTag = () => `${jobL()}_${scope().name}_${st.year}`.replace(/[\\/:*?"<>|\s]+/g, '_');
  const filterText = () => `필터: 직군 ${jobL()} / 분류 ${scope().name} / 근무유형 ${st.wts.size === WT.length ? '전체' : [...st.wts].map(w => WT_S[w]).join('·')} / 지역 ${st.reg || '전체'} / 기준 ${st.year}${st.cmp ? ` · 비교 ${st.cmp}` : ''}`;
  $('sCsv').onclick = () => {
    const csv = '﻿' + listAoa().map(r => r.map(v => v == null ? '' : /[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v).join(',')).join('\r\n');
    saveAs(new Blob([csv], { type:'text/csv' }), `센터목록_${fileTag()}.csv`);
  };
  $('sXls').onclick = () => {
    const wb = XLSX.utils.book_new(), filt = filterText(), Y = D.YEARS, yh = Y.flatMap(y => [`${y} 센터`, `${y} 직무`, `${y} 월 평균`]);
    const sheet = (name, title, head, body, wch) => { const ws = XLSX.utils.aoa_to_sheet([[title], [filt], [], head, ...body]); ws['!cols'] = head.map((_, i) => ({ wch:i < (wch || 1) ? 18 : 12 })); XLSX.utils.book_append_sheet(wb, ws, name); };
    const R = v => v == null ? null : Math.round(v);
    const yc = rs => { const ys = Y.map(y => agg(yearOf(rs, y))); return ys.some(a => a.n) ? ys.flatMap(a => [a.n || null, a.heads || null, R(a.avg)]) : null; };
    const clsRows = scoped(['cls']);
    const sumRow = (lv1, lv2, rs) => { const c = agg(yearOf(rs, st.year)), p = agg(yearOf(rs, st.cmp)); if(!c.n && !p.n) return null;
      return [lv1, lv2, c.n, c.heads, R(c.base), R(c.fixed), R(c.perf), R(p.avg), R(c.avg), c.avg && Math.round(c.avg * 12), p.avg && c.avg ? +(c.avg / p.avg - 1).toFixed(4) : null]; };
    sheet('산업군·세부유형', `산업군·세부유형별 인당 평균 총임금 — ${st.year} (원)`, ['산업군', '세부유형', '센터', '직무', '기준급여 소계(월)', '고정 수당(월)', '업적수당(월)', `${st.cmp || '비교'} 월 총임금`, `${st.year} 월 총임금`, `${st.year} 연 총임금`, '인상률'],
      [sumRow('전체 산업', '', clsRows), ...D.IND.flatMap(i => [sumRow(i, '(소계)', clsRows.filter(r => r.ind === i)), ...D.TREE[i].map(s => sumRow(i, s, clsRows.filter(r => r.sub === s)))])].filter(Boolean), 2);
    sheet('산업군별 연도', '인당 평균 월 총임금 — 산업군별 연도 추이 (원)', ['산업군', ...yh], D.IND.map(i => { const v = yc(clsRows.filter(r => r.ind === i)); return v && [i, ...v]; }).filter(Boolean));
    sheet('지역별 연도', '인당 평균 월 총임금 — 지역별 연도 추이 (원)', ['지역', ...yh], D.REGS.map(g => { const v = yc(scoped(['reg']).filter(r => r.reg === g)); return v && [g, ...v]; }).filter(Boolean));
    sheet('근무유형별 연도', '인당 평균 월 총임금 — 근무유형별 연도 추이 (원)', ['근무유형', ...yh], WT.map(w => { const v = yc(scoped(['wt']).filter(r => r.wt === w)); return v && [w, ...v]; }).filter(Boolean));
    const jr = ['상담사', '관리자'].map(j => { const rs = D.ROWS.filter(r => r.job === j && inCls(r) && inWt(r) && inReg(r)), c = agg(yearOf(rs, st.year)), p = agg(yearOf(rs, st.cmp));
      return [j, c.n, c.heads, R(p.avg), R(c.avg), c.avg && Math.round(c.avg * 12), p.avg && c.avg ? +(c.avg / p.avg - 1).toFixed(4) : null]; });
    sheet('직군 비교', `직군별 인당 평균 총임금 — ${scope().name} ${st.year} (원)`, ['직군', '센터', '직무', `${st.cmp || '비교'} 월`, `${st.year} 월`, `${st.year} 연`, '인상률'], jr);
    const ax = clsAxis(), yr = yearOf(D.ROWS.filter(r => inJob(r) && inReg(r) && (!ax.ind || r.ind === ax.ind)), st.year);
    sheet('교차표', `${ax.label} × 근무유형 — ${st.year} 인당 평균 월 총임금 (원)`, [ax.label, ...WT], ax.opts.map(o => [o, ...WT.map(w => { const a = agg(yr.filter(r => r[ax.key] === o && r.wt === w)); return a.n ? Math.round(a.avg) : null; })]));
    const qi = quoteItems();
    sheet('견적 대비', `견적 대비 직접인건비 — ${scope().name} ${st.year} (월, 원)`, ['순위', '센터', '산업군', '세부유형', '지역', '받는 직접인건비', '급여설계 직접인건비', '차이(설계−받는)', '초과율', '판정', '받는 금액 기준', '최근 메모 분류', '최근 메모'],
      qi.map((x, i) => { const m = memosOf(x.c.center)[0]; return [i + 1, x.c.center, x.c.ind, x.c.sub, x.c.reg, Math.round(x.q.received), Math.round(x.q.paid), Math.round(x.q.gap), +(x.q.rate / 100).toFixed(4), qStatus(x.q.rate)[0], x.q.recvSrc || '', m ? m.cat : '', m ? m.text : '']; }), 2);
    const mm = MEMOS.filter(m => qi.some(x => x.c.center === m.center) || D.CENTERS.some(c => c.center === m.center)).sort((a, b) => a.center.localeCompare(b.center) || b.at.localeCompare(a.at));
    if(mm.length) sheet('센터 메모', '센터 메모 (사유 기록)', ['센터', '적용 시점', '분류', '내용', '작성일', '작성자'], mm.map(m => [m.center, m.period, m.cat, m.text, m.at.slice(0, 10), m.by]), 2);
    const la = listAoa(); sheet('센터 목록', `${scope().name} 센터 목록 — ${st.year} (화면에 표시한 열 기준)`, la[0], la.slice(1), 2);
    const raw = XLSX.utils.json_to_sheet(D.ROWS.map(r => ({ 연도:r.year, 센터:r.center, 산업군:r.ind, 세부유형:r.sub, 지역:r.reg, 권역:r.zone, 근무유형:r.wt, 직군:r.job, 직무:r.jobName, 기준급여소계:r.base, 고정수당:r.fixed, B등급업적수당:r.perf, 인당월총임금:r.monthly, 인당연총임금:r.monthly * 12 })));
    raw['!autofilter'] = { ref:raw['!ref'] }; XLSX.utils.book_append_sheet(wb, raw, '센터별 원자료');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['항목', '정의'],
      ['인당 월 총임금', '월 보수 합계(기준급여 소계 + B등급 업적수당 + 고정 초과·야간·통신 수당)'], ['연 환산', '월 × 12 (상여·퇴직급여·법정부담금 제외)'],
      ['평균', '센터별 직무 평균(직무별 인원이 있으면 인원 가중)의 단순 평균 (센터마다 같은 비중)'], ['직군', '직무 블록이 리더그룹이면 관리자, 그 외 상담사'], ['근무유형', '직무별 기본급 수식의 월 소정시간으로 자동 분류(근무형태 답변이 교대·야간이면 교대·야간)'],
      ['산업군·세부유형', '통계 저장 때 고른 센터유형·세부유형 (기준정보 화면에서 목록 관리)'], ['최저임금 여유', '직무별 기본급 ÷ (그해 최저시급 × 소정시간) − 1 의 센터 내 최솟값'],
      ['견적 대비', '받는 직접인건비 = 견적대비 비교 시트의 월 보수 가용 범위(없으면 견적서 직접인건비 소계 × 인원 × (1 − 실비 청구 비율)) · 급여설계 직접인건비 = Σ 직무별 (통상임금 소계 + 초과근무수당) × 인원 + 업적수당(등급별 인원, 없으면 B등급, B등급 없음·0원이면 직접 입력) · 초과율 = 급여설계 ÷ 받는 − 1'],
      ['상태', '선택 범위 평균 대비 +3% 이상 평균 이상 / ±3% 평균 수준 / −7%까지 평균 미만 / 그 아래 점검 필요'],
      ['운영 중', '기준 연도에 저장된 급여테이블이 있는 센터'], ['표본 기준', `센터 ${MIN_N}개 미만 구분은 참고용`], ['생성 일시', new Date().toLocaleString('ko-KR')]]), '산출 기준');
    const out = XLSX.write(wb, { bookType:'xlsx', type:'array' });
    saveAs(new Blob([out], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `인건비_수준_통계_${fileTag()}.xlsx`);
  };

  /* ---------- 새 화면 / 이전 화면 전환 (이 PC에 기억) ---------- */
  const origRenderStats = renderStats;
  let oldUi = false;
  try{ oldUi = localStorage.getItem('paytable-stats-ui') === 'old'; }catch(e){}
  function applyUi(){
    pane.classList.toggle('v2-st-on', !oldUi);
    $('v2St').hidden = oldUi;
    let back = $('v2StBack');
    if(oldUi && !back){
      pane.insertAdjacentHTML('afterbegin', '<div id="v2StBack" style="margin-bottom:12px"><button type="button" class="btn-primary btn-sm">새 통계 화면으로 보기</button></div>');
      back = $('v2StBack'); back.onclick = () => setUi(false);
    }
    if(back) back.hidden = !oldUi;
  }
  function setUi(old){ oldUi = old; try{ localStorage.setItem('paytable-stats-ui', old ? 'old' : 'new'); }catch(e){} applyUi(); renderStats(); }
  $('sOld').onclick = () => setUi(true);
  let memoLoaded = false;
  renderStats = function(){ applyUi(); if(oldUi){ origRenderStats(); return; } render(); if(!memoLoaded){ memoLoaded = true; loadMemos().then(() => { if(!oldUi) render(); }); } };
  applyUi();
  PAGES.stats.sub = '저장된 급여 데이터로 산업군·세부유형·지역·근무유형별 인건비 수준을 비교합니다';

  /* ============================================================
     통계 저장: 세부유형·지역 선택 + 실제 양식 월 보수 합계 보정
     ============================================================ */
  const typeLabel = $('snapType').closest('label');
  typeLabel.insertAdjacentHTML('afterend', '<label>세부유형 <select id="v2SnapSub"></select></label><label>지역 <select id="v2SnapReg"></select></label>');
  function fillSnapMeta(){
    const center = $('snapCenter').value.trim(), meta = (SETTINGS.centerMeta || {})[center] || {}, ans = V2X().answers || {};
    const subs = industryTree()[$('snapType').value] || [];
    const curSub = $('v2SnapSub').value || meta.sub || '';
    $('v2SnapSub').innerHTML = '<option value="">선택</option>' + subs.map(s => `<option${s === curSub ? ' selected' : ''}>${h(s)}</option>`).join('');
    const reg = $('v2SnapReg').value || meta.region || ans.region || '';
    $('v2SnapReg').innerHTML = '<option value="">선택</option>' + REG.map(r => `<option${r === reg ? ' selected' : ''}>${r}</option>`).join('');
  }
  $('snapType').addEventListener('change', () => { $('v2SnapSub').value = ''; fillSnapMeta(); });
  $('snapCenter').addEventListener('change', () => { $('v2SnapSub').value = ''; $('v2SnapReg').value = ''; fillSnapMeta(); });
  const origRenderSnap = renderSnapPanel;
  renderSnapPanel = function(){ origRenderSnap(); if($('snapPanel').style.display !== 'none'){ $('v2SnapSub').value = ''; $('v2SnapReg').value = ''; fillSnapMeta(); } };

  const origBuild = buildSnapshot;
  buildSnapshot = function(meta){
    const rec = origBuild(meta);
    rec.subType = $('v2SnapSub').value || '';
    rec.region = $('v2SnapReg').value || (rec.answers && rec.answers.region) || '';
    SETTINGS.centerMeta = Object.assign({}, SETTINGS.centerMeta, { [rec.center]: { sub:rec.subType, region:rec.region } });
    const bh = V2X().baseHours;
    rec.jobs.forEach((j, i) => {
      const src = parsedData && parsedData.jobs[i];
      if(src && bh){ try{ j.wHours = bh(src); }catch(e){} }
      /* 정원·연간 직접인건비(정원기준) — 보고서의 '총 얼마 늘어나는지' 계산에 사용 */
      const ja = V2X().jobAnnual;
      if(src && ja){ try{ const a = ja(src); if(a){ j.annualCost = a.annual; j.heads = a.heads; } }catch(e){} }
      /* 실제 양식은 등급 행이 업적수당 금액 → 비교 금액은 월 보수 합계(B등급 기준)로 */
      if(typeof j.gradeB === 'number' && j.stdPaySum && j.gradeB < j.stdPaySum * 0.5){
        j.perf = j.gradeB;
      }
      /* 비교 금액·시급은 v2_report.js의 정의(월 보수 합계 / (소계+업적수당) ÷ 수식 시간수)로 저장 */
      if(window.__v2pay){ const p = window.__v2pay(j); j.compareMonthly = p.monthly; j.hourly = p.hourly; }
    });
    return rec;
  };

  /* ============================================================
     기준정보: 산업군 · 세부유형 목록 편집
     ============================================================ */
  const setGrid = document.querySelector('#tabSettings .set-grid');
  if(setGrid){
    setGrid.insertAdjacentHTML('afterbegin', `<div class="panel v2-industry" style="grid-column:1/-1">
      <div class="ph"><h2>산업군 · 세부유형 · 메모 분류</h2><button type="button" class="btn-primary btn-sm" id="v2IndSave">저장</button></div>
      <p class="hint">한 줄에 산업군 하나: <b>산업군: 세부유형, 세부유형, …</b> · 산업군은 센터유형과 같은 목록입니다(새 산업군을 적으면 센터유형에도 추가). 모든 사용자에게 적용하려면 저장 후 [모든 사용자에게 적용]을 눌러 주세요.</p>
      <textarea id="v2IndText" spellcheck="false"></textarea>
      <label class="flabel" style="display:block;margin-top:10px">센터 메모 사유 분류 (쉼표로 구분) <input type="text" id="v2MemoCats" style="width:100%"></label><span class="hint" id="v2IndMsg"></span></div>`);
    const fillInd = () => { const t = industryTree(); $('v2IndText').value = Object.entries(t).map(([k, v]) => `${k}: ${v.join(', ')}`).join('\n'); $('v2MemoCats').value = memoCats().join(', '); };
    $('v2IndSave').onclick = async () => {
      const tree = {};
      $('v2IndText').value.split('\n').forEach(line => {
        const m = line.match(/^\s*([^:：]+?)\s*[:：]\s*(.*)$/); if(!m) return;
        tree[m[1]] = [...new Set(m[2].split(/[,，]/).map(s => s.trim()).filter(Boolean))];
      });
      if(!Object.keys(tree).length){ $('v2IndMsg').textContent = '형식을 확인해 주세요. 예) 금융: 보험, 은행, 카드'; return; }
      SETTINGS.industryTree = tree;
      const cats = [...new Set($('v2MemoCats').value.split(/[,，]/).map(x => x.trim()).filter(Boolean))];
      if(cats.length) SETTINGS.memoCats = cats;
      Object.keys(tree).forEach(k => { if(!SETTINGS.centerTypes.includes(k)) SETTINGS.centerTypes.push(k); });
      await saveSettings();
      $('v2IndMsg').textContent = `저장했습니다 · 산업군 ${Object.keys(tree).length}개`;
      fillInd();
    };
    fillInd();
    const origSwitch = switchAppTab;
    switchAppTab = function(t){ origSwitch.apply(this, arguments); if(t === 'settings') fillInd(); };
  }
})();

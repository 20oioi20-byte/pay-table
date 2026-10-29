/* ============================================================
   인건비 분석 보고서 (v2 전용 — v1 index.html은 그대로 둠)
   · 2쪽 구성: 1쪽 단가 인상 요청(핵심) / 2쪽 참고 자료
   · 금액: 급여테이블의 '전체 연간 인건비 합계(정원기준)' = 직접인건비
           직접인건비 인상 → 법정부담·관리비·이윤 연동, 고정 경비는 그대로 → 계약금액·단가 인상률
   · 시급·비교 금액
        월 총임금 = 기준급여 소계 + B등급 업적수당 + 고정 초과·야간·통신 (= '월 보수 합계')
        환산 시급 = (기준급여 소계 + B등급 업적수당) ÷ 월 소정시간(기본급 수식의 시간수)
     (예전 계산은 실제 양식의 등급 행 = 업적수당 금액을 209로 나눠 시급이 3천원대로 나왔음)
   · Word: 차트를 PNG 파트로 넣은 MHTML(.doc) + 화면 스타일을 요소마다 직접 넣어 같은 모양으로 저장
   ============================================================ */
(() => {
  const $ = id => document.getElementById(id);
  const num = v => typeof v === 'number' && isFinite(v) ? v : 0;
  /* 최저시급(고용노동부 고시) */
  const MWY = { 2019:8350, 2020:8590, 2021:8720, 2022:9160, 2023:9620, 2024:9860, 2025:10030, 2026:10320 };
  const mwOf = y => (SETTINGS.minWageByYear || {})[y] || MWY[y] || SETTINGS.minWageHourly;
  const mwRate = y => mwOf(y - 1) ? mwOf(y) / mwOf(y - 1) - 1 : null;
  const mwAvg3 = y => mean([0, 1, 2].map(i => mwRate(y - i)));

  /* ---------- 직무 1건의 금액 ---------- */
  function payOf(j){
    const base = num(j.stdPaySum) || num(j.fixedPay);
    const extras = num(j.overtime) + num(j.night) + num(j.telecom);
    const gB = typeof j.gradeB === 'number' ? j.gradeB : null;
    let monthly, hourPay;
    if(gB != null && gB < base * 0.5){            // 실제 양식: 등급 행 = 업적수당 금액
      monthly = num(j.monthlyTotal) || base + gB + extras;
      hourPay = base + gB;
    } else if(gB != null){                         // 등급 행이 B등급 월 급여(총액)인 양식
      monthly = Math.max(num(j.monthlyTotal), gB);
      hourPay = gB;
    } else {
      const perf = num(j.perf);
      monthly = num(j.monthlyTotal) || base + perf + extras;
      hourPay = base + perf;
    }
    const hours = num(j.wHours) || num(j.hours) || hoursOf(j.laborType);
    return { monthly, hourPay, hours, hourly: hourPay && hours ? hourPay / hours : null };
  }
  window.__v2pay = payOf;
  const groupOf = j => j.block === '리더그룹' || j.laborType === '관리자' ? '관리자' : '상담사';
  /* 정원: 급여테이블 정원(정원기준 연간 합계 ÷ 호칭별 연간) → 없으면 보고서에서 입력한 상담유형별 인원을 직무 수로 나눔 */
  function headsOf(snap, j){
    if(typeof j.heads === 'number') return j.heads;
    const same = snap.jobs.filter(x => x.laborType === j.laborType).length || 1;
    return num((snap.headcount || {})[j.laborType]) / same;
  }
  /* 급여테이블 연간 합계가 0인데 다른 시트(견적대비 비교)에 정원이 있으면 월 총임금 × 12 × 정원 */
  const annualOf = (snap, j) => typeof j.annualCost === 'number' && (j.annualCost > 0 || !headsOf(snap, j)) ? j.annualCost : payOf(j).monthly * 12 * headsOf(snap, j);
  /* 센터의 직군 평균 월 총임금(정원 가중, 정원이 없으면 단순 평균) */
  function groupPay(snap, g){
    const js = snap.jobs.filter(j => g === '전체' || groupOf(j) === g); if(!js.length) return null;
    const w = js.map(j => headsOf(snap, j)), ws = w.reduce((a, b) => a + b, 0);
    const avg = k => ws ? js.reduce((a, j, i) => a + payOf(j)[k] * w[i], 0) / ws : mean(js.map(j => payOf(j)[k]));
    return { monthly: avg('monthly'), hourly: avg('hourly'), heads: ws, annual: js.reduce((a, j) => a + annualOf(snap, j), 0) };
  }

  /* ---------- 견적서 전체(직접인건비 → 간접인건비 → 경비 → 일반관리비 → 기업이윤 → 부가세 → 총합계) ---------- */
  const normT = v => String(v ?? '').replace(/\s+/g, '');
  const numv = v => typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && /^-?[\d,]+(\.\d+)?$/.test(v.trim()) ? +v.replace(/,/g, '') : null;
  function parseEstimateFull(sheet){
    const V = sheet.values || [];
    let sub = null;
    for(let r = 0; r < V.length && !sub; r++) (V[r] || []).forEach((v, c) => { if(!sub && normT(v) === '직접인건비소계') sub = { r, c }; });
    if(!sub) return null;
    let head = null, sumCol = null;
    for(let r = sub.r - 1; r >= 0 && r >= sub.r - 15 && head == null; r--){ const k = (V[r] || []).findIndex((v, c) => c > sub.c && normT(v) === '계'); if(k > 0){ head = r; sumCol = k; } }
    if(head == null) return null;
    const roles = [];
    let rHeads = null;
    for(let r = head + 1; r < sub.r && rHeads == null; r++) if((V[r] || []).some((v, c) => c <= sub.c && /^인원/.test(normT(v)))) rHeads = r;
    for(let c = sub.c + 1; c < sumCol; c++){ const name = String(V[head][c] ?? '').trim(); if(name) roles.push({ name, c, heads: rHeads == null ? 0 : num(numv(V[rHeads][c])) }); }
    const rows = []; let section = 'direct';
    for(let r = (rHeads ?? head) + 1; r < V.length; r++){
      const row = V[r] || [], label = row.slice(0, sub.c + 1).map(normT).filter(x => x && numv(x) == null).join(' ');
      const vals = roles.map(x => numv(row[x.c])), any = vals.some(v => v != null) || numv(row[sumCol]) != null;
      const L = label.replace(/\s/g, '');
      let kind;
      if(/총합계/.test(L)) kind = 'total';
      else if(/직접인건비소계/.test(L)){ kind = 'directSum'; section = 'after'; }
      else if(section === 'direct') kind = 'direct';
      else if(/일반관리비/.test(L)) kind = 'mgmt';
      else if(/기업이윤|이윤/.test(L)) kind = 'profit';
      else if(/부가가치세|부가세|vat/i.test(L)) kind = 'vat';
      else if(/소계|합계|^계$/.test(L)) kind = 'skip';
      else if(/퇴직|충당|국민|연금|건강|고용|산재|장기요양|보험|연차|법정/.test(L)) kind = 'linked';
      else kind = 'fixed';
      if(!any && kind !== 'total') continue;
      const tot = numv(row[sumCol]) ?? roles.reduce((a, x, i) => a + num(vals[i]) * x.heads, 0);
      rows.push({ label: label.split(' ').pop() || '기타 항목', kind, vals, total: tot });
      if(kind === 'total') break;
    }
    return { sheet: sheet.name, roles: roles.map(({ name, heads }) => ({ name, heads })), rows };
  }
  /* 직접인건비를 r만큼 올렸을 때: 간접인건비(퇴직·4대보험 등)는 비례, 경비는 그대로, 관리비·이윤·부가세는 각자의 바탕 금액에 비례 */
  function estCalc(est, r, pick){
    const sum = k => est.rows.filter(x => x.kind === k).reduce((a, x) => a + num(pick(x)), 0);
    const dsum = est.rows.find(x => x.kind === 'directSum'), D = dsum ? num(pick(dsum)) : sum('direct');
    const now = { D, L: sum('linked'), F: sum('fixed'), M: sum('mgmt'), P: sum('profit'), V: sum('vat') };
    const base = now.D + now.L + now.F, base2 = base + now.M, sub = base2 + now.P;
    now.T = sub + now.V;
    const nx = { D: now.D * (1 + r), L: now.L * (1 + r), F: now.F };
    const b1 = nx.D + nx.L + nx.F; nx.M = base ? now.M * b1 / base : 0;
    const b2 = b1 + nx.M; nx.P = base2 ? now.P * b2 / base2 : 0;
    const s2 = b2 + nx.P; nx.V = sub ? now.V * s2 / sub : 0; nx.T = s2 + nx.V;
    const tot = est.rows.find(x => x.kind === 'total'), sheetT = tot ? num(pick(tot)) : null;
    return { now, next: nx, rate: now.T ? nx.T / now.T - 1 : 0, sheetT, diff: sheetT ? now.T / sheetT - 1 : null };
  }

  /* 저장된 스냅샷(메모리)의 비교 금액·시급을 새 정의로 맞춤 — 통계 화면용 */
  function normalize(){
    SNAPS.forEach(s => (s.jobs || []).forEach(j => { const p = payOf(j); j.compareMonthly = p.monthly; j.hourly = p.hourly; }));
  }
  centerValue = function(snap, lt){ return mean(snap.jobs.filter(j => j.laborType === lt).map(j => payOf(j).hourly)); };
  const origStats = renderStats;
  renderStats = function(){
    normalize(); origStats.apply(this, arguments);
    const el = $('statsCenterJobs'); if(el) el.innerHTML = el.innerHTML.split('비교 월액(B등급)').join('월 총임금');
  };

  const origBuildSnap = buildSnapshot;
  buildSnapshot = function(meta){
    const rec = origBuildSnap(meta);
    try{ const sh = (window.__v2 || {}).extraSheets; if(Array.isArray(sh)) for(const s of sh){ const e = parseEstimateFull(s); if(e){ rec.estimate = e; break; } } }catch(e){ console.error(e); }
    return rec;
  };

  /* ---------- 보고서 설정: 단가 산출 입력 ---------- */
  const priceOf = c => Object.assign({ mgmt:10, fixed:0 }, ((SETTINGS.centerMeta || {})[c] || {}).price);
  const tmp = { labor:'', mw:'' };   // 이번 보고서에만 쓰는 값(저장 안 함)
  $('repHeads').closest('.rep-heads').insertAdjacentHTML('beforebegin', `<div class="rep-price">
    <span class="flabel">단가 산출</span>
    <label>직접인건비 인상률 <input type="number" step="0.1" id="repLabor" placeholder="자동"> %</label>
    <label>내년 최저임금 전망 <input type="number" step="0.1" id="repMw"> %</label>
    <label>법정부담률 <input type="number" step="0.1" id="repBurden"> %</label>
    <label>관리비·이윤율 <input type="number" step="0.1" id="repMgmt"> %</label>
    <label>고정 경비(연) <input type="number" step="10" id="repFixed"> 만원</label>
    <span class="hint" id="repPriceHint"></span></div>`);
  $('repHeads').closest('.rep-heads').querySelector('.flabel').textContent = '정원 (급여테이블에 정원 행이 없을 때만 입력)';
  function fillPriceInputs(){
    const p = priceOf(reportState.center), y = +String(reportState.period || '').slice(0, 4) || new Date().getFullYear();
    $('repLabor').value = tmp.labor; $('repMw').value = tmp.mw !== '' ? tmp.mw : ((mwAvg3(y) || 0) * 100).toFixed(1);
    $('repBurden').value = SETTINGS.burdenRate; $('repMgmt').value = p.mgmt; $('repFixed').value = Math.round(p.fixed / 10000);
  }
  document.querySelector('.rep-price').addEventListener('change', async e => {
    const id = e.target.id, v = e.target.value;
    if(id === 'repLabor') tmp.labor = v;
    else if(id === 'repMw') tmp.mw = v;
    else if(id === 'repBurden'){ SETTINGS.burdenRate = +v || 0; await saveSettings(); }
    else if(id === 'repMgmt' || id === 'repFixed'){
      const c = reportState.center, p = priceOf(c);
      if(id === 'repMgmt') p.mgmt = +v || 0; else p.fixed = (+v || 0) * 10000;
      SETTINGS.centerMeta = Object.assign({}, SETTINGS.centerMeta, { [c]: Object.assign({}, (SETTINGS.centerMeta || {})[c], { price:p }) });
      await saveSettings();
    }
    renderReport();
  });
  const origControls = renderReportControls;
  renderReportControls = function(){ origControls.apply(this, arguments); fillPriceInputs(); };
  $('repCenter').addEventListener('change', () => { tmp.labor = ''; });

  /* ---------- 분석 ---------- */
  function analyze(){
    const period = reportState.period, snaps = latestAt(period), snap = snaps.find(s => s.center === reportState.center);
    if(!snap) return null;
    const y = +period.slice(0, 4), policy = $('repPolicy').value || SETTINGS.targetPolicy;
    const typeList = snaps.filter(s => s.centerType === snap.centerType);
    const subList = snap.subType ? typeList.filter(s => s.subType === snap.subType) : [];
    const levels = [{ key:'all', label:'전체 산업', list:snaps }, { key:'type', label:`산업군 ${snap.centerType}`, list:typeList }]
      .concat(subList.length >= 2 ? [{ key:'sub', label:`세부유형 ${snap.subType}`, list:subList }] : []);
    const mkt = g => median(SETTINGS.market.filter(m => (g === '관리자' ? m.laborType === '관리자' : m.laborType !== '관리자')).map(m => m.monthly));
    const groups = ['상담사', '관리자', '전체'].map(g => {
      const me = groupPay(snap, g); if(!me) return null;
      const lv = levels.map(L => { const v = L.list.map(s => groupPay(s, g)).filter(Boolean).map(x => x.monthly);
        return { ...L, n:v.length, med:median(v), p60:quantile(v, .6), gap: me.monthly / median(v) - 1 }; });
      const ref = lv.find(l => l.key === 'sub' && l.n >= 5) || lv.find(l => l.key === 'type');
      const mk = g === '전체' ? null : mkt(g);
      const tgt = { median:ref.med, p60:ref.p60, market:mk ?? ref.med, max:Math.max(ref.med, mk ?? 0) }[policy] ?? ref.med;
      return { g, me, lv, ref, mk, tgt, gap: Math.max(0, tgt / me.monthly - 1) };
    }).filter(Boolean);
    const m = (tmp.mw !== '' ? +tmp.mw : (mwAvg3(y) || 0) * 100) / 100;
    /* 필요 직접인건비 인상률 = 직군별 (1+최저임금 전망)(1+격차)−1 을 연간 인건비로 가중 */
    const work = groups.filter(x => x.g !== '전체');
    const costSum = work.reduce((a, x) => a + x.me.annual, 0);
    work.forEach(x => { x.need = (1 + m) * (1 + x.gap) - 1; });
    const wageNeed = costSum ? work.reduce((a, x) => a + x.me.annual * x.need, 0) / costSum : mean(work.map(x => x.need));
    /* 견적이 현재 급여도 못 덮으면(견적 대비 지급 초과) 그 부족분부터 메움 */
    const q = snap.quote, cost = q && q.received && q.paid > q.received ? q.paid / q.received - 1 : 0;
    const auto = (1 + cost) * (1 + wageNeed) - 1;
    const r = tmp.labor !== '' ? +tmp.labor / 100 : auto;
    /* 금액: 직접인건비 → 법정부담(연동) → 관리비·이윤(연동) → 고정 경비(그대로) */
    const pr = priceOf(snap.center), b = SETTINGS.burdenRate / 100, mg = pr.mgmt / 100;
    const D = snap.jobs.reduce((a, j) => a + annualOf(snap, j), 0);
    const calc = d => { const L = d * b, M = (d + L) * mg; return { D:d, L, M, E:pr.fixed, T:d + L + M + pr.fixed }; };
    let now = calc(D), next = calc(D * (1 + r)), est = null;
    if(snap.estimate && snap.estimate.rows.length){
      const E = snap.estimate, main = E.roles.reduce((a, x, i) => x.heads > (E.roles[a] || { heads:-1 }).heads ? i : a, 0);
      est = { all: estCalc(E, r, x => x.total), role: E.roles[main] ? { name: E.roles[main].name, heads: E.roles[main].heads, ...estCalc(E, r, x => x.vals[main]) } : null, sheet: E.sheet };
    }
    const cs = groups.find(x => x.g === '상담사');
    /* 연도별: 이 센터의 해마다 마지막 저장본 */
    const byY = new Map(); SNAPS.filter(s => s.center === snap.center && s.period <= period).forEach(s => { const k = +s.period.slice(0, 4), c = byY.get(k); if(!c || s.period > c.period || (s.period === c.period && s.version > c.version)) byY.set(k, s); });
    const yrs = [...byY.keys()].sort().slice(-6), trend = yrs.slice(1).map((yy, i) => { const a = groupPay(byY.get(yy), '상담사'), p = groupPay(byY.get(yrs[i]), '상담사'); return { y:yy, wage: a && p ? a.monthly / p.monthly - 1 : null, mw: mwRate(yy) }; });
    /* 인상하지 않으면: 내년 최저시급(전망) × 기본급 시간수 − 현재 기본급 = 1인 월 부족액 */
    const mwNext = mwOf(y) * (1 + m);
    const risk = snap.jobs.map(j => { const base = num((j.items || {})['기본급']), hrs = payOf(j).hours, need = mwNext * hrs, hd = headsOf(snap, j);
      return { name: j.name, heads: hd, base, need, short: Math.max(0, need - base), margin: base && need ? base / need - 1 : null }; })
      .filter(x => x.base && x.heads > 0);
    const riskTot = risk.reduce((a, x) => a + x.short * x.heads, 0);
    return { snap, snaps, y, policy, levels, groups, m, manualMw: tmp.mw !== '', auto, cost, wageNeed, r, mwNext, risk, riskTot, manual: tmp.labor !== '', now, next, est, rate: est ? est.all.rate : now.T ? next.T / now.T - 1 : 0, csHeads: cs ? cs.me.heads : 0, pr, b, mg, trend,
      hasHeads: snap.jobs.some(j => typeof j.heads === 'number') };
  }

  /* ---------- 표시 형식 ---------- */
  const w0 = v => v == null || !isFinite(v) ? '–' : Math.round(v).toLocaleString();
  const man = v => v == null || !isFinite(v) ? '–' : `${Math.round(v / 10000).toLocaleString()}만`;
  const eok = v => v == null || !isFinite(v) ? '–' : Math.abs(v) >= 1e8 ? `${(v / 1e8).toFixed(2)}억` : `${Math.round(v / 10000).toLocaleString()}만`;
  const pc = (v, d = 1) => v == null || !isFinite(v) ? '–' : `${v > 0 ? '+' : ''}${(v * 100).toFixed(d)}%`;
  const pc0 = (v, d = 1) => v == null || !isFinite(v) ? '–' : `${(v * 100).toFixed(d)}%`;
  const neg = v => v < 0 ? 'neg' : '';

  /* ============================================================
     1쪽: 결론 → 근거 3가지(사실·의미·출처) → 산출 논리 → 금액 변화
     문장은 짧게, 숫자는 모두 시스템 계산값, 데이터 상황에 따라 '의미' 문구가 바뀜
     ============================================================ */
  /* 결론 박스 */
  function askBox(A){
    const C = A.snap;
    if(A.est){
      const e = A.est.all, d = e.next.T - e.now.T, ro = A.est.role;
      return `<table class="ask"><tr><td class="al">요청 단가 인상률</td><td class="av">${pc0(e.rate, 2)}</td>
  <td class="ad">월 견적 총액 <b>${w0(e.now.T)}원 → ${w0(e.next.T)}원</b><br>월 <b class="hl">+${w0(d)}원</b> · 연 <b class="hl">+${w0(d * 12)}원</b>${ro ? `<br>${esc(ro.name)} 1인 월 단가 ${w0(ro.now.T)} → ${w0(ro.next.T)}원` : ''}</td></tr></table>`;
    }
    const N = A.now, X = A.next, per = A.csHeads ? [N.T / 12 / A.csHeads, X.T / 12 / A.csHeads] : null;
    return `<table class="ask"><tr><td class="al">요청 단가 인상률</td><td class="av">${pc0(A.rate, 2)}</td>
  <td class="ad">연간 계약금액 <b>${eok(N.T)}원 → ${eok(X.T)}원</b><br>연 <b class="hl">+${w0(X.T - N.T)}원</b> · 월 +${w0((X.T - N.T) / 12)}원${per ? `<br>상담사 1인 월 단가 ${w0(per[0])} → ${w0(per[1])}원` : ''}</td></tr></table>`;
  }

  /* 근거 3가지 */
  function reasons(A){
    const C = A.snap, cs = A.groups.find(x => x.g === '상담사') || A.groups[0], out = [];
    /* ① 법정 최저임금 */
    const short = A.risk.filter(x => x.short > 0), shortHeads = short.reduce((a, x) => a + x.heads, 0), maxShort = Math.max(0, ...short.map(x => x.short));
    const minM = A.risk.length ? Math.min(...A.risk.map(x => x.margin)) : null;
    out.push(short.length ? {
      t:'법정 최저임금', fact:`${A.y + 1}년 최저시급 전망 ${w0(A.mwNext)}원(${pc(A.m)}) 적용 시<br>기본급 미달 <b>${w0(shortHeads)}명</b> · 1인 최대 월 <b>${w0(maxShort)}원</b>`,
      mean:`인상이 없어도 <b>연 ${eok(A.riskTot * 12 * (1 + A.b))}원</b>(법정부담 포함) 지급 의무 발생`,
      src:`최저임금 고시 ${A.y}년 ${w0(mwOf(A.y))}원 · 전망 = ${A.manualMw ? '입력값' : '최근 3년 평균 인상률'}` }
    : { t:'법정 최저임금', fact:`${A.y + 1}년 최저시급 전망 ${w0(A.mwNext)}원(${pc(A.m)}) 적용 시<br>기본급 최소 여유 <b>${pc(minM)}</b>`,
      mean:'현재 기본급은 기준 이상이나 최저임금 인상분만큼 임금 인상 필요',
      src:`최저임금 고시 ${A.y}년 ${w0(mwOf(A.y))}원 · 전망 = ${A.manualMw ? '입력값' : '최근 3년 평균 인상률'}` });
    /* ② 원가 구조 (견적 대비 실제 급여) */
    const q = C.quote;
    if(q && q.received){
      const g = q.paid - q.received, gr = q.paid / q.received - 1;
      out.push({ t:'원가 구조', fact:`견적상 급여 가용 <b>${w0(q.received)}원</b><br>실제 급여 지급 <b>${w0(q.paid)}원</b> (월)`,
        mean: g > 0 ? `현 단가로 <b>월 ${w0(g)}원(${pc(gr)}) 부족</b> — 이미 손실 구조` : `가용 범위 대비 여유 ${pc(-gr)} — 내년 인상분을 흡수할 여력 부족`,
        src:'견적서 · 견적대비 비교 시트, 급여테이블(정원 기준)' });
    } else {
      const share = A.now.T ? A.now.D * (1 + A.b) / A.now.T : null;
      out.push({ t:'원가 구조', fact:`계약금액 중 인건비(법정부담 포함) 비중 <b>${pc0(share)}</b>`,
        mean:'임금이 오르면 계약금액 대부분이 함께 늘어나는 구조', src:'급여테이블 정원기준 연간 인건비 · 보고서 설정의 단가 구성' });
    }
    /* ③ 시장 임금 수준 */
    const ref = cs.ref, gNow = cs.me.monthly / ref.med - 1, after = cs.me.monthly * (1 + A.r), gAfter = after / ref.med - 1;
    const mk = cs.mk ? ` · 채용시장 ${man(cs.mk)}(${pc(cs.me.monthly / cs.mk - 1)})` : '';
    out.push({ t:'시장 임금 수준', fact:`상담사 월 총임금 <b>${man(cs.me.monthly)}원</b><br>${esc(ref.label)} 중위수 ${man(ref.med)}원 대비 <b>${pc(gNow)}</b>${mk}`,
      mean: gNow < -0.01 ? `시장보다 낮아 채용·유지 불리 → 인상 후 ${man(after)}원(중위수 대비 ${pc(gAfter)})으로 회복`
        : `인상 후 ${man(after)}원, 중위수 대비 ${pc(gAfter)} — 시장 수준을 크게 넘지 않음`,
      src:`${esc(ref.label)} ${ref.n}개 센터 급여테이블(${esc(C.period)} 기준)${ref.n < 5 ? ' · 표본 5곳 미만 참고' : ''}${cs.mk ? ' · 채용공고 중위수' : ''}` });
    return `<table class="why"><tr><th style="width:15%">근거</th><th style="width:36%">확인된 사실</th><th>의미</th></tr>
${out.map((x, i) => `<tr><td class="wt"><span class="no">${i + 1}</span>${x.t}</td><td>${x.fact}</td><td class="wm">${x.mean}<div class="src">${x.src}</div></td></tr>`).join('')}</table>`;
  }

  /* 산출 논리: 최저임금분 + 격차분 = 직접인건비 → 견적 단가 */
  function logic(A){
    const cs = A.groups.find(x => x.g === '상담사') || A.groups[0];
    /* Word에서도 폭이 유지되도록 칸마다 width 지정 */
    const parts = A.manual ? [['직접인건비 (입력)', pc(A.r)]]
      : [['최저임금 전망', pc(A.m)]].concat(A.cost ? [['원가 부족 해소', pc(A.cost)]] : [], [['시장 격차 해소', pc((1 + A.wageNeed) / (1 + A.m) - 1)], ['직접인건비', pc(A.r)]]);
    const nb = parts.length + 1, bw = ((100 - 4 * (nb - 1)) / nb).toFixed(1);
    const box = (l, v, cls) => `<td class="fb ${cls || ''}" width="${bw}%" style="width:${bw}%"><div class="fl">${l}</div><div class="fv">${v}</div></td>`, op = s => `<td class="fo" width="4%" style="width:4%">${s}</td>`;
    const tail = box(A.est ? '견적 단가' : '계약 단가', pc(A.rate, 2), 'res');
    const cells = parts.map((p, i) => (i ? op(i === parts.length - 1 && !A.manual ? '=' : '+') : '') + box(p[0], p[1])).join('') + op('→') + tail;
    return `<table class="flow"><tr>${cells}</tr></table><p class="note">${A.manual ? `자동 산출값 ${pc(A.auto)} · ` : ''}직접인건비 인상률 = ${A.cost ? '(1 + 원가 부족) × ' : ''}(1 + 최저임금 전망) × (1 + ${esc(POLICY_LABEL[A.policy] || '목표')}와의 격차) − 1 → ${A.est ? '견적서 항목' : '계약 항목'}에 반영(간접비 비례·경비 고정)</p>`;
  }

  /* 금액 변화 (요약) */
  function amounts(A){
    if(A.est){
      const N = A.est.all.now, X = A.est.all.next;
      const row = (l, a, b, cls) => `<tr class="${cls || ''}"><td class="nw">${l}</td><td class="r">${w0(a)}</td><td class="r">${w0(b)}</td><td class="r"><b>${w0(b - a)}</b></td><td class="r">${w0((b - a) * 12)}</td></tr>`;
      return `<table><tr><th>견적 항목 (월, 원)</th><th class="r">현재</th><th class="r">인상 후</th><th class="r">증가(월)</th><th class="r">증가(연)</th></tr>
  ${row('직접인건비', N.D, X.D)}${row('간접인건비 <span class="muted">퇴직·4대보험</span>', N.L, X.L)}${N.F ? row('경비 <span class="muted">고정</span>', N.F, X.F) : ''}
  ${row('일반관리비·기업이윤', N.M + N.P, X.M + X.P)}${N.V ? row('부가가치세', N.V, X.V) : ''}${row('총합계', N.T, X.T, 'me')}</table>
<p class="note">${esc(A.est.sheet)} 시트 항목을 그대로 사용 · 간접인건비·관리비·이윤·부가세는 각 산정 기준에 비례, 경비는 그대로 · 연 = 월 × 12${A.est.all.diff != null && Math.abs(A.est.all.diff) > 0.005 ? ` · <b class="neg">항목 합계가 시트 총합계와 ${pc(A.est.all.diff)} 차이</b>` : ''}</p>`;
    }
    const N = A.now, X = A.next, row = (l, a, b, cls) => `<tr class="${cls || ''}"><td class="nw">${l}</td><td class="r">${w0(a)}</td><td class="r">${w0(b)}</td><td class="r"><b>${w0(b - a)}</b></td></tr>`;
    return `<table><tr><th>계약 항목 (연, 원)</th><th class="r">현재</th><th class="r">인상 후</th><th class="r">증가</th></tr>
  ${row('직접인건비 <span class="muted">정원 기준</span>', N.D, X.D)}${row(`법정부담 <span class="muted">${(A.b * 100).toFixed(1)}%</span>`, N.L, X.L)}${row(`관리비·이윤 <span class="muted">${(A.mg * 100).toFixed(1)}%</span>`, N.M, X.M)}${N.E ? row('고정 경비', N.E, X.E) : ''}${row('계약금액', N.T, X.T, 'me')}</table>`;
  }

  /* ---------- 2쪽 블록 ---------- */
  /* 산업군(센터유형) 묶음의 직군 평균: 센터별 정원 가중(정원이 없는 센터가 있으면 센터 단순 평균) + 중위수 */
  function groupStats(list, g){
    const xs = list.map(s => groupPay(s, g)).filter(x => x && x.monthly);
    if(!xs.length) return null;
    const allW = xs.every(x => x.heads > 0), sw = xs.reduce((a, x) => a + (allW ? x.heads : 1), 0);
    return { n: xs.length, avg: xs.reduce((a, x) => a + x.monthly * (allW ? x.heads : 1), 0) / sw, med: median(xs.map(x => x.monthly)) };
  }
  const NOTE_DEFAULT = { '금융':'금융소비자보호법 등 전문지식 요구, 타 금융사 이탈 방지 필수', '유통':'주문·배송·결제 즉시 해결 역량 요구, 성수기 프로모션 인력 유지', '제조':'제품 기술 스펙·수리 엔지니어링 상담, 숙련도 6개월 이상 필수' };
  const notesOf = () => Object.assign({}, NOTE_DEFAULT, SETTINGS.industryNotes || {});
  const subsOf = t => ((SETTINGS.industryTree || {})[t] || []).filter(x => !/그 외|미지정/.test(x)).slice(0, 3);

  /* A. 동종 산업군 임금 벤치마킹 (근거 ③) */
  function benchBlock(A){
    const C = A.snap, me = { cs: groupPay(C, '상담사'), mg: groupPay(C, '관리자') }, notes = notesOf();
    const types = [...new Set(A.snaps.map(s => s.centerType).filter(Boolean))];
    const rowsOf = (label, list, cls, note) => { const a = groupStats(list, '상담사'), b = groupStats(list, '관리자'); if(!a && !b) return null;
      return { label, n: (a || b).n, a, b, cls, note }; };
    let rows = types.map(t => rowsOf(`${t}${subsOf(t).length ? ` <span class="muted">(${subsOf(t).join('·')})</span>` : ''}`, A.snaps.filter(s => s.centerType === t), t === C.centerType ? 'me' : '', notes[t] || '')).filter(Boolean);
    rows.sort((x, y) => (y.cls === 'me') - (x.cls === 'me') || (y.a ? y.a.avg : 0) - (x.a ? x.a.avg : 0));
    if(C.subType){ const sub = A.snaps.filter(s => s.centerType === C.centerType && s.subType === C.subType); if(sub.length >= 2) rows.splice(1, 0, rowsOf(`└ 세부유형 ${esc(C.subType)}`, sub, 'subrow', '')); }
    const mk = g => median(SETTINGS.market.filter(m => (g === '관리자' ? m.laborType === '관리자' : m.laborType !== '관리자')).map(m => m.monthly));
    if(SETTINGS.market.length){ const a = mk('상담사'), b = mk('관리자'); rows.push({ label:'채용시장 공고', n:`${SETTINGS.market.length}건`, a: a ? { avg:a } : null, b: b ? { avg:b } : null, cls:'', note:'신규 채용 시 제시해야 하는 수준' }); }
    const gap = (mine, x) => { if(!mine || !x) return '<td class="r">–</td>'; const d = mine.monthly / x.avg - 1;
      return `<td class="r ${d < -0.005 ? 'neg' : ''}"><b>${pc(d)}</b> ${d < -0.005 ? '열세' : d > 0.005 ? '우위' : '동등'}</td>`; };
    const showNote = rows.some(r => r.note);
    const ownSt = groupStats(A.snaps.filter(s => s.centerType === C.centerType), '상담사');
    return `<h2 style="margin-top:4pt">A. 동종 산업군 임금 벤치마킹 (월 총임금) <span class="hsub">— 1쪽 근거 3</span></h2>
<table class="bench"><tr><th>동종 산업군</th><th class="r">센터</th><th class="r">상담사 평균</th><th class="r">당사 대비</th><th class="r">관리자 평균</th><th class="r">당사 대비</th>${showNote ? '<th>업무 특성 · 인력 유치 시사점</th>' : ''}</tr>
${rows.map(r => `<tr class="${r.cls}${typeof r.n === 'number' && r.n < 5 ? ' thin' : ''}"><td class="nw">${r.label}${r.cls === 'me' ? ' ◀' : ''}${typeof r.n === 'number' && r.n < 5 ? ' <span class="muted">참고</span>' : ''}</td><td class="r">${r.n}</td>
  <td class="r">${r.a ? man(r.a.avg) : '–'}</td>${gap(me.cs, r.a)}<td class="r">${r.b ? man(r.b.avg) : '–'}</td>${gap(me.mg, r.b)}${showNote ? `<td class="nt">${esc(r.note)}</td>` : ''}</tr>`).join('')}
</table>
<p class="note"><b>당사 ${esc(C.center)}: 상담사 ${me.cs ? man(me.cs.monthly) : '–'} · 관리자 ${me.mg ? man(me.mg.monthly) : '–'}</b> · 당사 대비 = 당사 ÷ 산업군 평균 − 1 · 평균 = 센터별 정원 가중${ownSt ? ` (${esc(C.centerType)} 상담사 중위수 ${man(ownSt.med)})` : ''} · 5곳 미만 참고</p>`;
  }

  /* B. 견적 대비 실제 급여 — 직무별 (근거 ②) */
  function quoteBlock(A){
    const q = A.snap.quote; if(!q || !q.received || !(q.jobs || []).length) return '';
    const js = q.jobs.filter(x => x.heads > 0).sort((a, b) => b.total - a.total), d = q.paid - q.received;
    return `<h2>B. 견적 대비 실제 급여 지급 (월, 원) <span class="hsub">— 1쪽 근거 2</span></h2>
<table><tr><th>직무</th><th class="r">정원</th><th class="r">1인 통상+초과</th><th class="r">업적수당 계</th><th class="r">직무 지급 계</th></tr>
${js.slice(0, 3).map(x => `<tr><td class="nw">${esc(x.job)}</td><td class="r">${w0(x.heads)}</td><td class="r">${w0(x.base1)}</td><td class="r">${w0(x.perfTotal)}</td><td class="r">${w0(x.total)}</td></tr>`).join('')}
${js.length > 3 ? `<tr><td class="nw">그 외 ${js.length - 3}개 직무</td><td class="r">${w0(js.slice(3).reduce((a, x) => a + x.heads, 0))}</td><td></td><td class="r">${w0(js.slice(3).reduce((a, x) => a + x.perfTotal, 0))}</td><td class="r">${w0(js.slice(3).reduce((a, x) => a + x.total, 0))}</td></tr>` : ''}
<tr class="sum"><td class="nw">실제 급여 지급 계</td><td class="r">${w0(js.reduce((a, x) => a + x.heads, 0))}</td><td></td><td></td><td class="r">${w0(q.paid)}</td></tr>
<tr><td class="nw">견적상 급여 가용</td><td colspan="3" class="muted">${q.recvSrc ? esc(q.recvSrc) : '견적대비 비교 시트'}${q.realRatio ? ` · 실비 청구 ${q.realRatio}% 제외` : ''}</td><td class="r">${w0(q.received)}</td></tr>
<tr class="me"><td class="nw">차이</td><td colspan="3">${d > 0 ? '견적으로 현재 급여도 충당하지 못함' : '견적 가용 범위 안'}</td><td class="r ${d > 0 ? 'neg' : ''}"><b>${d > 0 ? '−' : '+'}${w0(Math.abs(d))} (${pc(q.paid / q.received - 1)})</b></td></tr></table>`;
  }

  /* C. 최저임금 영향 (근거 ①) — 미달 직무가 있거나 여유 3% 미만일 때만 */
  function mwBlock(A){
    const minM = A.risk.length ? Math.min(...A.risk.map(x => x.margin)) : null;
    if(!A.risk.some(x => x.short > 0) && !(minM != null && minM < 0.03)) return '';
    const grp = new Map();
    A.risk.forEach(x => { const k = `${Math.round(x.base)}|${Math.round(x.need)}`, g = grp.get(k); if(g){ g.heads += x.heads; g.n++; } else grp.set(k, { ...x, n:1 }); });
    const rows = [...grp.values()].sort((a, b) => b.short * b.heads - a.short * a.heads).slice(0, 4);
    const tr = A.trend.filter(t => t.wage != null);
    return `<h2>C. 최저임금 영향 (${A.y + 1}년 전망 ${pc(A.m)}, 시급 ${w0(A.mwNext)}원) <span class="hsub">— 1쪽 근거 1</span></h2>
<table><tr><th>직무</th><th class="r">정원</th><th class="r">현재 기본급</th><th class="r">내년 최저 기준</th><th class="r">1인 부족(월)</th><th class="r">부족 계(월)</th></tr>
${rows.map(x => `<tr><td class="nw">${esc(x.name)}${x.n > 1 ? ` 외 ${x.n - 1}개` : ''}</td><td class="r">${w0(x.heads)}</td><td class="r">${w0(x.base)}</td><td class="r">${w0(x.need)}</td><td class="r ${x.short > 0 ? 'neg' : ''}">${x.short > 0 ? w0(x.short) : `여유 ${pc(x.margin)}`}</td><td class="r">${w0(x.short * x.heads)}</td></tr>`).join('')}
<tr class="me"><td class="nw">계</td><td colspan="4">연 ${w0(A.riskTot * 12)}원 · 법정부담 포함 연 ${w0(A.riskTot * 12 * (1 + A.b))}원</td><td class="r">${w0(A.riskTot)}</td></tr></table>
${tr.length ? `<p class="note">연도별 인상률 — 최저임금 ${tr.map(t => `${t.y} ${pc(t.mw)}`).join(' · ')} / ${esc(A.snap.center)} 상담사 임금 ${tr.map(t => `${t.y} ${pc(t.wage)}`).join(' · ')}</p>` : ''}`;
  }

  /* D. 직무별 1인 월 단가 (결론) — 견적서가 있을 때 */
  function roleBlock(A){
    const E = A.snap.estimate; if(!A.est || !E) return '';
    const rows = E.roles.map((ro, i) => ro.heads > 0 ? { name: ro.name, heads: ro.heads, ...estCalc(E, A.r, x => x.vals[i]) } : null).filter(Boolean);
    if(!rows.length) return '';
    const tot = rows.reduce((a, x) => a + (x.next.T - x.now.T) * x.heads, 0);
    return `<h2>D. 직무별 1인 월 단가 (견적 기준, 원) <span class="hsub">— 1쪽 결론</span></h2>
<table><tr><th>직무</th><th class="r">정원</th><th class="r">현재 1인 단가</th><th class="r">인상 후</th><th class="r">1인 증가</th><th class="r">증가 계(월)</th></tr>
${rows.map(x => `<tr><td class="nw">${esc(x.name)}</td><td class="r">${w0(x.heads)}</td><td class="r">${w0(x.now.T)}</td><td class="r">${w0(x.next.T)}</td><td class="r"><b>${w0(x.next.T - x.now.T)}</b></td><td class="r">${w0((x.next.T - x.now.T) * x.heads)}</td></tr>`).join('')}
<tr class="me"><td class="nw">계</td><td class="r">${w0(rows.reduce((a, x) => a + x.heads, 0))}</td><td colspan="3">연 ${w0(tot * 12)}원</td><td class="r">${w0(tot)}</td></tr></table>`;
  }

  /* ---------- 기준정보: 산업군별 업무 특성·시사점 ---------- */
  const setGrid2 = document.querySelector('#tabSettings .set-grid');
  if(setGrid2){
    setGrid2.insertAdjacentHTML('beforeend', `<div class="panel v2-industry" style="grid-column:1/-1">
      <div class="ph"><h2>산업군별 업무 특성 · 인력 유치 시사점 (보고서 2쪽)</h2><button type="button" class="btn-primary btn-sm" id="v2NoteSave">저장</button></div>
      <p class="hint">한 줄에 하나: <b>산업군: 문장</b> · 보고서 2쪽 ‘동종 산업군 임금 벤치마킹’ 표에 그대로 들어갑니다. 비워 두면 열이 숨겨집니다.</p>
      <textarea id="v2NoteText" spellcheck="false"></textarea><span class="hint" id="v2NoteMsg"></span></div>`);
    const fillNotes = () => { $('v2NoteText').value = Object.entries(notesOf()).map(([k, v]) => `${k}: ${v}`).join('\n'); };
    $('v2NoteSave').onclick = async () => {
      const out = {};
      $('v2NoteText').value.split('\n').forEach(l => { const m = l.match(/^\s*([^:：]+?)\s*[:：]\s*(.*)$/); if(m) out[m[1]] = m[2].trim(); });
      Object.keys(NOTE_DEFAULT).forEach(k => { if(!(k in out)) out[k] = ''; });   // 지운 기본 문장은 빈 값으로 기억
      SETTINGS.industryNotes = out; await saveSettings(); $('v2NoteMsg').textContent = '저장했습니다'; fillNotes();
    };
    fillNotes();
  }

  /* ---------- 보고서 본문 (화면·Word 공통) ---------- */
  function buildDoc(A){
    const C = A.snap, cs = A.groups.find(x => x.g === '상담사') || A.groups[0], N = A.now, today = new Date().toISOString().slice(0, 10);
    const page1 = `<div class="page">
<p class="kicker">상담 단가 조정 요청 · ${A.y + 1}년 적용</p>
<h1>${esc(C.center)} 상담 단가 ${pc0(A.rate, 2)} 조정 요청</h1>
<p class="meta">${esc(C.centerType)}${C.subType ? ` › ${esc(C.subType)}` : ''}${C.region ? ` · ${esc(C.region)}` : ''} · 상담사 ${w0(cs.me.heads)}명 · ${esc(C.period)} 급여테이블 v${C.version} 기준 · ${today}</p>
${askBox(A)}
<h2>요청 근거</h2>
${reasons(A)}
<h2>인상률 산출</h2>
${logic(A)}
<h2>금액 변화</h2>
${amounts(A)}
</div>`;
    /* ============================================================
       2쪽: 1쪽 근거 자료 — A 산업군 벤치마킹(근거③) · B 견적 대비 직무별 지급(근거②)
            C 최저임금 영향(근거①, 영향 있을 때만) · D 직무별 1인 단가(결론) · E 기준
       ============================================================ */
    const page2 = `<div class="page p2">
<p class="kicker">첨부 · 1쪽 근거 자료</p>
${benchBlock(A)}
${quoteBlock(A)}
${mwBlock(A)}
${roleBlock(A)}
<h2>E. 산출 기준</h2>
<ul>
  <li>월 총임금 = 기준급여 소계 + B등급 업적수당 + 고정 초과·야간·통신(‘월 보수 합계’) · 관리자 = 리더그룹 직무 · 직접인건비 인상률 = ${A.cost ? '(1 + 원가 부족) × ' : ''}(1 + 최저임금 전망 ${pc(A.m)}) × (1 + ${esc(POLICY_LABEL[A.policy] || '목표')}와의 격차) − 1${A.manual ? ` (이번 보고서는 직접 입력 ${pc(A.r)})` : ''}</li>
  <li>${A.est ? '견적서 항목: 간접인건비(퇴직·4대보험)·일반관리비·기업이윤·부가세는 각 산정 기준에 비례, 경비는 그대로' : `계약금액 = 직접인건비 × (1 + 법정부담 ${(A.b * 100).toFixed(1)}%) × (1 + 관리비·이윤 ${(A.mg * 100).toFixed(1)}%) + 고정 경비`} · 기준 시점 ${esc(C.period)} 저장본</li>
</ul>
</div>`;
    return page1 + `<br class="pb" clear="all">` + page2;
  }

  renderReport = function(){
    normalize();
    const doc = $('reportDoc'), A = analyze();
    if(!A){ doc.innerHTML = '<p class="hint">이 시점에 해당 센터의 데이터가 없습니다.</p>'; return; }
    doc.classList.add('rp2');
    doc.innerHTML = buildDoc(A);
    ['repBurden', 'repMgmt', 'repFixed'].forEach(id => { $(id).closest('label').hidden = !!A.est; });
    $('repPriceHint').textContent = `자동 계산 ${pc(A.auto)} (최저임금 전망 + 목표 격차) · 비워 두면 자동값 사용` + (A.est ? ' · 간접비·관리비·이윤은 견적서 값으로 계산' : '');
    $('repLabor').placeholder = `자동 ${(A.auto * 100).toFixed(1)}`;
  };

  /* ---------- Word 저장 (MHTML .doc) ---------- */
  const PROPS = ['color', 'background-color', 'font-size', 'font-weight', 'text-align', 'line-height', 'vertical-align', 'white-space',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'margin-top', 'margin-bottom'];
  const b64utf8 = s => { const b = new TextEncoder().encode(s); let bin = ''; for(let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(bin); };
  const wrap76 = s => s.replace(/.{1,76}/g, '$&\r\n');
  /* 화면에서 계산된 스타일을 요소마다 넣은 복사본 (Word가 클래스 CSS를 다르게 해석해도 같은 모양) */
  function inlineCopy(){
    const src = $('reportDoc'), tpl = document.createElement('template'); tpl.innerHTML = src.innerHTML;
    const live = [...src.querySelectorAll('*')], copy = [...tpl.content.querySelectorAll('*')];
    live.forEach((el, k) => {
      if(el.closest('svg') || el.classList.contains('page') || el.classList.contains('pb')) return;
      const cs = getComputedStyle(el), out = [];
      PROPS.forEach(pr => { const v = cs.getPropertyValue(pr); if(pr === 'background-color' && /rgba\(0, 0, 0, 0\)|transparent/.test(v)) return; out.push(`${pr}:${v}`); });
      ['top', 'right', 'bottom', 'left'].forEach(sd => { const w = cs.getPropertyValue(`border-${sd}-width`); if(parseFloat(w) > 0) out.push(`border-${sd}:${w} ${cs.getPropertyValue(`border-${sd}-style`)} ${cs.getPropertyValue(`border-${sd}-color`)}`); });
      out.push("font-family:'KT Flow','맑은 고딕','Malgun Gothic',sans-serif");
      copy[k].setAttribute('style', out.join(';'));
      if(/^T[DH]$/.test(el.tagName) && cs.whiteSpace === 'nowrap') copy[k].setAttribute('nowrap', '');
    });
    tpl.content.querySelectorAll('table').forEach(t => { t.setAttribute('width', '100%'); t.style.width = '100%'; });   // Word·LibreOffice에서 표 폭 유지
    tpl.content.querySelectorAll('br.pb').forEach(b => { b.removeAttribute('class'); b.setAttribute('style', 'page-break-before:always'); });
    return tpl;
  }
  async function buildWord(){
    const tpl = inlineCopy(), parts = []; let n = 0;
    for(const box of tpl.content.querySelectorAll('.chart')){
      const svg = box.querySelector('svg'); if(!svg) continue;
      const w = +svg.getAttribute('width') || 640, hgt = +svg.getAttribute('height') || 200, url = await svgToPng(svg.outerHTML);
      if(!url){ box.innerHTML = ''; continue; }
      const name = `chart${++n}.png`;
      parts.push({ name, png: url.split(',')[1] });
      box.innerHTML = `<img src="report_files/${name}" width="${w}" height="${hgt}" alt="비교 차트">`;
    }
    const html = `<html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><title>${esc(reportFileBase())}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->
<style>@page Section1{size:21.0cm 29.7cm;margin:1.8cm;mso-page-orientation:portrait}div.Section1{page:Section1}table{border-collapse:collapse;width:100%}</style></head>
<body><div class="Section1">${tpl.innerHTML}</div></body></html>`;
    const B = '----=_NextPart_PAYTABLE';
    let mht = `MIME-Version: 1.0\r\nContent-Type: multipart/related; boundary="${B}"; type="text/html"\r\n\r\n`
      + `--${B}\r\nContent-Location: file:///C:/report.htm\r\nContent-Transfer-Encoding: base64\r\nContent-Type: text/html; charset="utf-8"\r\n\r\n${wrap76(b64utf8(html))}\r\n`;
    parts.forEach(p => { mht += `--${B}\r\nContent-Location: file:///C:/report_files/${p.name}\r\nContent-Transfer-Encoding: base64\r\nContent-Type: image/png\r\n\r\n${wrap76(p.png)}\r\n`; });
    return { mht: mht + `--${B}--\r\n`, html, parts };
  }
  window.__v2report = { buildWord, payOf, analyze, parseEstimateFull, estCalc };

  /* 기존 버튼 동작 교체 (Word · HTML) */
  const swap = (id, fn) => { const b = $(id); if(!b) return; const nb = b.cloneNode(true); b.replaceWith(nb); nb.addEventListener('click', fn); };
  swap('repWordBtn', async () => { const { mht } = await buildWord(); downloadBlob(new Blob([mht], { type:'application/msword' }), reportFileBase() + '.doc'); });
  swap('repHtmlBtn', () => {
    const tpl = inlineCopy();
    const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>${esc(reportFileBase())}</title><style>body{max-width:760px;margin:24px auto;padding:0 16px}table{border-collapse:collapse;width:100%}</style></head><body>${tpl.innerHTML}</body></html>`;
    downloadBlob(new Blob([html], { type:'text/html' }), reportFileBase() + '.html');
  });
})();

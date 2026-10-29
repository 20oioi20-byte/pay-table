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
    const auto = costSum ? work.reduce((a, x) => a + x.me.annual * x.need, 0) / costSum : mean(work.map(x => x.need));
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
    return { snap, y, policy, levels, groups, m, auto, r, mwNext, risk, riskTot, manual: tmp.labor !== '', now, next, est, rate: est ? est.all.rate : now.T ? next.T / now.T - 1 : 0, csHeads: cs ? cs.me.heads : 0, pr, b, mg, trend,
      hasHeads: snap.jobs.some(j => typeof j.heads === 'number') };
  }

  /* ---------- 표시 형식 ---------- */
  const w0 = v => v == null || !isFinite(v) ? '–' : Math.round(v).toLocaleString();
  const man = v => v == null || !isFinite(v) ? '–' : `${Math.round(v / 10000).toLocaleString()}만`;
  const eok = v => v == null || !isFinite(v) ? '–' : Math.abs(v) >= 1e8 ? `${(v / 1e8).toFixed(2)}억` : `${Math.round(v / 10000).toLocaleString()}만`;
  const pc = (v, d = 1) => v == null || !isFinite(v) ? '–' : `${v > 0 ? '+' : ''}${(v * 100).toFixed(d)}%`;
  const pc0 = (v, d = 1) => v == null || !isFinite(v) ? '–' : `${(v * 100).toFixed(d)}%`;
  const neg = v => v < 0 ? 'neg' : '';

  /* ---------- 차트: 비교 집단 중위수(회색) vs 센터(빨강) ---------- */
  function chartCompare(A){
    const g = A.groups[0], rows = g.lv.map(l => ({ label:l.label, med:l.med, n:`${l.n}곳` }));
    if(g.mk) rows.push({ label:'채용시장', med:g.mk, n:`${SETTINGS.market.filter(m => m.laborType !== '관리자').length}건` });
    const after = g.me.monthly * (1 + A.r);   // 직접인건비 인상률만큼 임금이 오른 뒤
    const W = 640, rowH = 26, T = 22, L = 150, R = 130, H = T + rows.length * rowH + 20;
    const vals = rows.map(r => r.med).concat(g.me.monthly, after).filter(Boolean), lo = Math.floor(Math.min(...vals) * 0.9 / 100000) * 100000, hi = Math.max(...vals) * 1.02;
    const x = v => L + (v - lo) / (hi - lo) * (W - L - R);
    let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="KT Flow, Malgun Gothic, sans-serif" font-size="11"><rect width="${W}" height="${H}" fill="#FFFFFF"/>`;
    rows.forEach((r, i) => {
      const yy = T + i * rowH, d = g.me.monthly / r.med - 1;
      s += `<text x="0" y="${yy + 18}" fill="#000000" font-weight="bold">${esc(r.label)}</text><text x="${L - 8}" y="${yy + 18}" text-anchor="end" fill="#A2A4A3" font-size="10">${r.n}</text>`;
      s += `<rect x="${L}" y="${yy + 6}" width="${Math.max(0, x(r.med) - L)}" height="16" fill="#D6D7D7"/><text x="${x(r.med) + 6}" y="${yy + 18}" fill="#4C4C4E" font-size="10.5">${man(r.med)}</text>`;
      const d2 = after / r.med - 1;
      s += `<text x="${W - 62}" y="${yy + 18}" text-anchor="end" fill="${d < 0 ? '#D9141D' : '#4C4C4E'}" font-size="10.5">${pc(d)}</text><text x="${W - 50}" y="${yy + 18}" text-anchor="middle" fill="#A2A4A3" font-size="10">→</text>`;
      s += `<text x="${W}" y="${yy + 18}" text-anchor="end" fill="${d2 < 0 ? '#D9141D' : '#000000'}" font-weight="bold">${pc(d2)}</text>`;
    });
    /* 센터명 라벨은 선 왼쪽에 붙여 오른쪽 '차이' 머리글과 겹치지 않게 */
    s += `<line x1="${x(g.me.monthly)}" x2="${x(g.me.monthly)}" y1="${T - 4}" y2="${H - 2}" stroke="#FE2E36" stroke-width="2"/><text x="${x(g.me.monthly) - 4}" y="${T - 9}" text-anchor="end" fill="#FE2E36" font-weight="bold">${esc(A.snap.center)} ${man(g.me.monthly)}</text>`;
    s += `<line x1="${x(after)}" x2="${x(after)}" y1="${T - 4}" y2="${H - 18}" stroke="#FE2E36" stroke-width="2" stroke-dasharray="4 3"/><text x="${x(after) + 4}" y="${H - 4}" text-anchor="start" fill="#FE2E36" font-weight="bold">인상 후 ${man(after)} (${pc(A.r)})</text>`;
    s += `<text x="${W}" y="${T - 9}" text-anchor="end" fill="#A2A4A3" font-size="10">중위수 대비 현재 → 인상 후</text>`;
    return s + `</svg>`;
  }

  /* 견적서 기준 요청 박스 + 금액 변화표 (월 단위 견적 → 연 = ×12) */
  function estBlock(A){
    const e = A.est.all, N = e.now, X = e.next, ro = A.est.role, d = X.T - N.T;
    const row = (label, a, b, cls) => `<tr class="${cls || ''}"><td class="nw">${label}</td><td class="r">${w0(a)}</td><td class="r">${w0(b)}</td><td class="r"><b>${w0(b - a)}</b></td><td class="r">${w0((b - a) * 12)}</td><td class="r">${a ? pc(b / a - 1, 2) : '–'}</td></tr>`;
    return `<table class="ask"><tr>
  <td class="al">견적 단가 인상률</td><td class="av">${pc0(e.rate, 2)}</td>
  <td class="ad">월 견적 총액 <b>${w0(N.T)}원 → ${w0(X.T)}원</b><br>월 <b class="hl">+${w0(d)}원</b> · 연 <b class="hl">+${w0(d * 12)}원</b>${ro ? `<br>${esc(ro.name)} 1인 월 단가 ${w0(ro.now.T)} → ${w0(ro.next.T)}원` : ''}</td>
</tr></table>
<h2>금액 변화 — 견적서 기준 (원)</h2>
<table><tr><th>구분</th><th class="r">현재(월)</th><th class="r">인상 후(월)</th><th class="r">증가(월)</th><th class="r">증가(연)</th><th class="r">증가율</th></tr>
  ${row('직접인건비', N.D, X.D)}
  ${row(`간접인건비 <span class="muted">(퇴직·4대보험, 비례)</span>`, N.L, X.L)}
  ${N.F ? row(`경비·기타 <span class="muted">(변동 없음)</span>`, N.F, X.F) : ''}
  ${row(`일반관리비 <span class="muted">(비례)</span>`, N.M, X.M)}
  ${row(`기업이윤 <span class="muted">(비례)</span>`, N.P, X.P)}
  ${N.V ? row(`부가가치세`, N.V, X.V) : ''}
  ${row('총합계', N.T, X.T, 'me')}
</table>
<p class="note">직접인건비 ${pc(A.r)} 인상(${A.manual ? '직접 입력' : `최저임금 전망 ${pc0(A.m)} + 격차 해소`}) → 견적 총액 ${pc(e.rate, 2)} · ${esc(A.est.sheet)} 시트 · 연 = 월 × 12${e.diff != null && Math.abs(e.diff) > 0.005 ? ` · <b class="neg">항목 합계가 시트 총합계와 ${pc(e.diff)} 차이</b>` : ''}</p>`;
  }

  /* 인상하지 않으면: 내년 최저임금(전망) 미달액 */
  function riskBlock(A){
    /* 기본급·기준이 같은 직무는 한 줄로 묶음 (예: 상담1 외 3개 직무) */
    const grp = new Map();
    A.risk.filter(x => x.short > 0).forEach(x => { const k = `${Math.round(x.base)}|${Math.round(x.need)}`, g = grp.get(k);
      if(g){ g.heads += x.heads; g.n++; } else grp.set(k, { ...x, n:1 }); });
    const rows = [...grp.values()].map(g => ({ ...g, name: g.n > 1 ? `${g.name} 외 ${g.n - 1}개 직무` : g.name })).sort((a, b) => b.short * b.heads - a.short * a.heads);
    const head = `<h3>인상하지 않으면 — ${A.y + 1}년 최저임금(전망 ${pc(A.m)}, 시급 ${w0(A.mwNext)}원) 미달액</h3>`;
    if(!rows.length) return head + `<p class="note">내년 최저임금 전망을 반영해도 모든 직무 기본급이 기준 이상입니다 (최소 여유 ${pc(Math.min(...A.risk.map(x => x.margin)))}).</p>`;
    const top = rows.slice(0, 2), rest = rows.slice(2), restSum = rest.reduce((a, x) => a + x.short * x.heads, 0), restHeads = rest.reduce((a, x) => a + x.heads, 0);
    return head + `<table><tr><th>직무</th><th class="r">정원</th><th class="r">현재 기본급</th><th class="r">내년 최저 기준</th><th class="r">1인 부족(월)</th><th class="r">부족 합계(월)</th></tr>
${top.map(x => `<tr><td class="nw">${esc(x.name)}</td><td class="r">${w0(x.heads)}</td><td class="r">${w0(x.base)}</td><td class="r">${w0(x.need)}</td><td class="r neg">${w0(x.short)}</td><td class="r">${w0(x.short * x.heads)}</td></tr>`).join('')}
${rest.length ? `<tr><td class="nw">그 외 ${rest.reduce((a, x) => a + x.n, 0)}개 직무</td><td class="r">${w0(restHeads)}</td><td></td><td></td><td></td><td class="r">${w0(restSum)}</td></tr>` : ''}
<tr class="me"><td class="nw">계</td><td class="r">${w0(rows.reduce((a, x) => a + x.heads, 0))}</td><td colspan="3">연 ${w0(A.riskTot * 12)}원 · 법정부담 포함 연 ${w0(A.riskTot * 12 * (1 + A.b))}원</td><td class="r">${w0(A.riskTot)}</td></tr></table>`;
  }

  /* ---------- 보고서 본문 (화면·Word 공통) ---------- */
  function buildDoc(A){
    const C = A.snap, cs = A.groups.find(x => x.g === '상담사') || A.groups[0], N = A.now, X = A.next, today = new Date().toISOString().slice(0, 10);
    const amtRow = (label, a, b, cls) => `<tr class="${cls || ''}"><td class="nw">${label}</td><td class="r">${w0(a)}</td><td class="r">${w0(b)}</td><td class="r"><b>${w0(b - a)}</b></td><td class="r">${a ? pc(b / a - 1, 2) : '–'}</td></tr>`;
    const per = A.csHeads ? [N.T / 12 / A.csHeads, X.T / 12 / A.csHeads] : null;
    const reason = A.manual ? '직접 입력' : `최저임금 전망 ${pc0(A.m)} + 격차 해소`;
    const page1 = `<div class="page">
<p class="kicker">상담 단가 조정 보고 · ${A.y + 1}년 적용</p>
<h1>${esc(C.center)} 상담 단가 ${pc0(A.rate, 2)} 인상 요청</h1>
<p class="meta">${esc(C.centerType)}${C.subType ? ` › ${esc(C.subType)}` : ''}${C.region ? ` · ${esc(C.region)}` : ''} · 상담사 ${w0(cs.me.heads)}명 · ${esc(C.period)} 급여테이블 v${C.version} 기준 · ${today}</p>
${A.est ? estBlock(A) : `<table class="ask"><tr>
  <td class="al">단가 인상률</td><td class="av">${pc0(A.rate, 2)}</td>
  <td class="ad">연간 계약금액 <b>${eok(N.T)}원 → ${eok(X.T)}원</b><br>연 <b class="hl">+${w0(X.T - N.T)}원</b> · 월 +${w0((X.T - N.T) / 12)}원${per ? `<br>상담사 1인 월 단가 ${w0(per[0])}원 → ${w0(per[1])}원` : ''}</td>
</tr></table>
<h2>금액 변화 (연간, 원)</h2>
<table><tr><th>구분</th><th class="r">현재</th><th class="r">인상 후</th><th class="r">증가액</th><th class="r">증가율</th></tr>
  ${amtRow(`직접인건비 <span class="muted">(정원 기준)</span>`, N.D, X.D)}
  ${amtRow(`법정부담금 <span class="muted">(${(A.b * 100).toFixed(1)}%)</span>`, N.L, X.L)}
  ${amtRow(`관리비·이윤 <span class="muted">(${(A.mg * 100).toFixed(1)}%)</span>`, N.M, X.M)}
  ${amtRow(`고정 경비 <span class="muted">(변동 없음)</span>`, N.E, X.E)}
  ${amtRow('계약금액 합계', N.T, X.T, 'me')}
</table>
<p class="note">직접인건비 ${pc(A.r)} 인상(${reason}) → 법정부담·관리비·이윤은 비례, 고정 경비는 그대로 → 계약금액 ${pc(A.rate, 2)}</p>`}
<h2>인상 근거</h2>
<table class="rkpi"><tr>
  <td><div class="l">① 상담사 임금 수준</div><div class="v ${neg(cs.me.monthly / cs.ref.med - 1)}">${pc(cs.me.monthly / cs.ref.med - 1)}</div><div class="s">${esc(cs.ref.label)} 중위수 ${man(cs.ref.med)} 대비<br>${esc(C.center)} ${man(cs.me.monthly)}</div></td>
  ${C.quote && C.quote.received ? `<td><div class="l">② 견적 대비 급여 지급</div><div class="v ${C.quote.paid > C.quote.received ? 'neg' : ''}">${pc(C.quote.paid / C.quote.received - 1)}</div><div class="s">견적 가용 ${w0(C.quote.received)}원<br>급여 지급 ${w0(C.quote.paid)}원 (월)</div></td>`
    : `<td><div class="l">② 내년 최저임금 전망</div><div class="v">${pc(A.m)}</div><div class="s">최근 3년 평균 ${pc(mwAvg3(A.y))}<br>${A.y}년 최저시급 ${w0(mwOf(A.y))}원</div></td>`}
  <td><div class="l">③ 필요 직접인건비 인상률</div><div class="v hlv">${pc(A.r)}</div><div class="s">${A.manual ? `자동 계산값 ${pc(A.auto)}` : '최저임금 전망 + 비교 기준 격차'}</div></td>
</tr></table>
${riskBlock(A)}
<h3>상담사 월 총임금 — 비교 집단 중위수 대비 현재와 인상 후</h3>
<div class="chart">${chartCompare(A)}</div>
</div>`;
    const gx = g => A.groups.find(x => x.g === g), GS = ['상담사', '관리자', '전체'].filter(gx);
    const page2 = `<div class="page">
<p class="kicker">참고 자료</p>
<h2 style="margin-top:4pt">A. 직무별 현재 수준 (${esc(C.period)}, 원)</h2>
<table><tr><th>직무</th><th>직군</th><th class="r">정원</th><th class="r">월 총임금</th><th class="r">연간 인건비</th><th class="r">환산 시급</th><th class="r">최저임금 여유</th></tr>
${C.jobs.map(j => { const p = payOf(j), base = num((j.items || {})['기본급']), mg = base && p.hours ? base / (mwOf(A.y) * p.hours) - 1 : null;
  return `<tr><td class="nw">${esc(j.name)}</td><td class="nw">${groupOf(j)}</td><td class="r">${w0(headsOf(C, j))}</td><td class="r">${w0(p.monthly)}</td><td class="r">${w0(annualOf(C, j))}</td><td class="r">${w0(p.hourly)}</td><td class="r ${mg != null && mg < 0.02 ? 'neg' : ''}">${pc(mg)}</td></tr>`; }).join('')}
<tr class="sum"><td class="nw">계</td><td></td><td class="r">${w0(C.jobs.reduce((a, j) => a + headsOf(C, j), 0))}</td><td></td><td class="r">${w0(N.D)}</td><td></td><td></td></tr></table>
<h2>B. 비교 집단 중위수와 ${esc(C.center)} 차이 (월 총임금)</h2>
<table><tr><th>비교 집단</th><th class="r">센터</th>${GS.map(g => `<th class="r">${g}</th><th class="r">차이</th>`).join('')}</tr>
${A.levels.map((L, i) => `<tr class="${cs.ref.key === L.key ? 'me' : ''}"><td class="nw">${esc(L.label)}</td><td class="r">${L.list.length}</td>${GS.map(g => `<td class="r">${man(gx(g).lv[i].med)}</td><td class="r ${neg(gx(g).lv[i].gap)}"><b>${pc(gx(g).lv[i].gap)}</b></td>`).join('')}</tr>`).join('')}
${SETTINGS.market.length ? `<tr><td class="nw">채용시장</td><td class="r">${SETTINGS.market.length}건</td>${GS.map(g => gx(g).mk ? `<td class="r">${man(gx(g).mk)}</td><td class="r ${neg(gx(g).me.monthly / gx(g).mk - 1)}"><b>${pc(gx(g).me.monthly / gx(g).mk - 1)}</b></td>` : '<td class="r">–</td><td class="r">–</td>').join('')}</tr>` : ''}
<tr><td class="nw">${esc(C.center)}</td><td class="r">–</td>${GS.map(g => `<td class="r"><b>${man(gx(g).me.monthly)}</b></td><td class="r">–</td>`).join('')}</tr></table>
<h2>C. 연도별 인상률 — 최저임금 vs ${esc(C.center)} 상담사 임금</h2>
${A.trend.length ? `<table><tr><th>구분</th>${A.trend.map(t => `<th class="r">${t.y}</th>`).join('')}</tr>
  <tr><td class="nw">최저임금 인상률</td>${A.trend.map(t => `<td class="r">${pc(t.mw)}</td>`).join('')}</tr>
  <tr class="me"><td class="nw">상담사 월 총임금 인상률</td>${A.trend.map(t => `<td class="r">${pc(t.wage)}</td>`).join('')}</tr></table>` : `<p class="note">2개 연도 이상 저장되면 표시됩니다.</p>`}
<h2>D. 필요 직접인건비 인상률 산출</h2>
<table><tr><th>직군</th><th class="r">현재 월 총임금</th><th class="r">목표</th><th class="r">격차</th><th class="r">최저임금 전망</th><th class="r">필요 인상률</th><th class="r">연간 인건비</th></tr>
${A.groups.filter(x => x.g !== '전체').map(x => `<tr><td class="nw">${x.g}</td><td class="r">${w0(x.me.monthly)}</td><td class="r">${w0(x.tgt)}</td><td class="r">${pc(x.gap)}</td><td class="r">${pc(A.m)}</td><td class="r"><b>${pc(x.need)}</b></td><td class="r">${w0(x.me.annual)}</td></tr>`).join('')}
<tr class="sum"><td class="nw">직접인건비</td><td colspan="4">${A.manual ? `직접 입력 (자동 ${pc(A.auto)})` : '연간 인건비 가중'}</td><td class="r">${pc(A.r)}</td><td class="r">${w0(N.D)}</td></tr></table>
<ul>
  <li>월 총임금 = 기준급여 소계 + B등급 업적수당 + 고정 초과·야간·통신 (‘월 보수 합계’) · 환산 시급 = (소계 + 업적수당) ÷ 기본급 수식 시간수</li>
  <li>직접인건비 = 급여테이블 ‘전체 연간 인건비 합계(정원기준)’ 합${A.hasHeads ? '' : ' · <b class="neg">정원 행이 없어 입력한 인원으로 계산</b>'} · 관리자 = 리더그룹 직무</li>
  <li>필요 인상률 = (1 + 최저임금 전망) × (1 + max(0, 목표 ÷ 현재 − 1)) − 1 · 계약금액 = 직접인건비 × (1 + 법정부담률) × (1 + 관리비·이윤율) + 고정 경비</li>
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

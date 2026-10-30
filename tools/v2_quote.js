/* ============================================================
   v2.6 · 견적 대비 직접인건비
   받는 금액 = 견적대비 비교 시트의 '월 보수 가용 범위'(실비 청구분 제외)
              (시트가 없으면 견적서 '직접인건비 소계' × 인원 × (1 − 실비 청구 비율))
   나가는 금액 = Σ 직무별 [(통상임금 소계 + 초과근무수당) × 인원 + 업적수당(등급별 인원 반영)]
              (견적대비 비교 시트와 같은 방식: 통신비 제외)
   업적수당 B가 없거나 0인 직무는 1인 업적수당을 직접 입력
   ============================================================ */
(() => {
  const $ = id => document.getElementById(id);
  const h = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
  const V2X = () => window.__v2 || {};
  const norm = s => String(s ?? '').replace(/\s+/g, '');
  const numv = v => typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && /^-?[\d,]+(\.\d+)?$/.test(v.trim()) ? +v.replace(/,/g, '') : null;
  const num = v => numv(v) ?? 0;
  const won = v => v == null ? '–' : Math.round(v).toLocaleString();

  /* ---------- 시트 읽기 ---------- */
  function findCell(V, test, from){
    for(let r = from ? from.r : 0; r < V.length; r++){
      const row = V[r] || [];
      for(let c = 0; c < row.length; c++){ if((!from || c >= (from.c ?? 0)) && test(norm(row[c]))) return { r, c }; }
    }
    return null;
  }
  /* 라벨 오른쪽의 숫자들 (다음 글자 칸 전까지) */
  function spanNums(V, r, c){
    const out = [], row = V[r] || [];
    for(let k = c + 1; k < row.length; k++){
      const v = row[k], n = numv(v);
      if(n != null) out.push({ c:k, v:n });
      else if(typeof v === 'string' && v.trim() && !/^[-–]$/.test(v.trim())) break;
    }
    return out;
  }
  /* 견적서: '직접인건비 소계' 행 + '인원' 행 + 머리글(구분 … 계) */
  function parseEstimate(sheet){
    const V = sheet.values || [], sub = findCell(V, t => t === '직접인건비소계');
    if(!sub) return null;
    let head = null, sumCol = null;
    for(let r = sub.r - 1; r >= 0 && r >= sub.r - 15; r--){
      const k = (V[r] || []).findIndex((v, c) => c > sub.c && norm(v) === '계');
      if(k > 0){ head = r; sumCol = k; break; }
    }
    if(head == null) return null;
    let rHead = null;
    for(let r = head + 1; r < sub.r; r++){ if((V[r] || []).some((v, c) => c <= sub.c && /^인원/.test(norm(v)))){ rHead = r; break; } }
    const roles = [];
    for(let c = sub.c + 1; c < sumCol; c++){
      const name = String(V[head][c] ?? '').trim(); if(!name) continue;
      roles.push({ name, heads: rHead == null ? 0 : num(V[rHead][c]), unit: num(V[sub.r][c]) });
    }
    const total = roles.reduce((a, x) => a + x.heads * x.unit, 0);
    return { sheet: sheet.name, roles, total, sheetTotal: numv(V[sub.r][sumCol]) };
  }
  /* 견적대비 비교: 월 보수 가용 범위 · 월 보수 합계 · Gap + 직무별 총원 · 업적수당 등급별 인원 */
  function parseCompare(sheet){
    const V = sheet.values || [], av = findCell(V, t => t === '월보수가용범위');
    if(!av) return null;
    const last = cell => cell ? (spanNums(V, cell.r, cell.c).at(-1) || {}).v ?? null : null;
    const avs = spanNums(V, av.r, av.c);
    const ms = findCell(V, t => t === '월보수합계');
    const out = { sheet: sheet.name, avail: last(av), ratio: avs.length > 1 ? avs[0].v : null,
      direct: last(findCell(V, t => t === '직무별직접비계')), gap: last(findCell(V, t => t.toLowerCase() === 'gap')),
      paid: ms ? (spanNums(V, ms.r, ms.c)[0] || {}).v ?? null : null, jobs: [] };
    const tot = findCell(V, t => t === '호봉별총원');
    if(tot){
      const hr = tot.r - 1, kc = tot.c + 1;
      const pc = findCell(V, t => t === '업적수당', { r: tot.r + 1, c: tot.c });
      /* 직무 열 = '호봉별 총원' 행에 숫자가 있는 열. 이름은 호봉 행(없으면 윗줄), 그룹은 윗줄의 가장 가까운 왼쪽 이름(병합 셀) */
      const up = V[hr - 1] || [];
      let group = '';
      for(let c = kc + 1; c < Math.max((V[tot.r] || []).length, (V[hr] || []).length); c++){
        if(String(up[c] ?? '').trim()) group = String(up[c]).trim();
        if(numv((V[tot.r] || [])[c]) == null) continue;
        const own = String((V[hr] || [])[c] ?? '').trim(), name = own || String(up[c] ?? '').trim(); if(!name) continue;
        const dist = [];
        if(pc && pc.c === tot.c){
          for(let r = pc.r + 1; r < V.length && r < pc.r + 12; r++){
            const g = String((V[r] || [])[kc] ?? '').trim().toUpperCase();
            if(!/^[SA-F]\.?$/.test(g)) break;
            dist.push({ g: g[0], amt: numv(V[r][c]), n: num(V[r][c + 1]) });
          }
        }
        out.jobs.push({ name, group: own ? group : '', heads: numv(V[tot.r][c]), dist, sheetTotal: ms ? numv((V[ms.r] || [])[c]) : null });
      }
    }
    return out;
  }
  function readQuote(sheets){
    if(!Array.isArray(sheets)) return { est:null, cmp:null, found:false };
    let est = null, cmp = null;
    for(const s of sheets){ if(!cmp) cmp = parseCompare(s); }
    for(const s of sheets){ if(!est) est = parseEstimate(s); }
    return { est, cmp, found: !!(est || cmp) };
  }

  /* ---------- 계산 ---------- */
  /* 비교 시트 직무와 급여테이블 직무 짝 맞추기: 이름이 같고 그룹이 가장 비슷한 것 → 이름 앞 2글자가 같은 것 */
  const sim = (a, b) => { a = norm(a); b = norm(b); if(!a || !b) return 0; if(a === b) return 3; if(a.includes(b) || b.includes(a)) return 2; return a.slice(0, 2) === b.slice(0, 2) ? 1 : 0; };
  function matchJob(cands, name, group){
    const same = cands.filter(x => norm(x.name) === norm(name));
    if(same.length) return same.reduce((best, x) => sim(x.group, group) > sim(best.group, group) ? x : best, same[0]);
    const near = cands.filter(x => !x.group && sim(x.name, name) >= 1);
    return near.length === 1 ? near[0] : null;
  }
  const gradeMap = j => Object.fromEntries((j.grades || []).map(([g, v]) => [String(g).trim().toUpperCase()[0], numv(v)]));
  function compute(parsed, q, inp){
    const cmpJobs = (q.cmp && q.cmp.jobs) || [], used = new Set();
    const jobs = parsed.jobs.map((j, i) => {
      const key = String(j.jobName || jobLabel(j)).trim();
      const cj = matchJob(cmpJobs.filter(x => !used.has(x)), key, String(j.groupLabel || ''));
      if(cj) used.add(cj);
      const g = gradeMap(j), B = g.B, bMissing = !(B > 0);
      const heads = inp.heads[key] ?? (cj && cj.heads != null ? cj.heads : null);
      const base1 = num(j.stdPaySum) + num(j.overtime);   // 견적대비 비교 시트와 같게: 통상임금 소계 + 초과근무수당
      const manual = bMissing ? inp.perf[key] ?? null : null;
      const dist = cj && cj.dist.some(d => d.n > 0) ? cj.dist : null;
      let perfTotal = 0, src;
      if(manual != null){ perfTotal = manual * (heads || 0); src = '직접 입력'; }
      else if(dist){ perfTotal = dist.reduce((a, d) => a + (g[d.g] ?? d.amt ?? 0) * d.n, 0); src = '등급별 인원'; }
      else if(!bMissing){ perfTotal = B * (heads || 0); src = 'B등급'; }
      else src = '입력 필요';
      const ok = heads != null && heads >= 0 && src !== '입력 필요';
      return { key, label: jobLabel(j), sheetTotal: cj ? cj.sheetTotal : null, heads, base1, B: B ?? null, bMissing, manual, perfTotal, perf1: heads ? perfTotal / heads : null, src,
        total: heads != null ? base1 * heads + perfTotal : null, ok, block: j.block };
    });
    const missing = jobs.filter(x => !x.ok);
    const paid = jobs.reduce((a, x) => a + (x.total || 0), 0);
    const ratio = inp.realRatio ?? 0;
    let received = null, recvSrc = '';
    if(q.cmp && q.cmp.avail){ received = q.cmp.avail; recvSrc = `'${q.cmp.sheet}' 시트의 월 보수 가용 범위`; }
    else if(q.est && q.est.total){ received = q.est.total * (1 - ratio / 100); recvSrc = `'${q.est.sheet}' 직접인건비 소계 × 인원${ratio ? ` × (1 − 실비 청구 ${ratio}%)` : ''}`; }
    const gap = received != null ? paid - received : null;
    return { jobs, missing: missing.map(x => x.label), paid, received, recvSrc, gap, rate: received ? (paid / received - 1) * 100 : null,
      quoteTotal: q.est ? q.est.total : null, sheetPaid: q.cmp ? q.cmp.paid : null, sheetGap: q.cmp ? q.cmp.gap : null,
      roles: q.est ? q.est.roles : [], hasCmp: !!q.cmp, hasEst: !!q.est, realRatio: ratio };
  }

  /* ---------- 화면: 조견표 생성 탭 '견적 대비 직접인건비' ---------- */
  $('snapPanel').insertAdjacentHTML('beforebegin', `<div class="panel v2-quote" id="v2Quote" hidden>
    <div class="ph"><h2>견적 대비 직접인건비</h2><span class="hint">받는 직접인건비(견적) 대비 급여설계로 나가는 직접인건비 · 통계에 저장하면 [급여 통계 › 견적 대비]에 쌓입니다</span></div>
    <div id="v2QBody"></div></div>`);
  let Q = null, R = null, INP = { heads:{}, perf:{}, realRatio:0 }, center = '';
  const inpKey = () => 'quoteInputs';
  async function loadInputs(c){
    const all = (await V2X().kvGet(inpKey())) || {};
    INP = Object.assign({ heads:{}, perf:{}, realRatio:0 }, all[c] || {});
  }
  async function saveInputs(){
    const all = (await V2X().kvGet(inpKey())) || {};
    all[center] = INP; V2X().kvSet(inpKey(), all);
  }
  function render(){
    const box = $('v2Quote');
    if(!parsedData || !parsedData.jobs || !parsedData.jobs.length){ box.hidden = true; R = null; return; }
    box.hidden = false;
    R = compute(parsedData, Q, INP);
    const diffJobs = R.jobs.filter(x => x.sheetTotal != null && x.total != null && Math.abs(x.total - x.sheetTotal) >= 1000);
    const extra = V2X().extraSheets;
    const inc = R.missing.length > 0;   // 인원·업적수당 입력이 빠지면 합계를 확정하지 않음
    const status = R.rate == null ? null : inc ? ['입력 필요', 'sx'] : R.rate > 5 ? ['초과 주의', 'sr'] : R.rate > 0 ? ['초과', 'so'] : ['여유', 'sx'];
    const dash = v => inc ? '–' : v;
    /* v2.7 · 받는 금액 → 주는 금액 → 견적 대비 % 를 한 줄 흐름으로, 계산 방법은 펼쳐 보기, 정산 센터는 눈에 띄게 */
    R.settle = INP.settle || ((V2X().answers || {}).settle) || '';
    R.settleOk = INP.settleAck != null && INP.settleAck === Math.round(R.paid || 0);
    const pct = R.received ? R.paid / R.received * 100 : null;
    const settleSeg = `<div class="v2-qsettle-seg" role="radiogroup" aria-label="인건비 정산 여부"><span>인건비 정산</span>${['정산', '미정산'].map(v => `<button type="button" data-settle="${v}" aria-pressed="${R.settle === v}">${v}</button>`).join('')}</div>`;
    const kpi = R.received == null ? `<div class="v2-qnote">${extra == null
        ? '견적서 시트 정보가 없습니다. 보안 파일은 <b>자동연동 스크립트 v2.6</b>(관리자 1회 교체)부터 견적서·견적대비 비교 시트를 함께 보냅니다. 일반 엑셀은 그대로 읽습니다.'
        : `견적서 시트를 찾지 못했습니다 (받은 시트: ${h(extra.map(s => s.name).join(', ') || '없음')}). '직접인건비 소계' 행이 있는 시트를 견적서로 읽습니다.`}</div>`
      : `${settleSeg}
      ${R.settle === '정산' ? `<div class="v2-qsettle ${inc ? '' : R.settleOk ? 'ack' : 'need'}">
        <div class="v2-qsettle-head">정산 센터 <span>견적 직접인건비와 급여설계 직접인건비가 같아야 정산 차액이 생기지 않습니다</span></div>
        <div class="v2-qsettle-big">${inc ? '입력 필요' : `견적 대비 <b>${pct.toFixed(1)}%</b> · 차이 <b>${R.gap > 0 ? '+' : ''}${won(R.gap)}원</b>/월`}</div>
        ${inc ? '' : `<label class="v2-check"><input type="checkbox" id="v2QSettleAck"${R.settleOk ? ' checked' : ''}> 이 차이를 확인했습니다 (금액이 바뀌면 다시 확인)</label>`}</div>`
        : R.settle === '미정산' ? '<p class="hint">미정산 센터: 견적과 급여설계의 차이는 회사의 여유(또는 초과)로 남습니다.</p>' : '<p class="hint">정산 여부를 고르면 정산 센터는 견적과 맞는지 강조해서 보여 줍니다.</p>'}
      <div class="v2-qflow">
        <div><span>① 받는 금액 (견적 직접인건비)</span><b>${won(R.received)}</b><small>월 · 연 ${won(R.received * 12)}</small></div>
        <i aria-hidden="true">→</i>
        <div><span>② 주는 금액 (급여설계 직접인건비)</span><b>${dash(won(R.paid))}</b><small>${inc ? `입력 필요 ${R.missing.length}개` : `월 · 연 ${won(R.paid * 12)}`}</small></div>
        <i aria-hidden="true">=</i>
        <div class="${!inc && R.gap > 0 ? 'over' : ''}"><span>③ 견적 대비 (②÷①)</span><b>${dash(`${pct.toFixed(1)}%`)}</b><small>${dash(`${R.gap > 0 ? '초과' : '여유'} ${R.gap > 0 ? '+' : ''}${won(R.gap)}원/월`)} <span class="v2-qst ${status[1]}">${status[0]}</span></small></div>
      </div>
      ${inc ? '' : `<div class="v2-qbar" title="100% = 견적과 같음"><div style="width:${Math.min(100, pct / 1.2)}%"></div><em style="left:${100 / 1.2}%">100%</em></div>`}
      <details class="v2-qhow"><summary>계산 방법 보기</summary><ul>
        <li><b>① 받는 금액</b>: ${h(R.recvSrc)}${!R.hasCmp && R.hasEst ? ` · 실비 청구 비율 <input type="number" id="v2QRatio" min="0" max="50" step="0.1" value="${R.realRatio}" style="width:64px">%` : ''}</li>
        <li><b>② 주는 금액</b>: 직무마다 (통상임금 소계 + 초과근무수당) × 인원 + 업적수당(등급별 인원, 없으면 B등급 × 인원)을 더한 값 (통신비·야간수당 제외, 엑셀 '견적대비 비교' 시트와 같은 방식)</li>
        <li><b>③ 견적 대비</b>: ② ÷ ① × 100. 100%보다 크면 받는 돈보다 많이 주는 설계(초과), 작으면 여유입니다. 5%를 넘게 초과하면 '초과 주의'로 표시합니다.</li>
        ${R.sheetPaid != null ? `<li>엑셀 '견적대비 비교'의 월 보수 합계 ${won(R.sheetPaid)}원과 ${Math.abs(R.sheetPaid - R.paid) < 1000 ? '<b class="v2-qok">일치</b>' : `<b class="v2-qbad">${won(R.paid - R.sheetPaid)}원 차이</b>${diffJobs.length ? ` — 직무 ${diffJobs.length}개(${h(diffJobs.map(x => x.label).join(', '))})가 엑셀과 다릅니다. 표의 '엑셀' 값과 비교해 엑셀 시트의 빈 칸이나 입력값을 확인해 주세요` : ''}`}</li>` : ''}
      </ul></details>`;
    const miss = R.missing.length ? `<p class="v2-qwarn"><b>먼저 입력해 주세요</b> · 직무 ${R.missing.length}개(${h(R.missing.join(', '))})의 인원 또는 1인 업적수당(B등급이 없거나 0원)이 비어 있습니다. 아래 표의 노란 칸을 채우면 ②·③이 계산되고 통계에 반영됩니다.</p>` : '';
    $('v2QBody').innerHTML = miss + kpi + `<div class="tblwrap"><table class="grid v2-qtbl"><thead><tr><th>직무</th><th class="r">인원</th><th class="r">1인 월 보수<br><small>(통상임금+초과근무)</small></th><th class="r">1인 업적수당</th><th>업적수당 산출</th><th class="r">직무 계 (월)</th></tr></thead><tbody>
      ${R.jobs.map(x => `<tr class="${x.ok ? '' : 'miss'}"><td>${h(x.label)}</td>
        <td class="r"><input type="number" min="0" step="1" data-qh="${h(x.key)}" value="${x.heads ?? ''}" placeholder="입력"></td>
        <td class="r num">${won(x.base1)}</td>
        <td class="r">${x.bMissing ? `<input type="number" min="0" step="1000" data-qp="${h(x.key)}" value="${x.manual ?? ''}" placeholder="직접 입력" title="업적수당 B등급이 없거나 0원이라 직접 입력합니다">` : `<span class="num">${x.perf1 == null ? won(x.B) : won(x.perf1)}</span>`}</td>
        <td><span class="v2-qsrc">${h(x.src)}</span>${x.bMissing ? ' <small class="hint">B등급 없음·0원</small>' : ''}</td>
        <td class="r num"><b>${won(x.total)}</b>${x.sheetTotal != null && x.total != null && Math.abs(x.total - x.sheetTotal) >= 1000 ? `<br><small class="v2-qbad" title="엑셀 '견적대비 비교' 시트의 이 직무 월 보수 합계">엑셀 ${won(x.sheetTotal)}</small>` : ''}</td></tr>`).join('')}
      <tr class="sum"><td>합계</td><td class="r num">${won(R.jobs.reduce((a, x) => a + (x.heads || 0), 0))}</td><td colspan="3"></td><td class="r num"><b>${won(R.paid)}</b></td></tr></tbody></table></div>
      ${R.roles.length ? `<p class="hint">견적서 직무: ${R.roles.filter(r => r.heads || r.unit).map(r => `${h(r.name)} ${r.heads}명 × ${won(r.unit)}`).join(' · ')} = 월 ${won(R.quoteTotal)}원</p>` : ''}
      <div class="v2-qmemo"><label>사유 메모 (선택 · 통계 저장 때 함께 기록) <select id="v2QCat">${memoCats().map(c => `<option>${h(c)}</option>`).join('')}</select></label>
        <textarea id="v2QMemo" rows="2" placeholder="예) 26년 4월 재계약 단가 인상 전 선반영"></textarea></div>`;
  }
  $('v2QBody').addEventListener('click', e => {
    const b = e.target.closest('[data-settle]'); if(!b) return;
    INP.settle = b.dataset.settle; INP.settleAck = null;
    if(V2X().setAnswers) V2X().setAnswers({ settle: INP.settle });
    saveInputs(); const memo = ($('v2QMemo') || {}).value || '', cat = ($('v2QCat') || {}).value; render(); $('v2QMemo').value = memo; if(cat) $('v2QCat').value = cat;
    if(typeof updateDashboard === 'function') updateDashboard();
  });
  const memoCats = () => SETTINGS.memoCats || ['최저임금 인상 선반영', '재계약 대비 인상', '인력 유지·채용난', '고객사 요청', '기타'];
  $('v2QBody').addEventListener('change', e => {
    const t = e.target;
    if(t.dataset.qh){ const v = t.value === '' ? undefined : Math.max(0, +t.value); if(v === undefined) delete INP.heads[t.dataset.qh]; else INP.heads[t.dataset.qh] = v; }
    else if(t.dataset.qp){ const v = t.value === '' ? undefined : Math.max(0, +t.value); if(v === undefined) delete INP.perf[t.dataset.qp]; else INP.perf[t.dataset.qp] = v; }
    else if(t.id === 'v2QRatio'){ INP.realRatio = Math.max(0, Math.min(50, +t.value || 0)); }
    else if(t.id === 'v2QSettleAck'){ INP.settleAck = t.checked ? Math.round(R.paid || 0) : null; }
    else return;
    saveInputs(); const memo = $('v2QMemo').value, cat = $('v2QCat').value; render(); $('v2QMemo').value = memo; $('v2QCat').value = cat;
    if(typeof updateDashboard === 'function') updateDashboard();   // 단계 탭의 '견적 검증' 상태 갱신
  });

  const origShow = showParsed;
  showParsed = function(parsed){
    const r = origShow.apply(this, arguments);
    Q = readQuote(V2X().extraSheets);
    center = String(parsed && parsed.centerName || '').trim();
    loadInputs(center).then(render);
    return r;
  };

  /* ---------- 통계 저장에 함께 기록 ---------- */
  const origBuild = buildSnapshot;
  buildSnapshot = function(meta){
    const rec = origBuild(meta);
    if(!R) return rec;
    rec.jobs.forEach((j, i) => {
      const x = R.jobs[i]; if(!x) return;
      if(x.heads != null) j.heads = x.heads;
      if(x.manual != null){   // B등급 없음·0원 → 입력한 1인 업적수당을 월 보수 합계에 반영
        j.perf = x.manual; j.gradeB = x.manual; j.perfManual = true;
        j.monthlyTotal = num(j.stdPaySum) + num(j.overtime) + num(j.night) + num(j.telecom) + x.manual;
        const p = window.__v2pay ? window.__v2pay(j) : { monthly: j.monthlyTotal, hourly: j.hours ? j.monthlyTotal / j.hours : null };
        j.compareMonthly = p.monthly; j.hourly = p.hourly;
      }
    });
    if(R.received != null) rec.quote = { settle: R.settle || '', settleOk: !!R.settleOk, incomplete: R.missing.length > 0, received: R.received, paid: R.paid, gap: R.gap, rate: R.rate, recvSrc: R.recvSrc, quoteTotal: R.quoteTotal,
      sheetPaid: R.sheetPaid, sheetGap: R.sheetGap, realRatio: R.realRatio, missing: R.missing,
      jobs: R.jobs.map(x => ({ job: x.label, heads: x.heads, base1: x.base1, perfTotal: x.perfTotal, src: x.src, total: x.total })), roles: R.roles };
    const text = ($('v2QMemo') || {}).value;
    if(text && text.trim() && window.__v2memo) window.__v2memo.add({ center: rec.center, period: rec.period, cat: $('v2QCat').value, text: text.trim() }).then(() => { $('v2QMemo').value = ''; });
    return rec;
  };
  window.__v2quote = { readQuote, compute, get result(){ return R; } };
})();

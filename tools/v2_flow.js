/* ============================================================
   v2.7 · 조견표 생성 화면을 단계별 탭으로
   ① 업로드·기본정보 → ② 검사 → ③ 견적 검증 → ④ 조견표·동의서 → ⑤ 받기·올리기 → ⑥ 통계 저장 → ⑦ 완료
   - 기존 패널은 그대로 두고 지금 단계의 패널만 보이게 함 (기능 코드는 바꾸지 않음)
   - 위쪽 요약(센터·인식 직무·검사 결과·생성 조견표)과 아래 '다음 할 일' 막대는 그대로
   - 모든 단계를 눌러 볼 수 있음(아직 못 하는 단계는 무엇을 먼저 해야 하는지 안내), 일이 끝나면 다음 단계로 자동으로 넘어감
   ============================================================ */
(() => {
  const $ = id => document.getElementById(id);
  const h = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
  const V2X = () => window.__v2 || {};
  const pane = $('tabCreate');
  if(!pane) return;

  /* ---------- 단계별 새 패널 ---------- */
  $('snapPanel').insertAdjacentHTML('beforebegin', `
  <div class="panel v2-lockmsg" id="v2FlowLock" hidden><b id="v2FlowLockT"></b><p class="hint" id="v2FlowLockM"></p><button type="button" class="btn-ghost btn-sm" id="v2FlowLockGo"></button></div>
  <div class="panel" id="v2QuoteNone" hidden><div class="ph"><h2>견적 대비 직접인건비</h2></div>
    <p class="hint">이 파일에는 견적서·견적대비 비교 시트가 없어 견적 검증을 건너뜁니다. 다음 단계로 넘어가세요.</p></div>
  <div class="panel" id="v2ConPlan" hidden><div class="ph"><h2>변경동의서 확인</h2><span class="hint" id="v2ConPlanSum"></span></div>
    <div class="tblwrap"><table class="grid"><thead><tr><th>호봉</th><th>변경동의서</th><th>기존과 달라진 항목</th></tr></thead><tbody id="v2ConPlanBody"></tbody></table></div>
    <p class="hint">기존과 완전히 같은 호봉은 동의서를 만들지 않습니다. 동의서는 다음 단계에서 조견표 PNG와 함께 ZIP으로 받습니다.</p></div>
  <div class="panel" id="v2Get" hidden><div class="ph"><h2>받기 · SharePoint에 올리기</h2></div>
    <div class="v2-get">
      <div><b>1. 한 번에 받기</b><p class="hint" id="v2GetWhat"></p><button type="button" class="btn-primary v2-big" id="v2GetZip">전체 일괄 다운로드 (ZIP)</button></div>
      <div><b>2. SharePoint에 올리기</b><p class="hint">받은 ZIP을 열린 03_조견표 폴더에 끌어다 놓아 주세요. (회사 보안 정책상 조견표·동의서 파일은 자동으로 올릴 수 없고, 브라우저로 직접 올려야 합니다)</p><span id="v2GetUp"></span></div>
    </div>
    <details class="v2-getprev"><summary>조견표 미리보기 펼치기</summary><p class="hint">아래 '생성 결과'에서 장별로 확인하거나 따로 받을 수 있습니다.</p></details></div>
  <div class="panel" id="v2FlowDone" hidden><div class="ph"><h2>완료</h2></div><div id="v2FlowDoneBody"></div>
    <div class="v2-act" style="justify-content:flex-start">
      <button type="button" class="btn-ghost" data-done="stats">급여 통계 보기</button>
      <button type="button" class="btn-ghost" data-done="report">보고서 만들기</button>
      <button type="button" class="btn-primary" data-done="new">다른 조견표 만들기</button></div></div>`);

  const STEPS = [
    { k:'up', t:'업로드·기본정보', el: () => [$('dropzone').closest('.panel')] },
    { k:'check', t:'검사', el: () => [$('v2Compare'), $('checkPanel')] },
    { k:'quote', t:'견적 검증', el: () => [$('v2Quote'), $('v2QuoteNone')] },
    { k:'make', t:'조견표·동의서', el: () => [$('jobPanel'), $('workspace'), $('v2ConPlan')] },
    { k:'get', t:'받기·올리기', el: () => [$('v2Get'), $('resultPanel')] },
    { k:'save', t:'통계 저장', el: () => [$('snapPanel')] },
    { k:'done', t:'완료', el: () => [$('v2FlowDone')] }
  ];
  const nav = document.createElement('ol');
  nav.className = 'v2-flow'; nav.id = 'v2Flow'; nav.setAttribute('aria-label', '조견표 만들기 단계');
  const stepper = $('stepper');
  pane.insertAdjacentElement('afterbegin', nav);
  if(stepper) stepper.hidden = true;
  pane.classList.add('v2-flowon');

  let forced = false, view = 'up', last = { parsed: null, cards: 0, zip: false, snap: false };
  const has = () => typeof parsedData !== 'undefined' && !!parsedData;
  const cards = () => typeof cardRegistry !== 'undefined' ? cardRegistry.length : 0;

  /* 단계 상태: done(완료) · cur(진행 가능) · warn(확인 필요, 넘어갈 수 있음) · skip(해당 없음) · stop(막힘) · lock(아직) */
  function status(){
    const s = {}, p = has();
    const iss = p && typeof checkState !== 'undefined' && checkState ? checkState.issues || [] : [];
    const blocks = iss.filter(i => i.level === 'block').length;
    const gate = p && typeof checkGateOpen === 'function' && checkGateOpen();
    const R = (window.__v2quote || {}).result;
    s.up = p ? ['done', '완료'] : ['cur', '진행 전'];
    s.check = !p ? ['lock', '대기'] : blocks ? ['stop', `차단 ${blocks}`] : gate ? ['done', '완료'] : ['cur', '확인 필요'];
    const ok = s.check[0] === 'done';
    s.quote = !ok ? ['lock', '대기'] : !R || R.received == null ? ['skip', '해당 없음']
      : R.missing.length ? ['warn', `입력 ${R.missing.length}`] : R.settle === '정산' && !R.settleOk ? ['warn', '정산 확인'] : ['done', `${(R.paid / R.received * 100).toFixed(1)}%`];
    s.make = !ok ? ['lock', '대기'] : cards() ? ['done', `${cards()}장`] : ['cur', '진행 가능'];
    s.get = !cards() ? ['lock', '대기'] : zipDone ? ['done', '받음'] : ['cur', '진행 가능'];
    s.save = !cards() ? ['lock', '대기'] : snapSaved ? ['done', '저장됨'] : ['cur', '진행 가능'];
    s.done = snapSaved ? ['done', '완료'] : ['lock', '대기'];
    return s;
  }
  function setView(k, force){   // 아직 못 하는 단계도 열어 볼 수 있음 (안내만 보임)
    const st = status();
    if(!st[k]) return false;
    view = k; forced = !!force; render(st);
    window.scrollTo({ top: Math.max(0, nav.getBoundingClientRect().top + window.scrollY - 70), behavior:'smooth' });
    return true;
  }
  function render(st){
    st = st || status();
    nav.innerHTML = STEPS.map((x, i) => `<li><button type="button" data-flow="${x.k}" class="${st[x.k][0]}${x.k === view ? ' on' : ''}"${st[x.k][0] === 'lock' ? ' title="아직 진행할 수 없는 단계입니다. 눌러서 무엇을 먼저 해야 하는지 볼 수 있습니다."' : ''}>
      <span class="n">${st[x.k][0] === 'done' ? '✓' : i + 1}</span><span class="t">${x.t}</span><span class="s">${h(st[x.k][1])}</span></button></li>`).join('');
    STEPS.forEach(x => x.el().forEach(e => { if(e) e.classList.toggle('v2-off', x.k !== view); }));
    const R = (window.__v2quote || {}).result;
    $('v2QuoteNone').hidden = !(view === 'quote' && (!R || R.received == null));
    if(view === 'make') drawPlan();
    if(view === 'get') drawGet();
    if(view === 'done') drawDone();
    /* 아직 못 하는 단계: 그 단계 화면 대신 무엇을 먼저 해야 하는지 안내 */
    const locked = st[view][0] === 'lock' && !forced;
    if(locked){
      const need = !has() ? ['up', '① 급여테이블을 먼저 올려 주세요.', '① 업로드로 가기']
        : st.check[0] !== 'done' ? ['check', '② 검사에서 차단·확인 항목을 먼저 처리해 주세요.', '② 검사로 가기']
        : !cards() ? ['make', '④ 조견표·동의서에서 조견표를 먼저 만들어 주세요.', '④ 조견표 만들기로 가기']
        : ['save', '⑥ 통계 저장을 마치면 완료됩니다.', '⑥ 통계 저장으로 가기'];
      $('v2FlowLockT').textContent = `${STEPS.findIndex(x => x.k === view) + 1}. ${STEPS.find(x => x.k === view).t} — 아직 진행할 수 없습니다`;
      $('v2FlowLockM').textContent = need[1]; $('v2FlowLockGo').textContent = need[2]; $('v2FlowLockGo').dataset.go = need[0];
    }
    $('v2FlowLock').hidden = !locked;
    if(locked) STEPS.forEach(x => x.el().forEach(e => { if(e) e.classList.add('v2-off'); }));
    $('v2QuoteNone').hidden = locked || $('v2QuoteNone').hidden;
    $('v2ConPlan').hidden = locked || view !== 'make' || !$('v2ConPlanBody').children.length;
    $('v2Get').hidden = locked || view !== 'get';
    $('v2FlowDone').hidden = locked || view !== 'done';
  }
  $('v2FlowLockGo').addEventListener('click', e => setView(e.target.dataset.go));
  nav.addEventListener('click', e => { const b = e.target.closest('[data-flow]'); if(b) setView(b.dataset.flow); });

  /* ④ 변경동의서 확인 */
  function drawPlan(){
    const P = window.__v2consent && has() ? window.__v2consent.plan() : null;
    if(!P){ $('v2ConPlanBody').innerHTML = ''; return; }
    const make = P.rows.filter(r => r.make).length, same = P.rows.length - make;
    $('v2ConPlanSum').textContent = `만들 동의서 ${make}개 · 기존과 같아 제외 ${same}개${P.fresh.length ? ` · 신규 호봉 제외 ${P.fresh.length}개` : ''}`;
    $('v2ConPlanBody').innerHTML = P.rows.map(r => `<tr class="${r.make ? '' : 'v2-muted'}"><td>${h(r.job)}</td><td>${r.make ? '<b class="v2-qok">생성</b>' : '제외 (기존과 같음)'}</td><td>${h(r.changed.join(', ') || '-')}</td></tr>`).join('')
      + P.fresh.map(n => `<tr class="v2-muted"><td>${h(n)}</td><td>제외 (신규 호봉)</td><td>기존 값 없음</td></tr>`).join('');
  }
  /* ⑤ 받기·올리기 */
  function drawGet(){
    const P = window.__v2consent && has() ? window.__v2consent.plan() : null, n = P ? P.rows.filter(r => r.make).length : 0;
    $('v2GetWhat').textContent = `조견표 PNG ${cards()}장` + (n ? ` + 변경동의서 Word ${n}개` : P === null ? ' (신규 센터 · 변경동의서 없음)' : '') + '를 ZIP 한 개로 받습니다.';
    const up = V2X().folderUrl ? V2X().folderUrl(V2X().SUB.table) : '';
    $('v2GetUp').innerHTML = up ? `<a class="btn-ghost v2-big v2-link" href="${h(up)}" target="_blank" rel="noopener">SharePoint 03_조견표 폴더 열기 ↗</a>`
      : '<span class="hint">SharePoint 주소가 설정되지 않았습니다. [기준정보 관리 › SharePoint 주소]에서 넣으면 폴더 바로가기가 생깁니다.</span>';
  }
  $('v2GetZip').addEventListener('click', () => V2X().makeZip && V2X().makeZip());
  /* 결과 미리보기는 기본 접힘 (PNG 캡처를 위해 화면 밖에서 그려 둠) */
  const prevBox = document.querySelector('.v2-getprev');
  $('resultPanel').classList.add('v2-collapsed');
  prevBox.addEventListener('toggle', () => $('resultPanel').classList.toggle('v2-collapsed', !prevBox.open));
  /* ⑦ 완료 */
  function drawDone(){
    const c = has() ? parsedData.centerName : '';
    $('v2FlowDoneBody').innerHTML = `<p><b>${h(c)}</b> · 조견표 ${cards()}장 ${zipDone ? '받음' : ''} · 통계 저장 완료. [급여 통계]와 [인건비 분석 보고서]에 반영되었습니다.</p>`;
  }
  $('v2FlowDone').addEventListener('click', e => {
    const b = e.target.closest('[data-done]'); if(!b) return;
    if(b.dataset.done === 'stats') switchAppTab('stats');
    else if(b.dataset.done === 'report') switchAppTab('report');
    else { view = 'up'; render(); $('fileInput').click(); }
  });

  /* 아래 막대 버튼을 누르면 그 일을 하는 단계를 먼저 펼침 */
  const N2S = { check:'check', ackall:'check', gen:'make', result:'get', zip:'get', snap:'save', new:'up' };
  document.addEventListener('click', e => {
    const b = e.target.closest('#v2Next [data-n]'); if(!b || !N2S[b.dataset.n]) return;
    view = N2S[b.dataset.n]; render();
    if(b.dataset.n === 'result'){ prevBox.open = true; setTimeout(() => $('resultPanel').scrollIntoView({ behavior:'smooth' }), 50); }
  }, true);
  $('zipBtn').addEventListener('click', () => { if(view !== 'get'){ view = 'get'; render(); } }, true);

  /* 일이 끝나면 다음 단계로: 새 파일 → 검사, 조견표 생성 → 받기, ZIP → 통계 저장, 통계 저장 → 완료 */
  const origDash = updateDashboard;
  updateDashboard = function(){
    origDash.apply(this, arguments);
    try{
      const p = has() ? parsedData : null, now = { parsed: p, cards: cards(), zip: zipDone, snap: snapSaved };
      const before = view;
      if(p && p !== last.parsed) view = 'check';
      else if(now.cards && !last.cards) view = 'get';
      else if(now.zip && !last.zip) view = 'save';
      else if(now.snap && !last.snap) view = 'done';
      else if(!p && last.parsed) view = 'up';
      if(view !== before) forced = false;
      last = now;
      render();
    }catch(err){ console.error(err); }
  };
  /* 화면 전환 때 원래 진행 표시줄이 다시 보이지 않게 */
  const origSwitchF = switchAppTab;
  switchAppTab = function(tabId){ origSwitchF(tabId); if(stepper) stepper.hidden = true; };
  window.__v2flow = { setView, get view(){ return view; }, status, render };
  render();
})();

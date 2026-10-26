/* ============================================================
   급여관리 시스템 v2 전용 스크립트 (급여조견표_관리시스템_v2.html 에만 들어감)
   - 첫 실행 안내(이름 → 폴더 받기 → 폴더 연결) 후에는 사용자가 설정할 것이 없음
   - 공유 폴더(SharePoint '급여조견표'를 OneDrive로 PC에 받은 폴더)를 통해
       01_원본       ← 화면에서 올린 엑셀을 요청ID를 붙여 저장 (Power Automate가 처리)
       02_연동데이터 → Power Automate가 만든 .json / .error.json 을 자동으로 읽음
       04_스냅샷     ↔ 통계 저장 파일 (모든 사용자가 함께 봄)
       99_설정       ↔ 공유 설정(settings.json), 버전 안내(version.json)
   - 저장소는 v1과 별도(paytable-system-v2). v1 데이터는 건드리지 않음
   ============================================================ */
(function(){
  const V2 = window.V2_CONFIG || {};
  const FOLDER = V2.folderName || '급여조견표';
  const SUB = { src:'01_원본', link:'02_연동데이터', table:'03_조견표', snap:'04_스냅샷', report:'05_보고서', cfg:'99_설정' };
  const POLL_MS = 10000, SLOW_MS = 5 * 60000, FAIL_MS = 15 * 60000;
  const $ = id => document.getElementById(id);
  const h = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));

  let shareDir = null, profile = null, pending = null, pollTimer = null, tickTimer = null;
  let answers = null, requestId = '';

  /* ---------- 화면 요소 ---------- */
  document.body.insertAdjacentHTML('beforeend', `
  <div class="v2-modal" id="v2Wizard" hidden role="dialog" aria-modal="true" aria-labelledby="v2WizTitle">
    <div class="v2-card">
      <div class="v2-wiz-head"><small>처음 한 번만</small><h2 id="v2WizTitle">급여관리 시스템 시작하기</h2>
        <ol class="v2-dots"><li data-dot="1">이름</li><li data-dot="2">폴더 받기</li><li data-dot="3">폴더 연결</li></ol></div>
      <section data-wiz="1">
        <p>조견표·통계 기록에 남길 이름입니다. 요청 번호에는 영문 이니셜이 들어갑니다.</p>
        <label>이름 <input type="text" id="v2Name" autocomplete="name" placeholder="홍길동"></label>
        <label>영문 이니셜 (2~4자) <input type="text" id="v2Ini" maxlength="4" placeholder="HGD"></label>
        <p class="v2-err" id="v2Err1"></p>
        <div class="v2-act"><button type="button" class="btn-primary" id="v2Next1">다음</button></div>
      </section>
      <section data-wiz="2" hidden>
        <p>팀 공유 폴더 <b>'${h(FOLDER)}'</b>를 이 PC에 받습니다. 아래 버튼으로 폴더를 열고 <b>[OneDrive에 바로 가기 추가]</b>를 한 번 눌러 주세요.</p>
        <div id="v2SpBox"></div>
        <ol class="v2-mini">
          <li>열린 화면에서 '${h(FOLDER)}' 폴더 오른쪽 <b>…</b> → <b>OneDrive에 바로 가기 추가</b></li>
          <li>1~2분 뒤 PC의 파일 탐색기 → <b>OneDrive - 회사명</b> 안에 '${h(FOLDER)}' 폴더가 보이면 완료</li>
        </ol>
        <label class="v2-check"><input type="checkbox" id="v2Synced"> 파일 탐색기에 '${h(FOLDER)}' 폴더가 보입니다</label>
        <div class="v2-act"><button type="button" class="btn-ghost" id="v2Back2">이전</button><button type="button" class="btn-primary" id="v2Next2" disabled>다음</button></div>
      </section>
      <section data-wiz="3" hidden>
        <p>아래 버튼을 누르고, 창이 뜨면 <b>OneDrive - 회사명 › ${h(FOLDER)}</b> 폴더를 골라 <b>[폴더 선택]</b>, 이어서 <b>[파일 보기 허용]·[변경 내용 저장 허용]</b>을 눌러 주세요.</p>
        <div class="v2-act"><button type="button" class="btn-primary v2-big" id="v2Pick">공유 폴더 연결</button></div>
        <p class="v2-err" id="v2Err3"></p>
        <p class="v2-ok" id="v2Ok3"></p>
        <div class="v2-act"><button type="button" class="btn-ghost" id="v2Back3">이전</button><button type="button" class="btn-primary" id="v2Done" hidden>시작하기</button></div>
      </section>
      <button type="button" class="v2-later" id="v2Later">나중에 하기 (이 PC에서만 사용)</button>
    </div>
  </div>
  <div class="v2-toast" id="v2Toast" hidden role="status"></div>`);

  const topbar = document.querySelector('.topbar');
  topbar.querySelector('.user-chip').insertAdjacentHTML('beforebegin', `<button type="button" class="v2-conn" id="v2Conn" title="공유 폴더 연결 상태"></button>`);

  /* v1의 개별 연동 폴더·서버 보관함·붙여넣기 안내는 v2에서 감추거나 예비 방법으로 접어 둠 */
  ['linkBox', 'linkFolderBtn', 'tabBtnLibrary'].forEach(id => { const el = $(id); if(el) el.hidden = true; });
  const goBtn = $('linkGoBtn');
  if(goBtn){
    goBtn.textContent = '급여테이블 올리기';
    goBtn.addEventListener('click', e => { e.stopImmediatePropagation(); $('fileInput').click(); }, true);
  }
  const paste = $('pasteBox');
  if(paste){
    const det = document.createElement('details'); det.className = 'v2-fallback';
    det.innerHTML = '<summary>자동 처리가 안 될 때 (예비 방법: 붙여넣기)</summary>';
    paste.before(det); det.appendChild(paste);
  }
  const reconnect = document.createElement('div');
  reconnect.className = 'v2-banner no-print'; reconnect.id = 'v2Reconnect'; reconnect.hidden = true;
  reconnect.innerHTML = `<span id="v2BannerTxt">공유 폴더 연결을 이어가려면 한 번 눌러 주세요.</span><button type="button" class="btn-primary btn-sm" id="v2BannerBtn">계속</button>`;
  document.querySelector('.main').insertBefore(reconnect, document.querySelector('.page-head'));

  /* 업로드 대기·질문 패널 (조견표 생성 화면, 업로드 칸 바로 아래) */
  const qPanel = document.createElement('div');
  qPanel.className = 'panel v2-job'; qPanel.id = 'v2Job'; qPanel.hidden = true;
  qPanel.innerHTML = `
    <div class="v2-job-head">
      <div><span class="v2-state" id="v2State">처리 중</span> <b id="v2JobFile"></b><div class="hint" id="v2JobSub"></div></div>
      <div class="v2-timer" id="v2Timer">0:00</div>
    </div>
    <div class="v2-track"><div class="v2-fill" id="v2Fill"></div></div>
    <p class="hint" id="v2JobMsg"></p>
    <h3 class="v2-qh">기다리는 동안 아래 내용을 골라 주세요 <span class="hint">(통계 저장에 그대로 쓰입니다)</span></h3>
    <div class="v2-q" id="v2Q"></div>
    <div class="v2-act" id="v2JobAct"></div>`;
  $('dropzone').after(qPanel);

  /* ---------- 저장(IndexedDB kv) ---------- */
  const kvGet = k => sysStore.getKV(k).catch(() => null);
  const kvSet = (k, v) => sysStore.setKV(k, v).catch(console.error);

  /* ---------- 폴더 다루기 ---------- */
  async function sub(name, create){ return shareDir.getDirectoryHandle(name, { create: !!create }); }
  async function readJson(dir, name){
    try{ const f = await (await dir.getFileHandle(name)).getFile(); return JSON.parse((await f.text()).replace(/^﻿/, '')); }
    catch(e){ return null; }
  }
  async function writeFile(dir, name, data){
    const fh = await dir.getFileHandle(name, { create:true });
    const w = await fh.createWritable(); await w.write(data); await w.close();
  }
  async function perm(dir, ask){
    const o = { mode:'readwrite' };
    if(await dir.queryPermission(o) === 'granted') return true;
    return ask ? (await dir.requestPermission(o)) === 'granted' : false;
  }

  /* 고른 폴더가 맞는지 확인하고, 쓰기·읽기 시험까지 한 뒤 연결 */
  async function validateAndConnect(dir){
    if(/^(0\d|99)_/.test(dir.name)) throw new Error(`'${dir.name}'는 안쪽 폴더입니다. 한 단계 위의 '${FOLDER}' 폴더를 골라 주세요.`);
    const have = new Set();
    for await (const e of dir.values()) if(e.kind === 'directory') have.add(e.name);
    const missing = Object.values(SUB).filter(n => !have.has(n));
    if(missing.length && dir.name !== FOLDER){
      throw new Error(`이 폴더에는 '${SUB.src}', '${SUB.link}' 폴더가 없습니다. 'OneDrive - 회사명' 안의 '${FOLDER}' 폴더를 골라 주세요.`);
    }
    for(const n of missing) await dir.getDirectoryHandle(n, { create:true });
    const cfg = await dir.getDirectoryHandle(SUB.cfg);
    const probe = `.probe_${(profile && profile.ini) || 'USER'}.txt`;
    const stamp = new Date().toISOString();
    await writeFile(cfg, probe, stamp);
    const back = await (await (await cfg.getFileHandle(probe)).getFile()).text();
    await cfg.removeEntry(probe).catch(() => {});
    if(back !== stamp) throw new Error('폴더에 쓴 내용을 다시 읽지 못했습니다. OneDrive 동기화가 켜져 있는지 확인해 주세요.');
    shareDir = dir;
    await kvSet('shareDir', dir);
    await afterConnect();
  }

  async function afterConnect(){
    snapDir = await sub(SUB.snap, true);
    await kvSet('snapDir', snapDir);
    await loadSharedSettings();
    await importFromFolder().catch(console.error);
    await checkVersion();
    renderConn();
    if(pending) startPolling();
  }

  /* ---------- 공유 설정 ---------- */
  async function loadSharedSettings(){
    const s = await readJson(await sub(SUB.cfg, true), 'settings.json');
    if(s && s.kind === 'PAYSETTINGS' && s.settings){
      SETTINGS = Object.assign(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), s.settings);
      await saveSettings();
      const m = $('v2SetMsg'); if(m) m.textContent = `공유 설정 적용됨 · ${s.updatedBy || ''} · ${String(s.updatedAt || '').slice(0, 10)}`;
    }
  }
  async function publishSettings(){
    if(!shareDir || !(await perm(shareDir, true))) return toast('공유 폴더가 연결되어 있지 않습니다.');
    await writeFile(await sub(SUB.cfg, true), 'settings.json', JSON.stringify({ kind:'PAYSETTINGS', v:1, updatedBy: profile ? profile.name : '', updatedAt: new Date().toISOString(), settings: SETTINGS }, null, 1));
    $('v2SetMsg').textContent = '모든 사용자에게 적용했습니다. 다른 사용자는 다음에 시스템을 열 때 반영됩니다.';
  }
  async function checkVersion(){
    const v = await readJson(await sub(SUB.cfg, true), 'version.json');
    if(v && v.version && v.version > (V2.appVersion || '')){
      toast(`새 버전(${v.version})이 있습니다. PC의 '${FOLDER} › ${SUB.cfg}' 폴더에서 '${v.file || '급여조견표_관리시스템_v2.html'}'을 열어 주세요.`, 12000);
    }
  }

  /* ---------- 상단 연결 상태 ---------- */
  function renderConn(state){
    const b = $('v2Conn');
    const s = state || (shareDir ? 'on' : 'off');
    b.dataset.state = s;
    b.textContent = s === 'on' ? `공유 폴더 연결됨 · ${FOLDER}` : s === 'ask' ? '공유 폴더 다시 연결 필요' : '공유 폴더 미연결';
    const sideState = $('sideLinkState'), sideDot = $('sideLinkDot');
    if(sideState){ sideState.textContent = s === 'on' ? `공유 폴더: ${FOLDER}` : '공유 폴더 미연결'; sideDot.classList.toggle('on', s === 'on'); }
    const foot = document.querySelector('.side-foot small'); if(foot) foot.textContent = `v${V2.appVersion || '2'} · 팀 공유 폴더 사용`;
    if(profile){ const c = document.querySelector('.user-chip'); if(c) c.innerHTML = `<span class="avatar">${h(profile.ini.slice(0, 2))}</span><span><b>${h(profile.name)}</b><small>${s === 'on' ? '공유 폴더 사용 중' : '이 PC에서만 사용'}</small></span>`; }
  }
  $('v2Conn').addEventListener('click', () => shareDir ? askPermission() : openWizard(profile ? 2 : 1));

  function toast(msg, ms, action){
    const t = $('v2Toast'); t.textContent = msg; t.hidden = false;
    if(action){
      const b = document.createElement('button'); b.type = 'button'; b.className = 'v2-toast-btn'; b.textContent = action.label;
      b.addEventListener('click', () => { t.hidden = true; action.run(); }); t.appendChild(b);
    }
    clearTimeout(t._t); t._t = setTimeout(() => { t.hidden = true; }, ms || 5000);
  }

  /* ---------- 첫 실행 안내 ---------- */
  function openWizard(step){
    $('v2Wizard').hidden = false;
    const sp = V2.sharepointUrl;
    $('v2SpBox').innerHTML = sp ? `<a class="btn-primary v2-big" href="${h(sp)}" target="_blank" rel="noopener">공유 폴더 열기 (SharePoint)</a>`
      : `<p class="hint">Teams → '${h(V2.teamName || '급여조견표 관리')}' 팀 → [파일] 탭 → [SharePoint에서 열기]로 들어가 주세요.</p>`;
    if(profile){ $('v2Name').value = profile.name; $('v2Ini').value = profile.ini; }
    showStep(step || 1);
  }
  function showStep(n){
    document.querySelectorAll('#v2Wizard [data-wiz]').forEach(s => { s.hidden = s.dataset.wiz !== String(n); });
    document.querySelectorAll('#v2Wizard [data-dot]').forEach(d => d.classList.toggle('on', +d.dataset.dot <= n));
  }
  $('v2Next1').addEventListener('click', async () => {
    const name = $('v2Name').value.trim(), ini = $('v2Ini').value.trim().toUpperCase();
    if(!name || !/^[A-Z]{2,4}$/.test(ini)){ $('v2Err1').textContent = '이름과 영문 이니셜(2~4자)을 입력해 주세요.'; return; }
    $('v2Err1').textContent = '';
    profile = { name, ini }; await kvSet('profile', profile); renderConn();
    showStep(2);
  });
  $('v2Synced').addEventListener('change', e => { $('v2Next2').disabled = !e.target.checked; });
  $('v2Back2').addEventListener('click', () => showStep(1));
  $('v2Next2').addEventListener('click', () => showStep(3));
  $('v2Back3').addEventListener('click', () => showStep(2));
  $('v2Pick').addEventListener('click', async () => {
    $('v2Err3').textContent = ''; $('v2Ok3').textContent = '';
    if(typeof window.showDirectoryPicker !== 'function'){ $('v2Err3').textContent = '이 브라우저는 폴더 연결을 지원하지 않습니다. 크롬이나 엣지로 열어 주세요.'; return; }
    let dir;
    try{ dir = await window.showDirectoryPicker({ id:'paytable-share', mode:'readwrite', startIn:'documents' }); }
    catch(e){ return; }
    try{
      await validateAndConnect(dir);
      $('v2Ok3').textContent = `연결되었습니다. 쓰기·읽기 시험까지 정상입니다. 다음부터는 PC의 'OneDrive - 회사명 › ${FOLDER} › ${SUB.cfg}' 폴더에 있는 이 시스템 파일을 여시면 됩니다(바탕화면에 바로 가기를 만들어 두면 편합니다).`;
      $('v2Pick').hidden = true; $('v2Done').hidden = false; $('v2Back3').hidden = true;
    }catch(err){ $('v2Err3').textContent = err.message; }
  });
  $('v2Done').addEventListener('click', async () => { $('v2Wizard').hidden = true; await kvSet('onboarded', true); });
  $('v2Later').addEventListener('click', async () => {
    if(!profile){ $('v2Err1').textContent = '이름과 이니셜은 먼저 입력해 주세요.'; showStep(1); return; }
    $('v2Wizard').hidden = true; await kvSet('onboarded', 'later'); renderConn();
  });

  /* ---------- 다시 열었을 때 권한 이어가기 (브라우저 규칙상 클릭 1번 필요) ---------- */
  async function askPermission(){
    try{
      if(await perm(shareDir, true)){ reconnect.hidden = true; await afterConnect(); toast('공유 폴더에 다시 연결했습니다.'); }
      else { renderConn('ask'); }
    }catch(e){ openWizard(3); }
  }
  $('v2BannerBtn').addEventListener('click', askPermission);

  /* ---------- 요청ID ---------- */
  async function nextRequestId(){
    const d = new Date(), ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const pre = `${ymd}-${profile ? profile.ini : 'USER'}-`;
    let max = 0;
    const scan = async dir => { for await (const e of dir.values()){ if(e.name.startsWith(pre)) max = Math.max(max, parseInt(e.name.slice(pre.length, pre.length + 2), 10) || 0); } };
    const src = await sub(SUB.src, true);
    await scan(src);
    try{ await scan(await src.getDirectoryHandle('처리완료')); }catch(e){}
    await scan(await sub(SUB.link, true));
    return pre + String(max + 1).padStart(2, '0');
  }

  /* ---------- 업로드: 보호 여부 판별 → 원본 폴더 저장 → (보호 파일) 자동 처리 대기 ---------- */
  const isPlainXlsx = async file => { const b = new Uint8Array(await file.slice(0, 2).arrayBuffer()); return b[0] === 0x50 && b[1] === 0x4B; };
  const baseName = n => n.replace(/\.[^.]+$/, '');
  const origHandleFile = handleFile;
  handleFile = async function(file){
    if(/\.json$/i.test(file.name) || !shareDir) return origHandleFile(file);
    if(!(await perm(shareDir, false))){ reconnect.hidden = false; return origHandleFile(file); }
    const plain = await isPlainXlsx(file);
    requestId = await nextRequestId();
    const stored = `${requestId}_${file.name}`;
    try{ await writeFile(await sub(SUB.src), stored, file); }
    catch(e){ toast('원본 폴더에 저장하지 못했습니다: ' + e.message); }
    showParseError(new Error(''));
    fileMeta.textContent = `올리는 중… (${file.name})`;
    answers = Object.assign({}, (await kvGet('lastAnswers')) || {});
    pending = { requestId, file:file.name, stored, base: baseName(stored), plain, startedAt: Date.now() };
    renderJob();
    if(plain){
      setJob('done', '일반 엑셀이라 바로 읽었습니다. 원본은 공유 폴더에도 보관했습니다.');
      pending = null; await kvSet('pending', null);
      origHandleFile(file);
    } else {
      await kvSet('pending', pending);
      fileMeta.textContent = `보안 파일 처리 중 · ${file.name} · 요청번호 ${pending.requestId}`;
      setJob('wait', '보안(DRM) 파일이라 회사 M365에서 자동으로 풀어 읽는 중입니다. 보통 1~5분 걸립니다. 다른 화면을 써도 됩니다.');
      startPolling();
    }
  };

  /* 대기 중 질문 */
  const QUESTIONS = () => [
    { k:'centerType', l:'센터유형', o: SETTINGS.centerTypes },
    { k:'consultType', l:'상담유형', o:['인바운드','아웃바운드','채팅','혼합'] },
    { k:'workPattern', l:'근무형태', o:['주5일 40H','주4일 32H','단시간','교대','야간'] },
    { k:'period', l:'적용 시점', type:'month' },
    { k:'reason', l:'변경 사유', o:['최저임금 반영','변경계약','재계약','기타'] },
    { k:'contract1y', l:'계약기간 1년 이상', o:['예','아니오','모름'] },
    { k:'region', l:'지역(시·도)', o:['서울','경기','인천','부산','대구','광주','대전','울산','세종','강원','충북','충남','전북','전남','경북','경남','제주'] }
  ];
  function renderJob(){
    qPanel.hidden = false;
    const fill = $('v2Fill'); fill.style.transition = 'none'; fill.style.width = '0'; void fill.offsetWidth; fill.style.transition = '';
    $('v2JobFile').textContent = pending.file;
    $('v2JobSub').textContent = `요청번호 ${pending.requestId}`;
    if(!answers.period){ const d = new Date(); answers.period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
    $('v2Q').innerHTML = QUESTIONS().map(q => `<label><span>${h(q.l)}</span>${q.type === 'month'
      ? `<input type="month" id="v2q_${q.k}" data-q="${q.k}" value="${h(answers[q.k] || '')}">`
      : `<select id="v2q_${q.k}" data-q="${q.k}"><option value="">선택</option>${q.o.map(o => `<option${answers[q.k] === o ? ' selected' : ''}>${h(o)}</option>`).join('')}</select>`}</label>`).join('');
  }
  $('v2Q').addEventListener('change', e => {
    const k = e.target.dataset.q; if(!k) return;
    answers[k] = e.target.value; kvSet('lastAnswers', answers);
    if(pending){ pending.answers = answers; kvSet('pending', pending); }
  });
  function setJob(state, msg, actions){
    const st = $('v2State');
    st.dataset.state = state;
    st.textContent = { wait:'처리 중', slow:'지연', done:'완료', fail:'실패' }[state];
    $('v2JobMsg').textContent = msg;
    $('v2JobAct').innerHTML = actions || '';
    if(state !== 'wait' && state !== 'slow'){ clearInterval(tickTimer); $('v2Fill').style.width = '100%'; }
    renderNavBadge(state);
  }
  function renderNavBadge(state){
    const nav = document.querySelector('.app-tab[data-tab="create"]');
    if(!nav) return;
    let b = nav.querySelector('.v2-badge');
    if(!b){ b = document.createElement('span'); b.className = 'v2-badge'; nav.appendChild(b); }
    b.textContent = state === 'wait' || state === 'slow' ? '처리 중' : state === 'fail' ? '실패' : state === 'done' ? '완료' : '';
    b.hidden = !b.textContent;
    b.dataset.state = state;
  }

  function startPolling(){
    if(!pending || !shareDir) return;
    if(pending.answers) answers = pending.answers;
    if(qPanel.hidden){ answers = answers || {}; renderJob(); setJob('wait', '보안(DRM) 파일을 자동으로 읽는 중입니다. 다른 화면을 써도 됩니다.'); }
    clearInterval(pollTimer); clearInterval(tickTimer);
    const tick = () => {
      const ms = Date.now() - pending.startedAt, s = Math.floor(ms / 1000);
      $('v2Timer').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      $('v2Fill').style.width = Math.min(95, ms / SLOW_MS * 90) + '%';
      if(ms > FAIL_MS) return fail('15분이 지나도 결과가 오지 않았습니다.');
      if(ms > SLOW_MS && $('v2State').dataset.state === 'wait') setJob('slow', '평소보다 오래 걸립니다. PC의 OneDrive가 동기화 중인지(작업 표시줄 구름 아이콘) 확인해 주세요. 계속 기다리는 중입니다.');
    };
    tick(); tickTimer = setInterval(tick, 1000);
    const poll = async () => {
      if(!pending) return;
      try{
        const dir = await sub(SUB.link, true);
        const err = await readJson(dir, `${pending.base}.error.json`);
        if(err) return fail('회사 M365에서 이 파일을 열지 못했습니다. 급여테이블(변경후) 시트가 있는지, 파일이 열리는지 확인해 주세요.');
        let fh = null;
        try{ fh = await dir.getFileHandle(`${pending.base}.json`); }catch(e){}
        if(fh) return arrive(await fh.getFile());
      }catch(e){ console.error(e); }
    };
    poll(); pollTimer = setInterval(poll, POLL_MS);
  }
  async function arrive(file){
    clearInterval(pollTimer);
    const done = pending; pending = null; await kvSet('pending', null);
    const onCreate = $('tabCreate') && $('tabCreate').classList.contains('on');
    const open = () => { switchAppTab('create'); handleLinkedJsonFile(file); setJob('done', '읽기를 마쳤습니다. 아래에서 검사 결과와 조견표를 확인하세요.'); renderNavBadge('opened'); };
    document.title = '● 완료 · ' + document.title.replace(/^● 완료 · /, '');
    if(onCreate && !document.hidden) open();
    else {
      setJob('done', '읽기를 마쳤습니다.', `<button type="button" class="btn-primary" id="v2Open">조견표 열기</button>`);
      $('v2Open').addEventListener('click', open);
      toast(`${done.file} 처리가 끝났습니다.`, 30000, { label:'조견표 열기', run: open });
    }
  }
  function fail(msg){
    clearInterval(pollTimer);
    setJob('fail', msg + ' 원본을 확인한 뒤 다시 올리거나, 아래 [다시 기다리기]를 눌러 주세요.',
      `<button type="button" class="btn-ghost" id="v2Retry">다시 기다리기</button><button type="button" class="btn-ghost" id="v2Drop">이 요청 닫기</button>`);
    $('v2Retry').addEventListener('click', () => { pending.startedAt = Date.now(); kvSet('pending', pending); setJob('wait', '다시 기다리는 중입니다.'); startPolling(); });
    $('v2Drop').addEventListener('click', async () => { pending = null; await kvSet('pending', null); qPanel.hidden = true; renderNavBadge('done'); });
  }
  document.addEventListener('visibilitychange', () => { if(!document.hidden) document.title = document.title.replace(/^● 완료 · /, ''); });

  /* ---------- 대기 중 답변을 통계 저장에 연결 ---------- */
  const origRenderSnap = renderSnapPanel;
  renderSnapPanel = function(){
    origRenderSnap();
    if(!answers) return;
    if(answers.centerType && SETTINGS.centerTypes.includes(answers.centerType)) $('snapType').value = answers.centerType;
    if(answers.period) $('snapPeriod').value = answers.period;
  };
  const origBuild = buildSnapshot;
  buildSnapshot = function(meta){
    return Object.assign(origBuild(meta), { v:2, requestId: requestId || '', savedBy: profile ? profile.name : '', answers: answers ? Object.assign({}, answers) : {} });
  };

  /* ---------- 기준정보 화면: 공유 설정 버튼 ---------- */
  const setPanel = $('setReset') && $('setReset').closest('.panel');
  if(setPanel){
    setPanel.insertAdjacentHTML('beforeend', `<div class="v2-share"><button type="button" class="btn-primary btn-sm" id="v2Publish">모든 사용자에게 적용</button><span class="hint" id="v2SetMsg">센터유형·상담유형·분류 규칙·기준값을 공유 폴더에 저장해 모든 사용자에게 같게 적용합니다.</span></div>`);
    $('v2Publish').addEventListener('click', publishSettings);
  }

  /* ---------- 시작 ---------- */
  (async () => {
    await loadSystem();
    profile = await kvGet('profile');
    shareDir = await kvGet('shareDir');
    pending = await kvGet('pending');
    renderConn();
    const onboarded = await kvGet('onboarded');
    if(!profile || (!shareDir && onboarded !== 'later')) return openWizard(profile ? 2 : 1);
    if(!shareDir) return;
    try{
      if(await perm(shareDir, false)) await afterConnect();
      else { renderConn('ask'); reconnect.hidden = false; }
    }catch(e){ shareDir = null; renderConn(); openWizard(3); }
  })();

  window.__v2 = { validateAndConnect, get pending(){ return pending; }, get shareDir(){ return shareDir; } };
})();

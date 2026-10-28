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
    <p class="v2-prefill" id="v2Prefill" hidden></p>
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
    reconnect.hidden = true;
    applyRole(); renderLinks(); checkNewErrors();
    if(pending) startPolling();
    if(heldFile){ const f = heldFile; heldFile = null; qPanel.querySelector('.v2-qh').hidden = false; handleFile(f); }
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
    $('v2Pick').disabled = true; $('v2Ok3').textContent = '폴더 선택 창을 여는 중… 창이 안 보이면 Alt+Tab으로 뒤에 숨은 창을 확인해 주세요.';
    try{ dir = await window.showDirectoryPicker({ id:'paytable-share', mode:'readwrite', startIn:'documents' }); }
    catch(e){
      $('v2Pick').disabled = false; $('v2Ok3').textContent = '';
      if(e && e.name === 'AbortError'){ $('v2Err3').textContent = '폴더 선택을 취소했습니다. 다시 눌러 주세요.'; return; }
      $('v2Err3').textContent = (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')
        ? '브라우저 또는 회사 보안 정책이 폴더 연결을 막았습니다. '
        : '폴더 선택 창을 열지 못했습니다. ') + `(${e && e.name}: ${e && e.message}) ` +
        'Chrome이나 Edge로 다시 열어 보시고, 그래도 안 되면 아래 [나중에 하기]를 누르세요. 붙여넣기 방식은 폴더 없이도 그대로 쓸 수 있습니다.';
      return;
    }
    $('v2Pick').disabled = false;
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

  /* ---------- 업로드: 보호 여부 판별 → 원본 폴더 저장 → (보호 파일) 자동 처리 대기 ----------
     · 일반 엑셀(zip 형식 'PK')은 바로 읽음
     · 그 외 형식은 먼저 이 PC에서 읽어 보고(.xls 등), 읽히지 않으면 보안(DRM) 파일로 보고 M365 자동 처리로 넘김
     · 공유 폴더가 연결되지 않았으면 오류 대신 연결 안내를 띄우고, 연결이 끝나면 같은 파일을 이어서 처리 */
  const isZip = async file => { const b = new Uint8Array(await file.slice(0, 2).arrayBuffer()); return b[0] === 0x50 && b[1] === 0x4B; };
  async function readsLocally(file){
    try{ parsePaytable(XLSX.read(new Uint8Array(await file.arrayBuffer()), { type:'array' })); return true; }
    catch(e){ return false; }
  }
  const baseName = n => n.replace(/\.[^.]+$/, '');
  let heldFile = null;
  const origHandleFile = handleFile;
  handleFile = async function(file){
    if(/\.json$/i.test(file.name)) return origHandleFile(file);
    const plain = (await isZip(file)) || (await readsLocally(file));
    beforeData = plain ? await beforeFromXlsx(file) : null;
    if(uploadMode() !== 'auto'){
      if(plain){ qPanel.hidden = true; return origHandleFile(file); }
      return uploadMode() === 'web' ? showWebUpload(file) : showPasteGuide(file);
    }
    let ready = false;
    if(shareDir){
      try{ ready = await perm(shareDir, !plain); }catch(e){ ready = false; }
    }
    if(!ready){
      if(plain){ if(shareDir) reconnect.hidden = false; return origHandleFile(file); }
      return holdForConnection(file);
    }
    reconnect.hidden = true;
    requestId = await nextRequestId();
    const stored = `${requestId}_${file.name}`;
    try{ await writeFile(await sub(SUB.src), stored, file); }
    catch(e){
      if(!plain) return holdForConnection(file, '공유 폴더에 파일을 저장하지 못했습니다(' + e.message + '). PC의 OneDrive가 켜져 있는지 확인한 뒤 다시 연결해 주세요.');
      toast('원본 폴더에 저장하지 못했습니다: ' + e.message);
    }
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
      setJob('wait', '보안(DRM) 파일이라 회사 M365에서 자동으로 풀어 읽는 중입니다. 보통 1~5분 걸립니다. 다른 화면을 써도 됩니다.', notifyButton());
      startPolling();
    }
  };

  /* 보안 파일인데 공유 폴더를 쓸 수 없을 때: 오류 대신 안내 + 연결 후 자동으로 이어서 처리 */
  function holdForConnection(file, why){
    heldFile = file;
    showParseError(new Error(''));
    fileMeta.textContent = `보안 파일 · ${file.name} · 공유 폴더 연결을 기다리는 중`;
    answers = answers || {};
    pending = null;
    qPanel.hidden = false;
    $('v2JobFile').textContent = file.name;
    $('v2JobSub').textContent = '보안(DRM)이 걸린 파일입니다';
    $('v2Timer').textContent = '';
    $('v2Fill').style.width = '0';
    $('v2Q').innerHTML = ''; qPanel.querySelector('.v2-qh').hidden = true;
    const msg = why || (shareDir
      ? '보안 파일은 회사 M365가 대신 읽어 옵니다. 공유 폴더 연결을 이어가려면 아래 버튼을 한 번 눌러 주세요. 누르면 이 파일을 바로 이어서 처리합니다.'
      : '보안 파일은 브라우저에서 바로 읽을 수 없어 회사 M365가 대신 읽어 옵니다. 공유 폴더를 한 번 연결하면 이 파일을 바로 이어서 처리합니다.');
    setJob('need', msg,
      `<button type="button" class="btn-primary" id="v2NeedConnect">${shareDir ? '공유 폴더 연결 계속' : '공유 폴더 연결하기'}</button>` +
      `<button type="button" class="btn-ghost" id="v2NeedPaste">예비 방법(붙여넣기) 보기</button>`);
    $('v2NeedConnect').addEventListener('click', async () => {
      if(!shareDir) return openWizard(profile ? 2 : 1);
      try{ if(await perm(shareDir, true)){ await afterConnect(); return; } }catch(e){}
      openWizard(3);
    });
    $('v2NeedPaste').addEventListener('click', () => {
      const det = document.querySelector('.v2-fallback'); if(det){ det.open = true; det.scrollIntoView({ behavior:'smooth', block:'center' }); }
    });
  }

  /* ---------- 보안 파일 처리 방식: 붙여넣기(기본) / 자동(M365) ----------
     붙여넣기: 파일을 PC 밖으로 보내지 않음(회사 DLP 반출 차단 대상 아님). PC Excel에서 스크립트 → 복사 → 여기서 Ctrl+V
     자동: 01_원본에 저장 → Power Automate. 회사 보안 예외(OneDrive 동기화 반출 예외) 승인 후에만 사용 */
  const uploadMode = () => {
    const m = SETTINGS.uploadMode;
    if(m === 'auto' || m === 'paste') return m;
    if(m === 'web' || ((V2.links || {}).upload)) return 'web';
    return 'paste';
  };
  const PASTE_SCRIPT = '급여테이블_연동_v2';
  function showPasteGuide(file){
    showParseError(new Error(''));
    fileMeta.textContent = `보안 파일 · ${file.name} · 붙여넣기로 읽습니다`;
    pending = null; requestId = '';
    answers = answers || {};
    qPanel.hidden = false;
    $('v2JobFile').textContent = file.name;
    $('v2JobSub').textContent = '보안(DRM) 파일 · 회사 보안 정책에 따라 PC 밖으로 보내지 않고 읽습니다';
    $('v2Timer').textContent = '';
    const fill = $('v2Fill'); fill.style.transition = 'none'; fill.style.width = '0';
    $('v2Prefill').hidden = true;
    kvGet('lastAnswers').then(a => { answers = Object.assign({}, a || {}, answers); if(!answers.period){ const d = new Date(); answers.period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; } renderQuestions(); });
    qPanel.querySelector('.v2-qh').hidden = false;
    setJob('paste', '아래 3단계로 읽습니다. 30초면 끝납니다.',
      `<ol class="v2-steps">
        <li>이 파일을 <b>PC의 Excel</b>에서 엽니다 (더블클릭).</li>
        <li><b>[자동화]</b> 탭 → <b>${PASTE_SCRIPT}</b> 실행 → 선택된 칸을 <b>Ctrl+C</b></li>
        <li>이 화면으로 돌아와 <b>Ctrl+V</b> (아무 곳에서나, 또는 아래 칸)</li>
      </ol>
      <textarea id="v2PasteInput" class="v2-paste" placeholder="여기에 붙여넣기 (Ctrl+V)"></textarea>
      <p class="hint">다 읽은 뒤 Excel에서 같은 스크립트를 한 번 더 실행하면 임시 시트가 지워집니다. 원본은 저장하지 않고 닫아 주세요. ${helpBtn('paste')}</p>`);
    const inp = $('v2PasteInput');
    inp.addEventListener('paste', e => { const t = e.clipboardData && e.clipboardData.getData('text'); if(t){ e.preventDefault(); inp.value = ''; handlePastedText(t); } });
    inp.addEventListener('change', () => { handlePastedText(inp.value); inp.value = ''; });
  }
  /* 웹 업로드: 사용자가 SharePoint '급여원본' 폴더에 직접 올리고(브라우저), 결과(.json)는 PC로 내려온 02_연동데이터에서 자동 감지 */
  async function showWebUpload(file){
    showParseError(new Error(''));
    requestId = '';
    answers = Object.assign({}, (await kvGet('lastAnswers')) || {}, answers || {});
    pending = { requestId:'', file:file.name, base: baseName(file.name), web:true, startedAt: Date.now() };
    renderJob();
    $('v2JobSub').textContent = '보안(DRM) 파일 · SharePoint에 직접 올리면 자동으로 읽습니다';
    fileMeta.textContent = `보안 파일 · ${file.name} · 웹 업로드 대기`;
    const up = (V2.links || {}).upload;
    setJob('upload', '아래 2단계만 하면 나머지는 자동입니다. 이 화면은 그대로 두세요.', webSteps(file.name, up));
    let canWatch = false;
    try{ canWatch = !!shareDir && await perm(shareDir, false); }catch(e){}
    if(canWatch){ await kvSet('pending', pending); startPolling(true); }
    else $('v2JobMsg').textContent = '공유 폴더가 연결되어 있지 않아 결과를 자동으로 받지 못합니다. 올린 뒤 1~5분 기다렸다가 02_연동데이터에서 결과 파일(.json)을 내려받아 여기에 끌어다 놓아 주세요.';
  }
  function webSteps(name, up){
    return `<ol class="v2-steps">
      <li>${up ? `<a class="btn-primary v2-link" href="${h(up)}" target="_blank" rel="noopener">SharePoint 업로드 폴더 열기 ↗</a>` : 'SharePoint의 <b>급여원본</b> 폴더를 엽니다.'}</li>
      <li>열린 창에 <b>${h(name)}</b> 파일을 <b>끌어다 놓습니다</b>. (이 창과 나란히 두면 편합니다)</li>
      <li>끝. 1~5분 뒤 자동으로 읽어 옵니다. 기다리는 동안 아래 내용을 골라 주세요.</li>
    </ol>`;
  }
  /* 결과 찾기: 요청번호 방식은 이름이 정확히 같고, 웹 업로드는 같은 이름으로 시작하는(SharePoint가 붙이는 ' (1)' 포함) 최근 결과 */
  async function findResult(dir, p){
    if(!p.web){
      const err = await readJson(dir, `${p.base}.error.json`);
      if(err) return { error:true };
      try{ return { file: await (await dir.getFileHandle(`${p.base}.json`)).getFile() }; }catch(e){ return null; }
    }
    let best = null;
    for await (const e of dir.values()){
      if(e.kind !== 'file' || !e.name.startsWith(p.base)) continue;
      const rest = e.name.slice(p.base.length);
      if(!/^( \(\d+\))?(\.error)?\.json$/i.test(rest)) continue;
      const f = await e.getFile();
      if(f.lastModified < p.startedAt - 60000) continue;
      if(!best || f.lastModified > best.file.lastModified) best = { file: f, error: /\.error\.json$/i.test(e.name) };
    }
    return best;
  }

  /* 화면 어디서나 Ctrl+V: 입력칸이 아닌 곳에 연동 데이터를 붙여넣으면 바로 읽음 */
  document.addEventListener('paste', e => {
    const t = e.target;
    if(t && (t.closest('input, textarea, [contenteditable="true"]'))) return;
    const text = e.clipboardData && e.clipboardData.getData('text');
    if(text && text.indexOf('PAYTABLE-V1') >= 0){ e.preventDefault(); switchAppTab('create'); handlePastedText(text); }
  });
  function pastedPayload(text){
    try{
      const lines = String(text).split(/\r?\n/).map(x => x.trim().replace(/^"|"$/g, '')).filter(Boolean);
      const i0 = lines.indexOf('PAYTABLE-V1'), i1 = lines.indexOf('END', i0 + 1);
      if(i0 < 0 || i1 < 0) return null;
      const bin = atob(lines.slice(i0 + 1, i1).map(x => x.replace(/^p/, '')).join(''));
      const bytes = new Uint8Array(bin.length); for(let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return JSON.parse(new TextDecoder('utf-8').decode(bytes));
    }catch(e){ return null; }
  }

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
    qPanel.querySelector('.v2-qh').hidden = false;
    const fill = $('v2Fill'); fill.style.transition = 'none'; fill.style.width = '0'; void fill.offsetWidth; fill.style.transition = '';
    $('v2JobFile').textContent = pending.file;
    $('v2JobSub').textContent = `요청번호 ${pending.requestId}`;
    if(!answers.period){ const d = new Date(); answers.period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
    $('v2Prefill').hidden = true;
    renderQuestions();
  }
  function renderQuestions(){
    $('v2Q').innerHTML = QUESTIONS().map(q => `<label><span>${h(q.l)} ${helpBtn(q.k)}</span>${q.type === 'month'
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
    st.textContent = { wait:'처리 중', slow:'지연', done:'완료', fail:'실패', need:'연결 필요', paste:'붙여넣기', upload:'웹 업로드' }[state];
    $('v2JobMsg').textContent = msg;
    $('v2JobAct').innerHTML = actions || '';
    if(state !== 'wait' && state !== 'slow' && state !== 'upload'){ clearInterval(tickTimer); $('v2Fill').style.width = state === 'need' || state === 'paste' ? '0' : '100%'; }
    const act = $('v2JobAct'), qh = qPanel.querySelector('.v2-qh');
    const top = state === 'paste' || state === 'upload';
    act.classList.toggle('v2-col', top);
    if(top) qPanel.insertBefore(act, qh); else qPanel.appendChild(act);   // 붙여넣기·웹 업로드 단계는 질문보다 위에
    qh.firstChild.textContent = state === 'paste' ? '아래 내용도 골라 주세요 ' : '기다리는 동안 아래 내용을 골라 주세요 ';
    renderNavBadge(state);
  }
  function renderNavBadge(state){
    const nav = document.querySelector('.app-tab[data-tab="create"]');
    if(!nav) return;
    let b = nav.querySelector('.v2-badge');
    if(!b){ b = document.createElement('span'); b.className = 'v2-badge'; nav.appendChild(b); }
    b.textContent = state === 'wait' || state === 'slow' || state === 'upload' ? '처리 중' : state === 'fail' ? '실패' : state === 'done' ? '완료' : '';
    b.hidden = !b.textContent;
    b.dataset.state = state;
  }

  function startPolling(keepState){
    if(!pending || !shareDir) return;
    if(pending.answers) answers = pending.answers;
    if(qPanel.hidden){ answers = answers || {}; renderJob();
      if(pending.web) setJob('upload', '업로드한 파일의 결과를 기다리는 중입니다. 이 화면은 그대로 두세요.', webSteps(pending.file, (V2.links || {}).upload));
      else setJob('wait', '보안(DRM) 파일을 자동으로 읽는 중입니다. 다른 화면을 써도 됩니다.'); }
    clearInterval(pollTimer); clearInterval(tickTimer);
    const tick = () => {
      const ms = Date.now() - pending.startedAt, s = Math.floor(ms / 1000);
      $('v2Timer').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      $('v2Fill').style.width = Math.min(95, ms / SLOW_MS * 90) + '%';
      if(ms > (pending.web ? 2 * FAIL_MS : FAIL_MS)) return fail(`${pending.web ? 30 : 15}분이 지나도 결과가 오지 않았습니다.`);
      const st = $('v2State').dataset.state;
      if(ms > SLOW_MS && (st === 'wait' || st === 'upload')) setJob('slow', pending.web
        ? '아직 결과가 없습니다. SharePoint 급여원본 폴더에 파일을 올렸는지 확인해 주세요. 올렸다면 PC의 OneDrive 동기화(구름 아이콘)를 확인해 주세요. 계속 기다리는 중입니다.'
        : '평소보다 오래 걸립니다. PC의 OneDrive가 동기화 중인지(작업 표시줄 구름 아이콘) 확인해 주세요. 계속 기다리는 중입니다.',
        (pending.web ? linkBtn('업로드 폴더 열기', (V2.links || {}).upload) : linkBtn('01_원본 폴더 확인', folderUrl(SUB.src))) + (isAdmin() ? linkBtn('흐름 실행 기록', LINKS.flowRuns) : ''));
    };
    tick(); tickTimer = setInterval(tick, 1000);
    const poll = async () => {
      if(!pending) return;
      try{
        const r = await findResult(await sub(SUB.link, true), pending);
        if(r && r.error) return fail('회사 M365에서 이 파일을 열지 못했습니다. 급여테이블(변경후) 시트가 있는지, 파일이 열리는지 확인해 주세요.');
        if(r && r.file) return arrive(r.file);
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
      notify('급여테이블 처리 완료', `${done.file} — 눌러서 조견표 열기`, open);
    }
  }
  function fail(msg){
    clearInterval(pollTimer);
    const who = isAdmin() ? '' : ` 계속 안 되면 요청번호 ${pending.requestId}를 관리자에게 알려 주세요.`;
    setJob('fail', msg + ' 원본을 확인한 뒤 다시 올리거나, 아래 [다시 기다리기]를 눌러 주세요.' + who,
      `<button type="button" class="btn-ghost" id="v2Retry">다시 기다리기</button><button type="button" class="btn-ghost" id="v2Drop">이 요청 닫기</button>` +
      (isAdmin() ? linkBtn('흐름 실행 기록', LINKS.flowRuns) : '') + linkBtn('02_연동데이터', folderUrl(SUB.link)));
    notify('급여테이블 처리 실패', `${pending.file} — 시스템에서 원인을 확인해 주세요.`, () => switchAppTab('create'));
    $('v2Retry').addEventListener('click', () => { pending.startedAt = Date.now(); kvSet('pending', pending);
      if(pending.web) setJob('upload', '다시 기다리는 중입니다.', webSteps(pending.file, (V2.links || {}).upload)); else setJob('wait', '다시 기다리는 중입니다.'); startPolling(); });
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

  /* ============================================================
     1차 · 바로가기 링크 / 상태 점검 / 센터별 자동 채움 / 결과 자동 보관
     ============================================================ */
  const LINKS = V2.links || {};
  const folderUrl = name => LINKS.folder ? LINKS.folder + (name ? '/' + name.split('/').map(encodeURIComponent).join('/') : '') : '';
  const linkBtn = (label, url, cls) => url ? `<a class="${cls || 'btn-ghost'} v2-link" href="${h(url)}" target="_blank" rel="noopener">${h(label)} ↗</a>` : '';
  const isAdmin = () => { const a = (SETTINGS.admins || []).filter(Boolean); return !a.length || !!(profile && a.includes(profile.ini)); };

  /* 관리자 바로가기 (기준정보 화면 맨 위) */
  const setPane = $('tabSettings');
  setPane.insertAdjacentHTML('afterbegin', `
    <div class="panel v2-admin" id="v2Admin">
      <div class="ph"><h2>관리자 바로가기</h2><div class="btn-row"><button type="button" class="btn-primary btn-sm" id="v2HealthBtn2">상태 점검</button></div></div>
      <div class="v2-links" id="v2Links"></div>
      <div class="v2-mode">
        <span class="flabel">보안 파일 처리 방식 ${helpBtn('mode')}</span>
        <label><input type="radio" name="v2Mode" value="paste" id="v2ModePaste"> <b>붙여넣기</b> · 원본 파일을 PC 밖으로 보내지 않음 (회사 보안 예외 승인 전 기본)</label>
        <label><input type="radio" name="v2Mode" value="web" id="v2ModeWeb"> <b>웹 업로드</b> · SharePoint '급여원본' 폴더에 직접 올리면 자동 처리 (권장)</label>
        <label><input type="radio" name="v2Mode" value="auto" id="v2ModeAuto"> <b>자동(M365)</b> · 01_원본에 올려 자동 처리 (OneDrive 동기화 반출 예외 승인 후)</label>
        <span class="hint" id="v2ModeMsg"></span>
      </div>
      <div class="v2-admins">
        <label>관리자 이니셜 <input type="text" id="v2AdminIni" placeholder="예: HGD, ABC"></label>
        <button type="button" class="btn-ghost btn-sm" id="v2AdminSave">저장</button>
        <span class="hint" id="v2AdminMsg">비워 두면 모든 사용자가 이 메뉴를 봅니다(혼자 쓸 때). 이니셜을 넣으면 그 사람에게만 관리자 메뉴가 보입니다.</span>
      </div>
    </div>`);
  function renderLinks(){
    const L = [
      ['공유 폴더 전체', folderUrl(''), '급여조견표 폴더'],
      ['01_원본', folderUrl(SUB.src), '올린 원본'],
      ['처리완료', folderUrl(SUB.src + '/처리완료'), '처리 끝난 원본'],
      ['02_연동데이터', folderUrl(SUB.link), '변환 결과(.json)·실패 기록'],
      ['03_조견표', folderUrl(SUB.table), '조견표 PNG·ZIP'],
      ['05_보고서', folderUrl(SUB.report), '보고서 Word'],
      ['99_설정', folderUrl(SUB.cfg), '시스템 파일·공유 설정'],
      ['급여원본 (업로드)', LINKS.upload, '보안 파일을 올리는 곳 (PC 동기화 안 함)'],
      ['급여보관 (서버 보관)', LINKS.archive, '스냅샷 자동 보관본 (PC 동기화 안 함)'],
      ['흐름 실행 기록', LINKS.flowRuns, '성공·실패 이력과 오류 원인'],
      ['흐름 편집', LINKS.flowEdit, 'Power Automate 흐름'],
      ['M365 설정 가이드', LINKS.guide, '단계별 설정 안내']
    ].filter(x => x[1]);
    $('v2Links').innerHTML = L.length ? L.map(([t, u, d]) => `<a class="v2-linkcard" href="${h(u)}" target="_blank" rel="noopener"><b>${h(t)} ↗</b><span>${h(d)}</span></a>`).join('')
      : '<p class="hint">바로가기 주소가 설정되지 않았습니다. 관리자에게 주소가 들어간 시스템 파일을 받아 주세요.</p>';
    $('v2AdminIni').value = (SETTINGS.admins || []).join(', ');
    $({ auto:'v2ModeAuto', web:'v2ModeWeb', paste:'v2ModePaste' }[uploadMode()]).checked = true;
    renderDropHint();
  }
  function renderDropHint(){
    const hint = document.querySelector('#dropzone .hint'); if(!hint) return;
    hint.innerHTML = '시트 이름이 <strong>급여테이블(변경후)</strong>인 시트를 읽습니다 · ' + {
      auto: '올린 파일은 공유 폴더(01_원본)에 요청번호와 함께 보관되고, 보안 파일은 회사 M365가 자동으로 읽습니다',
      web: '보안 파일은 SharePoint 업로드 폴더에 끌어다 놓으면 자동으로 읽습니다 (원본을 PC 동기화 폴더에 복사하지 않음)',
      paste: '원본 파일은 PC 밖으로 보내지 않으며, 보안 파일은 붙여넣기 안내가 나옵니다' }[uploadMode()];
  }
  document.querySelectorAll('input[name="v2Mode"]').forEach(r => r.addEventListener('change', async () => {
    SETTINGS.uploadMode = r.value; await saveSettings();
    let shared = false;
    if(shareDir && await perm(shareDir, false)){ await publishSettings(); shared = true; }
    renderDropHint();
    $('v2ModeMsg').textContent = ({ auto:'자동(M365)으로 바꿨습니다. 보안 예외가 승인된 경우에만 사용하세요.', web:'웹 업로드로 바꿨습니다. 보안 파일은 SharePoint 급여원본 폴더에 직접 올립니다.', paste:'붙여넣기로 바꿨습니다. 원본 파일을 PC 밖으로 보내지 않습니다.' }[r.value]) + (shared ? ' 모든 사용자에게 적용했습니다.' : '');
  }));
  $('v2AdminSave').addEventListener('click', async () => {
    const list = $('v2AdminIni').value.toUpperCase().split(/[,\s]+/).filter(x => /^[A-Z]{2,4}$/.test(x));
    if(list.length && profile && !list.includes(profile.ini)) list.unshift(profile.ini);   // 자기 자신은 빠지지 않게
    SETTINGS.admins = list; await saveSettings();
    if(shareDir && await perm(shareDir, false)) await publishSettings();
    $('v2AdminMsg').textContent = list.length ? `관리자: ${list.join(', ')} · 모든 사용자에게 적용했습니다.` : '관리자 제한 없음(모든 사용자가 관리자 메뉴를 봄).';
    applyRole(); renderLinks();
  });
  function applyRole(){
    const admin = isAdmin();
    $('v2Admin').hidden = !admin;
    const pub = $('v2Publish'); if(pub) pub.closest('.v2-share').hidden = !admin;
    const hb = $('v2HealthBtn'); if(hb) hb.hidden = false;
  }

  /* 상태 점검 */
  document.body.insertAdjacentHTML('beforeend', `
  <div class="v2-modal" id="v2Health" hidden role="dialog" aria-modal="true" aria-labelledby="v2HealthTitle">
    <div class="v2-card v2-wide">
      <div class="ph"><h2 id="v2HealthTitle">상태 점검</h2><button type="button" class="btn-ghost btn-sm" id="v2HealthClose">닫기</button></div>
      <p class="hint" id="v2HealthSub">공유 폴더·자동 처리·버전을 한 번에 확인합니다.</p>
      <ul class="v2-checks" id="v2HealthList"></ul>
      <div class="v2-act"><button type="button" class="btn-ghost" id="v2HealthAgain">다시 점검</button></div>
    </div>
  </div>`);
  $('v2Conn').insertAdjacentHTML('afterend', `<button type="button" class="v2-healthbtn" id="v2HealthBtn" title="상태 점검">점검</button>`);
  const minsAgo = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? '방금' : m < 60 ? `${m}분 전` : m < 1440 ? `${Math.round(m / 60)}시간 전` : `${Math.round(m / 1440)}일 전`; };
  async function listFiles(dir){ const out = []; for await (const e of dir.values()) if(e.kind === 'file') out.push(e); return out; }
  async function runHealth(){
    const rows = [];
    const add = (state, label, detail, action) => rows.push({ state, label, detail, action: action || '' });
    add('ok', '보안 파일 처리 방식', { auto:'자동(M365) · 01_원본에 올려 처리 (보안 예외 승인 필요)', web:'웹 업로드 · SharePoint 급여원본 폴더에 직접 올림', paste:'붙여넣기 · 원본 파일을 PC 밖으로 보내지 않음' }[uploadMode()]);
    add(typeof window.showDirectoryPicker === 'function' ? 'ok' : 'bad', '브라우저', typeof window.showDirectoryPicker === 'function' ? '폴더 연결 지원(Chrome·Edge)' : '이 브라우저는 폴더 연결을 지원하지 않습니다. Chrome이나 Edge로 열어 주세요.');
    if(!shareDir){
      add('bad', '공유 폴더 연결', '연결되어 있지 않습니다.', '<button type="button" class="btn-primary btn-sm" data-h="wizard">연결하기</button>');
      return rows;
    }
    let granted = false;
    try{ granted = await perm(shareDir, false); }catch(e){}
    if(!granted){ add('warn', '공유 폴더 연결', '브라우저 허용이 풀렸습니다. 한 번 눌러 이어가 주세요.', '<button type="button" class="btn-primary btn-sm" data-h="perm">연결 계속</button>'); return rows; }
    add('ok', '공유 폴더 연결', `${shareDir.name} 폴더 사용 중`);
    const have = new Set(); for await (const e of shareDir.values()) if(e.kind === 'directory') have.add(e.name);
    const miss = Object.values(SUB).filter(n => !have.has(n));
    add(miss.length ? 'bad' : 'ok', '폴더 구성', miss.length ? `없는 폴더: ${miss.join(', ')}` : '01·02·03·04·05·99 폴더 모두 있음', miss.length ? linkBtn('공유 폴더 열기', folderUrl('')) : '');
    try{
      const cfg = await sub(SUB.cfg, true), probe = `.probe_${(profile && profile.ini) || 'USER'}.txt`, stamp = String(Date.now());
      await writeFile(cfg, probe, stamp);
      const back = await (await (await cfg.getFileHandle(probe)).getFile()).text();
      await cfg.removeEntry(probe).catch(() => {});
      add(back === stamp ? 'ok' : 'bad', '쓰기·읽기 시험', back === stamp ? '정상' : '쓴 내용을 다시 읽지 못했습니다.');
    }catch(e){ add('bad', '쓰기·읽기 시험', '폴더에 쓰지 못했습니다: ' + e.message + ' · PC의 OneDrive가 켜져 있는지 확인해 주세요.'); }
    const link = await listFiles(await sub(SUB.link, true));
    const jsons = [], errs = [];
    for(const e of link){
      if(/\.error\.json$/i.test(e.name)) errs.push({ name:e.name, t:(await e.getFile()).lastModified });
      else if(/\.json$/i.test(e.name)) jsons.push({ name:e.name, t:(await e.getFile()).lastModified });
    }
    jsons.sort((a, b) => b.t - a.t); errs.sort((a, b) => b.t - a.t);
    add(jsons.length ? 'ok' : 'warn', '최근 자동 처리', jsons.length ? `${minsAgo(jsons[0].t)} · ${jsons[0].name}` : '아직 처리 결과가 없습니다. 가상 파일로 한 번 시험해 보세요.');
    const errDetail = errs.length ? `${errs.length}건 · 최근: ${errs.slice(0, 3).map(e => `${e.name.replace(/\.error\.json$/, '')}(${minsAgo(e.t)})`).join(', ')}` : '없음';
    add(errs.length ? 'warn' : 'ok', '처리 실패 기록', errDetail, errs.length ? (isAdmin() ? linkBtn('실행 기록', LINKS.flowRuns) : '') + linkBtn('02_연동데이터', folderUrl(SUB.link)) : '');
    const src = await listFiles(await sub(SUB.src, true));
    const stuck = [];
    for(const e of src){ const t = (await e.getFile()).lastModified; if(Date.now() - t > FAIL_MS) stuck.push({ name:e.name, t }); }
    add(stuck.length ? 'warn' : 'ok', '처리 안 된 원본', stuck.length ? `${stuck.length}건이 15분 넘게 01_원본에 남아 있습니다. 흐름이 꺼져 있거나 동기화가 멈췄을 수 있습니다. (${stuck.slice(0, 2).map(s => s.name).join(', ')})` : '없음',
      stuck.length ? (isAdmin() ? linkBtn('실행 기록', LINKS.flowRuns) : '') + linkBtn('01_원본', folderUrl(SUB.src)) : '');
    if(pending) add(Date.now() - pending.startedAt > SLOW_MS ? 'warn' : 'ok', '기다리는 요청', `${pending.requestId} · ${minsAgo(pending.startedAt)} 올림`);
    const v = await readJson(await sub(SUB.cfg, true), 'version.json');
    const newer = v && v.version && v.version > (V2.appVersion || '');
    add(newer ? 'warn' : 'ok', '시스템 버전', newer ? `지금 ${V2.appVersion}, 새 버전 ${v.version}이 있습니다. ${SUB.cfg} 폴더의 '${v.file || ''}'을 열어 주세요.` : `${V2.appVersion || '-'} (최신)`);
    await kvSet('errSeen', errs.length ? errs[0].t : 0);
    return rows;
  }
  async function openHealth(){
    $('v2Health').hidden = false;
    $('v2HealthList').innerHTML = '<li class="hint">점검 중…</li>';
    const rows = await runHealth();
    const bad = rows.filter(r => r.state === 'bad').length, warn = rows.filter(r => r.state === 'warn').length;
    $('v2HealthSub').textContent = bad ? `문제 ${bad}건, 확인 ${warn}건` : warn ? `정상 · 확인할 항목 ${warn}건` : '모두 정상입니다.';
    $('v2HealthList').innerHTML = rows.map(r => `<li data-state="${r.state}"><span class="v2-dot"></span><div><b>${h(r.label)}</b><span>${h(r.detail)}</span></div><div class="v2-act">${r.action}</div></li>`).join('');
  }
  $('v2HealthList').addEventListener('click', e => {
    const b = e.target.closest('[data-h]'); if(!b) return;
    $('v2Health').hidden = true;
    if(b.dataset.h === 'wizard') openWizard(profile ? 2 : 1); else askPermission();
  });
  ['v2HealthBtn', 'v2HealthBtn2', 'v2HealthAgain'].forEach(id => $(id).addEventListener('click', openHealth));
  $('v2HealthClose').addEventListener('click', () => { $('v2Health').hidden = true; });
  document.addEventListener('keydown', e => { if(e.key === 'Escape'){ $('v2Health').hidden = true; closeHelp(); } });

  /* 혼자 쓸 때 실패 알림: 시작할 때 새로 생긴 실패 기록이 있으면 알려 줌 */
  async function checkNewErrors(){
    try{
      const seen = (await kvGet('errSeen')) || 0;
      let n = 0, newest = 0;
      for(const e of await listFiles(await sub(SUB.link, true))){
        if(!/\.error\.json$/i.test(e.name)) continue;
        const t = (await e.getFile()).lastModified;
        if(t > seen){ n++; newest = Math.max(newest, t); }
      }
      if(n) toast(`처리 실패 기록이 새로 ${n}건 있습니다.`, 20000, { label:'상태 점검 열기', run: openHealth });
    }catch(e){ console.error(e); }
  }

  /* 센터별 자동 채움: 같은 센터의 지난 답변으로 빈 질문을 채움 */
  const CARRY = ['centerType', 'consultType', 'workPattern', 'contract1y', 'region'];
  async function prefillForCenter(center){
    if(!center) return;
    const map = (await kvGet('centerAnswers')) || {};
    let src = map[center];
    if(!src){
      const s = SNAPS.filter(x => x.center === center && x.answers).sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)))[0];
      src = s && s.answers;
    }
    if(!src) return;
    answers = answers || {};
    const filled = CARRY.filter(k => !answers[k] && src[k]);
    filled.forEach(k => { answers[k] = src[k]; });
    if(!filled.length) return;
    kvSet('lastAnswers', answers);
    if(!qPanel.hidden && $('v2Q').children.length) renderQuestions();
    const note = $('v2Prefill');
    if(note){ note.hidden = false; note.textContent = `'${center}' 지난번 답변으로 ${filled.length}개 항목을 채웠습니다. 바뀐 내용만 고쳐 주세요.`; }
  }

  /* 결과 자동 보관: 조견표 ZIP·PNG → 03_조견표, 보고서 → 05_보고서 (다운로드도 그대로) */
  const origAnchorClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function(){
    const name = this.download, href = this.href;
    if(name && /^blob:/.test(href) && shareDir){
      const target = /\.(zip|png)$/i.test(name) ? SUB.table : /^인건비분석보고서.*\.(doc|html)$/i.test(name) ? SUB.report : null;
      if(target){
        const got = fetch(href).then(r => r.blob());
        (async () => {
          try{
            if(!(await perm(shareDir, false))) return;
            const d = new Date(), stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
            const fname = `${target === SUB.table && requestId ? requestId : stamp}_${name}`;
            await writeFile(await sub(target, true), fname, await got);
            toast(`공유 폴더 ${target}에도 저장했습니다 · ${fname}`, 6000);
          }catch(e){ console.error(e); }
        })();
      }
    }
    return origAnchorClick.call(this);
  };

  /* ============================================================
     2차 · 처리 이력 / 변경전 대비 비교
     ============================================================ */
  PAGES.history = { title:'처리 이력', sub:'올린 파일의 자동 처리 상태를 요청번호별로 보여 줍니다', crumb:'업무 / 처리 이력', pane:'tabHistory' };
  const navCreate = document.querySelector('.app-tab[data-tab="create"]');
  navCreate.insertAdjacentHTML('afterend', `<button type="button" class="app-tab" role="tab" id="tabBtnHistory" data-tab="history" aria-selected="false">
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><span>처리 이력</span></button>`);
  $('tabBtnHistory').addEventListener('click', () => switchAppTab('history'));
  $('tabCreate').insertAdjacentHTML('afterend', `
  <div class="tab-pane" id="tabHistory" role="tabpanel">
    <div class="filterbar">
      <span class="flabel">보기</span><div class="seg" id="v2HistMine"><button type="button" data-mine="0" aria-pressed="true">전체</button><button type="button" data-mine="1" aria-pressed="false">내 요청</button></div>
      <label>상태 <select id="v2HistState"><option value="">전체</option><option>완료</option><option>처리 중</option><option>지연</option><option>실패</option></select></label>
      <input type="search" id="v2HistSearch" placeholder="요청번호·파일명 검색">
      <button type="button" class="btn-ghost btn-sm" id="v2HistReload">새로 고침</button>
      <span class="hint" id="v2HistCount"></span>
    </div>
    <div class="panel">
      <div class="tblwrap scroll"><table class="grid"><thead><tr><th>요청번호</th><th>파일</th><th>올린 사람</th><th>올린 시각</th><th>상태</th><th class="r">소요</th><th></th></tr></thead><tbody id="v2HistBody"></tbody></table></div>
      <p class="hint">결과가 남아 있는 요청은 [열기]로 다시 올리지 않고 조견표를 다시 만들 수 있습니다.</p>
    </div>
  </div>`);
  const origSwitch = switchAppTab;
  switchAppTab = function(tabId){
    origSwitch(tabId);
    if(tabId === 'history') renderHistory();
    if(tabId === 'settings') renderLinks();
  };
  let histRows = [], histMine = false;
  const REQ = /^(\d{8})-([A-Z]{2,4})-(\d{2})_(.+)$/;
  async function scanHistory(){
    const rows = new Map();
    const row = base => { if(!rows.has(base)){ const m = base.match(REQ); rows.set(base, { base, req: `${m[1]}-${m[2]}-${m[3]}`, ini: m[2], file: m[4], uploaded: 0, moved: false }); } return rows.get(base); };
    const scanSrc = async (dir, moved) => {
      for(const e of await listFiles(dir)){
        const b = baseName(e.name); if(!REQ.test(b)) continue;
        const r = row(b); r.file = e.name.replace(REQ, '$4'); r.uploaded = (await e.getFile()).lastModified; r.moved = moved;
      }
    };
    const src = await sub(SUB.src, true);
    await scanSrc(src, false);
    try{ await scanSrc(await src.getDirectoryHandle('처리완료'), true); }catch(e){}
    for(const e of await listFiles(await sub(SUB.link, true))){
      const isErr = /\.error\.json$/i.test(e.name);
      const b = e.name.replace(/\.error\.json$|\.json$/i, '');
      const t = (await e.getFile()).lastModified;
      if(!REQ.test(b)){
        if(!rows.has(b)){ const d = new Date(t); rows.set(b, { base:b, req:`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-웹`, ini:'웹', file:b, uploaded:0, moved:true }); }
        const r = rows.get(b);
        if(isErr) r.error = t; else { r.json = t; r.handle = e; }
        continue;
      }
      const r = row(b);
      if(isErr) r.error = t; else { r.json = t; r.handle = e; }
    }
    return [...rows.values()].map(r => {
      const age = Date.now() - (r.uploaded || r.json || r.error || Date.now());
      r.state = r.json ? '완료' : r.error ? '실패' : age > FAIL_MS ? '지연' : '처리 중';
      r.took = r.json && r.uploaded ? r.json - r.uploaded : null;
      return r;
    }).sort((a, b) => b.req.localeCompare(a.req));
  }
  async function renderHistory(){
    const body = $('v2HistBody');
    if(!shareDir || !(await perm(shareDir, false))){
      body.innerHTML = '<tr><td colspan="7" class="empty">공유 폴더가 연결되어 있어야 처리 이력을 볼 수 있습니다.</td></tr>'; $('v2HistCount').textContent = ''; return;
    }
    body.innerHTML = '<tr><td colspan="7" class="empty">읽는 중…</td></tr>';
    try{ histRows = await scanHistory(); }catch(e){ body.innerHTML = `<tr><td colspan="7" class="empty">이력을 읽지 못했습니다: ${h(e.message)}</td></tr>`; return; }
    drawHistory();
  }
  function drawHistory(){
    const q = $('v2HistSearch').value.trim(), st = $('v2HistState').value;
    const rows = histRows.filter(r => (!histMine || (profile && r.ini === profile.ini)) && (!st || r.state === st) && (!q || r.req.includes(q) || r.file.includes(q)));
    const fmt = t => t ? new Date(t).toLocaleString('ko-KR', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' }) : '-';
    const dur = ms => ms == null ? '-' : ms < 60000 ? `${Math.max(1, Math.round(ms / 1000))}초` : `${Math.round(ms / 60000)}분`;
    $('v2HistBody').innerHTML = rows.slice(0, 300).map((r, i) => `<tr>
      <td class="num">${h(r.req)}</td><td>${h(r.file)}</td><td>${h(r.ini)}</td><td class="num">${fmt(r.uploaded)}</td>
      <td><span class="v2-state" data-state="${{ '완료':'done', '실패':'fail', '지연':'slow', '처리 중':'wait' }[r.state]}">${r.state}</span></td>
      <td class="r num">${dur(r.took)}</td>
      <td>${r.handle ? `<button type="button" class="btn-ghost btn-sm" data-open="${h(r.base)}">열기</button>` : r.state === '실패' && isAdmin() ? linkBtn('실행 기록', LINKS.flowRuns, 'btn-ghost btn-sm') : ''}</td></tr>`).join('')
      || '<tr><td colspan="7" class="empty">조건에 맞는 요청이 없습니다.</td></tr>';
    const c = s => histRows.filter(r => r.state === s).length;
    $('v2HistCount').textContent = `전체 ${histRows.length}건 · 완료 ${c('완료')} · 처리 중 ${c('처리 중')} · 지연 ${c('지연')} · 실패 ${c('실패')}`;
  }
  $('v2HistBody').addEventListener('click', async e => {
    const b = e.target.closest('[data-open]'); if(!b) return;
    const r = histRows.find(x => x.base === b.dataset.open); if(!r) return;
    requestId = r.req; answers = {};
    switchAppTab('create');
    qPanel.hidden = true;
    handleLinkedJsonFile(await r.handle.getFile());
  });
  $('v2HistMine').addEventListener('click', e => { const b = e.target.closest('[data-mine]'); if(!b) return; histMine = b.dataset.mine === '1'; $('v2HistMine').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); drawHistory(); });
  ['v2HistState', 'v2HistSearch'].forEach(id => $(id).addEventListener('input', drawHistory));
  $('v2HistReload').addEventListener('click', renderHistory);

  /* 변경전 대비 비교: JSON의 before(또는 엑셀의 변경전 시트)를 같은 파서로 읽어 직무별 월 합계 비교 */
  const RAISE_LIMIT = 0.15;
  let beforeData = null, compareRows = [];
  const comparePanel = document.createElement('div');
  comparePanel.className = 'panel'; comparePanel.id = 'v2Compare'; comparePanel.hidden = true;
  $('dropzone').closest('.panel').after(comparePanel);
  async function beforeFromXlsx(file){
    try{
      const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type:'array' });
      const name = wb.SheetNames.find(n => n.includes('급여테이블') && n.includes('변경전'));
      if(!name) return null;
      const ws = wb.Sheets[name];
      return { values: XLSX.utils.sheet_to_json(ws, { header:1, defval:'', raw:true }), start: (ws['!ref'] || 'A1').split(':')[0] };
    }catch(e){ return null; }
  }
  const origLinked = handleLinkedJsonFile;
  handleLinkedJsonFile = function(file){
    file.text().then(t => {
      try{ const p = JSON.parse(t.replace(/^﻿/, '')); beforeData = Array.isArray(p.before) ? { values: p.before, start: p.start || 'A1' } : null; }
      catch(e){ beforeData = null; }
      origLinked(file);
    });
  };
  const origPasted = handlePastedText;
  handlePastedText = function(text){
    const p = pastedPayload(text);
    beforeData = p && Array.isArray(p.before) ? { values: p.before, start: p.start || 'A1' } : null;
    const r = origPasted(text);
    if(p && $('v2State').dataset.state === 'paste'){
      setJob('done', '붙여넣기로 읽었습니다. 아래에서 검사 결과와 조견표를 확인하세요. Excel에서 스크립트를 한 번 더 실행해 임시 시트를 지워 주세요.');
    }
    return r;
  };
  function buildCompare(parsed){
    compareRows = [];
    if(!beforeData) return;
    let prev;
    try{ prev = parsePaytable(paytablePayloadToWorkbook({ sheet:'급여테이블(변경후)', start: beforeData.start, values: beforeData.values }).wb); }catch(e){ return; }
    const key = j => `${j.block}|${jobLabel(j)}`;
    const seen = {}, prevMap = {};
    prev.jobs.forEach(j => { const k = key(j); seen[k] = (seen[k] || 0) + 1; prevMap[`${k}#${seen[k]}`] = j; });
    const cur = {};
    compareRows = parsed.jobs.map(j => {
      const k = key(j); cur[k] = (cur[k] || 0) + 1;
      const p = prevMap[`${k}#${cur[k]}`];
      const b = p && typeof p.monthlyTotal === 'number' ? p.monthlyTotal : null, a = typeof j.monthlyTotal === 'number' ? j.monthlyTotal : null;
      return { label: jobLabel(j), before: b, after: a, diff: b != null && a != null ? a - b : null, rate: b ? (a - b) / b : null };
    });
  }
  function drawCompare(){
    if(!compareRows.length || compareRows.every(r => r.before == null)){ comparePanel.hidden = true; return; }
    comparePanel.hidden = false;
    const down = compareRows.filter(r => r.diff < 0).length, big = compareRows.filter(r => r.rate != null && Math.abs(r.rate) > RAISE_LIMIT).length;
    const rates = compareRows.filter(r => r.rate != null).map(r => r.rate);
    const avg = rates.length ? rates.reduce((x, y) => x + y, 0) / rates.length : 0;
    comparePanel.innerHTML = `<div class="ph"><h2>변경전 대비 월 합계 <span class="v2-help-slot" data-help="compare"></span></h2>
      <span class="hint">평균 ${pctTxt(avg)} · 감소 ${down}개 · ±${RAISE_LIMIT * 100}% 초과 ${big}개</span></div>
      <div class="tblwrap"><table class="grid"><thead><tr><th>직무</th><th class="r">변경전</th><th class="r">변경후</th><th class="r">인상액</th><th class="r">인상률</th></tr></thead><tbody>
      ${compareRows.map(r => `<tr class="${r.diff < 0 ? 'v2-down' : r.rate != null && Math.abs(r.rate) > RAISE_LIMIT ? 'v2-big' : ''}"><td>${h(r.label)}</td>
        <td class="r num">${r.before == null ? '-' : won(r.before)}</td><td class="r num">${r.after == null ? '-' : won(r.after)}</td>
        <td class="r num">${r.diff == null ? '-' : (r.diff > 0 ? '+' : '') + won(r.diff)}</td><td class="r num">${r.rate == null ? '-' : pctTxt(r.rate)}</td></tr>`).join('')}
      </tbody></table></div>
      ${down ? '<p class="hint err">월 합계가 줄어든 직무가 있습니다. 열 위치가 바뀌었거나 입력 오류일 수 있으니 확인해 주세요.</p>' : ''}`;
    attachHelp(comparePanel);
  }

  /* 파싱 직후: 센터별 자동 채움 + 변경전 비교 */
  const origShowParsed = showParsed;
  showParsed = function(parsed, label){
    origShowParsed(parsed, label);
    buildCompare(parsed); drawCompare();
    prefillForCenter(parsed.centerName);
  };
  const origBuild2 = buildSnapshot;
  buildSnapshot = function(meta){
    const rec = origBuild2(meta);
    if(compareRows.length) rec.before = compareRows.map(r => ({ job: r.label, before: r.before, after: r.after }));
    if(answers && meta.center){
      kvGet('centerAnswers').then(map => { map = map || {}; map[meta.center] = Object.assign({}, answers); kvSet('centerAnswers', map); });
    }
    return rec;
  };

  /* ============================================================
     3차 · Windows 알림 / 도움말(?) / 관리자 전용 메뉴(applyRole)
     ============================================================ */
  const canNotify = () => 'Notification' in window;
  function notifyButton(){
    return canNotify() && Notification.permission === 'default'
      ? '<button type="button" class="btn-ghost btn-sm" id="v2NotifyOn">완료되면 Windows 알림 받기</button>' : '';
  }
  document.addEventListener('click', async e => {
    if(e.target.id !== 'v2NotifyOn') return;
    const r = await Notification.requestPermission().catch(() => 'denied');
    e.target.replaceWith(Object.assign(document.createElement('span'), { className:'hint', textContent: r === 'granted' ? '완료되면 Windows 알림으로 알려 드립니다.' : '알림이 허용되지 않았습니다. 화면 알림으로만 알려 드립니다.' }));
  });
  function notify(title, body, onClick){
    if(!canNotify() || Notification.permission !== 'granted' || !document.hidden) return;
    try{ const n = new Notification(title, { body, tag:'paytable' }); n.onclick = () => { window.focus(); n.close(); onClick && onClick(); }; }catch(e){}
  }

  const HELP = {
    centerType: '통계에서 같은 유형끼리 비교할 때 쓰는 분류입니다. 목록은 [기준정보 관리]에서 관리자가 바꿀 수 있습니다.',
    consultType: '주된 상담 방식입니다. 통계·보고서에서 비슷한 센터를 고를 때 참고합니다.',
    workPattern: '기본급 시간수(209·167·84시간 등)가 맞는지 검사할 때 씁니다.',
    period: '이 급여테이블이 적용되기 시작하는 달입니다. 통계의 기준 시점이 됩니다.',
    reason: '급여가 바뀐 이유입니다. 보고서와 이력에 남습니다.',
    contract1y: '수습기간 최저임금 90% 적용은 1년 이상 계약일 때만 가능해 검사에 씁니다.',
    region: '채용시장 임금과 비교할 때 지역을 맞추는 데 씁니다.',
    check: '차단 항목은 원본을 고쳐야 진행됩니다. 확인 항목은 내용을 보고 체크(사유 입력)하면 진행됩니다. 문제가 없으면 체크리스트 없이 바로 진행됩니다.',
    snap: '조견표를 만든 뒤 저장하면 센터·적용 시점별로 1건씩 쌓여 통계와 보고서에 쓰입니다. 공유 폴더 04_스냅샷에 저장됩니다.',
    compare: '같은 파일의 급여테이블(변경전) 시트와 직무별 월 합계(B등급 기준)를 비교합니다. 감소는 빨간색, 기준을 넘는 인상은 노란색으로 표시합니다.',
    hourly: '센터마다 근무시간이 달라 B등급 월 급여를 월소정근로시간으로 나눈 시급으로 비교합니다.',
    median: '중위수는 가운데 값입니다. 백분위는 같은 유형 안에서 몇 번째 수준인지(높을수록 급여가 높음)를 뜻합니다.',
    policy: '보고서가 제안하는 인상 목표를 어디에 맞출지 고릅니다. 유형·시장 중 높은 값이 가장 보수적인 기준입니다.',
    burden: '4대보험 사업주 부담분과 퇴직급여 충당분을 합한 비율입니다. 연간 비용 계산에 쓰입니다.',
    minwage: '해당 연도 최저시급입니다. 최저임금 미달 검사와 여유율 계산에 쓰입니다.',
    paste: '보안 파일은 회사 보안 정책상 PC 밖으로 보내면 차단됩니다. PC의 Excel이 값을 읽어 주고, 화면에는 숫자 데이터만 붙여넣으므로 파일이 밖으로 나가지 않습니다.',
    upload: '보안 파일은 SharePoint(회사 M365) 업로드 폴더에 브라우저로 직접 올립니다. 회사 M365가 값을 읽어 결과를 보내 주면 이 화면이 자동으로 받아 조견표를 만듭니다.',
    mode: '웹 업로드(권장)는 보안 파일을 SharePoint에 브라우저로 직접 올립니다. 자동(M365)은 보안 파일을 OneDrive로 올리므로 회사 DLP의 반출 예외 승인이 필요합니다. 승인 전에는 붙여넣기를 쓰세요. 바꾸면 모든 사용자에게 적용됩니다.',
    history: '요청번호별 자동 처리 상태입니다. 처리 중은 15분까지 정상이며, 넘으면 지연으로 표시합니다.'
  };
  const helpPop = document.createElement('div');
  helpPop.className = 'v2-pop'; helpPop.hidden = true; helpPop.setAttribute('role', 'tooltip'); document.body.appendChild(helpPop);
  function closeHelp(){ helpPop.hidden = true; }
  function helpBtn(key){ return `<button type="button" class="v2-help" data-help-key="${key}" aria-label="도움말">?</button>`; }
  function attachHelp(root){ (root || document).querySelectorAll('.v2-help-slot[data-help]').forEach(s => { s.outerHTML = helpBtn(s.dataset.help); }); }
  document.addEventListener('click', e => {
    const b = e.target.closest('.v2-help');
    if(!b){ if(!e.target.closest('.v2-pop')) closeHelp(); return; }
    e.preventDefault(); e.stopPropagation();
    if(!helpPop.hidden && helpPop.dataset.key === b.dataset.helpKey) return closeHelp();
    helpPop.dataset.key = b.dataset.helpKey; helpPop.textContent = HELP[b.dataset.helpKey] || ''; helpPop.hidden = false;
    const r = b.getBoundingClientRect(), w = Math.min(300, window.innerWidth - 24);
    helpPop.style.width = w + 'px';
    helpPop.style.left = Math.max(12, Math.min(r.left - 8, window.innerWidth - w - 12)) + 'px';
    helpPop.style.top = (r.bottom + 6) + 'px';
  }, true);
  window.addEventListener('scroll', closeHelp, true);
  [['#checkPanel h2', 'check'], ['#snapPanel h2', 'snap'], ['#statsViewAll h2', 'hourly'], ['#statsViewType h2', 'median'],
   ['#repPolicy', 'policy', 'label'], ['#setBurden', 'burden', 'label'], ['#setMinWage', 'minwage', 'label']].forEach(([sel, key, up]) => {
    let el = document.querySelector(sel); if(!el) return;
    if(up) el = el.closest(up) || el;
    const first = up ? el.firstChild : null;
    if(first && first.nodeType === 3) first.after(document.createRange().createContextualFragment(helpBtn(key)));
    else el.insertAdjacentHTML('beforeend', ' ' + helpBtn(key));
  });
  document.querySelector('#tabHistory .filterbar').insertAdjacentHTML('afterbegin', helpBtn('history'));

  /* ---------- 시작 ---------- */
  (async () => {
    await loadSystem();
    profile = await kvGet('profile');
    shareDir = await kvGet('shareDir');
    pending = await kvGet('pending');
    renderConn(); applyRole(); renderLinks();
    const onboarded = await kvGet('onboarded');
    if(!profile || (!shareDir && onboarded !== 'later')) return openWizard(profile ? 2 : 1);
    if(!shareDir) return;
    try{
      if(await perm(shareDir, false)) await afterConnect();
      else { renderConn('ask'); reconnect.hidden = false; }
    }catch(e){ shareDir = null; renderConn(); openWizard(3); }
  })();

  window.__v2 = { validateAndConnect, applyRole, runHealth, uploadMode, get pending(){ return pending; }, get shareDir(){ return shareDir; } };
})();

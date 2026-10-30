/* ============================================================
   v2.7 · 기준정보 관리: 하위 탭 · 급여 데이터 이동 · 자동 백업
   - 하위 탭: 분류 · 통계 기준 · 보고서 · 시스템 · 데이터
   - [급여 데이터] 메뉴는 없애고 기준정보 › 데이터로 옮김 (v2는 공유 폴더 04_스냅샷을 자동으로 읽고 쓰므로
     'OneDrive 저장 폴더 연결'·'폴더에서 다시 읽기'는 숨김. 가상 데이터는 사이드바 시험 메뉴)
   - 자동 백업: 공유 폴더에 연결되면 하루 한 번 99_설정/백업/백업_YYYYMMDD.json, 최근 100개만 보관
     내용 = 기준정보(SETTINGS) + 통계 기록 + 센터 메모·견적 입력값·센터별 답변·작업 기록
     되돌리기 = 기준정보·입력값을 그 시점으로, 통계 기록은 지우지 않고 백업에만 있던 것을 다시 추가
   ============================================================ */
(() => {
  const $ = id => document.getElementById(id);
  const h = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
  const V2X = () => window.__v2 || {};
  const pane = $('tabSettings');
  if(!pane) return;
  const BACKUP_DIR = '백업', KEEP = 100, KV_KEYS = ['centerMemos', 'quoteInputs', 'centerAnswers', 'consentInputs', 'workLog'];

  /* ---------- 급여 데이터 화면 → 기준정보 › 데이터 ---------- */
  const dataPane = $('tabData');
  const moved = dataPane ? [...dataPane.children] : [];
  moved.forEach(e => { e.dataset.settab = 'data'; pane.appendChild(e); });
  ['snapFolderBtn', 'snapReloadBtn', 'demoLoadBtn', 'demoClearBtn'].forEach(id => { const b = $(id); if(b) b.hidden = true; });
  const sep = pane.querySelector('[data-settab="data"] .sep'); if(sep) sep.hidden = true;
  const storeHint = $('dataMsg') && $('dataMsg').closest('.panel').querySelector('p.hint');
  if(storeHint) storeHint.textContent = "[통계에 저장]을 누르면 센터·시점별 급여가 1건씩 쌓입니다. 공유 폴더(04_스냅샷)에 자동으로 저장되어 모든 사용자의 통계·보고서에 쓰입니다. 잘못 저장한 기록은 아래 목록에서 지울 수 있습니다.";
  const storeTitle = $('dataMsg') && $('dataMsg').closest('.panel').querySelector('h2');
  if(storeTitle) storeTitle.textContent = '수동 백업 · 불러오기';
  const navData = document.querySelector('.app-tab[data-tab="data"]'); if(navData) navData.hidden = true;

  /* ---------- 자동 백업 패널 ---------- */
  pane.insertAdjacentHTML('beforeend', `<div class="panel" id="v2Backup" data-settab="data">
    <div class="ph"><h2>자동 백업 · 되돌리기</h2><div class="btn-row"><button type="button" class="btn-ghost btn-sm" id="v2BackupNow">지금 백업</button><span class="hint" id="v2BackupMsg"></span></div></div>
    <p class="hint">공유 폴더에 연결되면 하루 한 번 99_설정/백업 폴더에 자동으로 백업합니다(최근 ${KEEP}개 보관). 되돌리면 기준정보·센터 메모·견적 입력값이 그 시점으로 바뀌고, 통계 기록은 지우지 않고 백업에만 있던 기록을 다시 추가합니다. 되돌리기 직전 상태도 자동으로 백업합니다.</p>
    <div class="tblwrap scroll"><table class="grid"><thead><tr><th>백업 시각</th><th>만든 사람</th><th class="r">통계 기록</th><th class="r">크기</th><th></th></tr></thead><tbody id="v2BackupBody"></tbody></table></div></div>`);

  /* ---------- 하위 탭 ---------- */
  const TABS = [['class', '분류'], ['stat', '통계 기준'], ['report', '보고서'], ['system', '시스템'], ['data', '데이터']];
  const byTitle = { '산업군 · 세부유형 · 메모 분류':'class', '센터유형':'class', '상담유형과 월소정근로시간':'stat', '직무명 자동 분류 규칙':'stat', '분석 기준값':'stat',
    '채용시장 임금 표본':'stat', '관리자 바로가기':'system' };
  pane.querySelectorAll('.panel').forEach(p => {
    if(p.dataset.settab) return;
    const t = ((p.querySelector('h2') || {}).textContent || '').replace(/\s*\?\s*$/, '').trim();
    p.dataset.settab = byTitle[t] || (/업무 특성|보고서/.test(t) ? 'report' : /관리자/.test(t) ? 'system' : 'stat');
  });
  const seg = document.createElement('div');
  seg.className = 'v2-settabs'; seg.setAttribute('role', 'tablist');
  seg.innerHTML = TABS.map(([k, t]) => `<button type="button" role="tab" data-settab-go="${k}">${t}</button>`).join('');
  pane.insertAdjacentElement('afterbegin', seg);
  let cur = 'class';
  function showTab(k){
    const adminOff = $('v2Admin') && $('v2Admin').hidden;   // 관리자가 아니면 '시스템' 탭 숨김
    seg.querySelector('[data-settab-go="system"]').hidden = adminOff;
    if(k === 'system' && adminOff) k = 'class';
    cur = k;
    seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.settabGo === k)));
    pane.querySelectorAll('[data-settab]').forEach(e => e.classList.toggle('v2-stoff', e.dataset.settab !== k));
    if(k === 'data'){ if(typeof renderData === 'function') renderData(); renderBackups(); }
  }
  seg.addEventListener('click', e => { const b = e.target.closest('[data-settab-go]'); if(b) showTab(b.dataset.settabGo); });
  /* 예전 [급여 데이터] 화면으로 가는 버튼·링크는 기준정보 › 데이터로 */
  const origSwitch = switchAppTab;
  switchAppTab = function(tabId){
    if(tabId === 'data'){ origSwitch('settings'); showTab('data'); return; }
    origSwitch(tabId);
    if(tabId === 'settings') showTab(cur);
  };
  showTab('class');
  /* 데이터 탭 요약 카드의 v1 문구(OneDrive 폴더) → 공유 폴더 04_스냅샷 */
  if(typeof renderData === 'function'){
    const origRenderData = renderData;
    renderData = function(){
      origRenderData.apply(this, arguments);
      document.querySelectorAll('#dataKpis *').forEach(e => { if(e.children.length) return;
        e.textContent = e.textContent.replace('OneDrive 폴더를 연결하면 파일로도 저장', '공유 폴더를 연결하면 04_스냅샷에 저장').replace(/^저장 폴더$/, '공유 폴더'); });
    };
  }

  /* ---------- 백업 만들기 · 목록 · 되돌리기 ---------- */
  const day = d => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  async function dir(){
    const v = V2X();
    if(!v.shareDir || !(await v.perm(v.shareDir, false))) return null;
    return (await v.sub(v.SUB.cfg, true)).getDirectoryHandle(BACKUP_DIR, { create:true });
  }
  async function snapshotAll(){
    const v = V2X(), kv = {};
    for(const k of KV_KEYS) kv[k] = await v.kvGet(k);
    return { kind:'PAYBACKUP', v:2, exportedAt: new Date().toISOString(), by: v.profile ? v.profile.name : '', app: (window.V2_CONFIG || {}).appVersion || '',
      settings: SETTINGS, snapshots: (typeof SNAPS !== 'undefined' ? SNAPS : []).filter(s => !s.demo), kv };
  }
  async function backup(name, force){
    const d = await dir(); if(!d) return { ok:false, why:'공유 폴더가 연결되어 있지 않습니다.' };
    if(!force){ try{ await d.getFileHandle(name); return { ok:false, why:'오늘 백업이 이미 있습니다.' }; }catch(e){} }
    await V2X().writeFile(d, name, JSON.stringify(await snapshotAll()));
    await prune(d);
    return { ok:true };
  }
  async function list(d){
    const out = [];
    for await (const e of d.values()) if(e.kind === 'file' && /^백업_\d{8}.*\.json$/.test(e.name)) out.push(e);
    return out.sort((a, b) => b.name.localeCompare(a.name));
  }
  async function prune(d){
    const all = await list(d);
    for(const e of all.slice(KEEP)) try{ await d.removeEntry(e.name); }catch(err){ console.error(err); }
  }
  async function autoBackup(){
    try{ const r = await backup(`백업_${day(new Date())}.json`, false); if(r.ok) renderBackups(); }catch(e){ console.error(e); }
  }
  async function renderBackups(){
    const body = $('v2BackupBody');
    const d = await dir().catch(() => null);
    if(!d){ body.innerHTML = '<tr><td colspan="5" class="empty">공유 폴더가 연결되어 있어야 자동 백업을 볼 수 있습니다.</td></tr>'; return; }
    const rows = [];
    for(const e of (await list(d)).slice(0, KEEP)){
      const f = await e.getFile();
      let meta = {};
      try{ const j = JSON.parse(await f.text()); meta = { by: j.by, n: (j.snapshots || []).length, at: j.exportedAt }; }catch(err){}
      rows.push(`<tr><td class="num">${h(meta.at ? new Date(meta.at).toLocaleString('ko-KR') : e.name)}</td><td>${h(meta.by || '-')}</td><td class="r num">${meta.n ?? '-'}건</td>
        <td class="r num">${Math.max(1, Math.round(f.size / 1024))}KB</td><td><button type="button" class="btn-ghost btn-sm" data-restore="${h(e.name)}">이 시점으로 되돌리기</button></td></tr>`);
    }
    body.innerHTML = rows.join('') || '<tr><td colspan="5" class="empty">아직 백업이 없습니다. [지금 백업]을 눌러 보세요.</td></tr>';
  }
  async function restore(name){
    const v = V2X(), d = await dir(); if(!d) return;
    const data = JSON.parse(await (await (await d.getFileHandle(name)).getFile()).text());
    if(data.kind !== 'PAYBACKUP') throw new Error('백업 파일 형식이 아닙니다.');
    const now = new Date();
    await backup(`백업_${day(now)}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}_되돌리기전.json`, true);
    let added = 0;
    for(const rec of data.snapshots || []){ if(!SNAPS.some(s => s.id === rec.id)){ await sysStore.put(rec); SNAPS.push(rec); added++; } }
    if(data.settings){ SETTINGS = Object.assign(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), data.settings); await saveSettings(); }
    for(const k of KV_KEYS) if(data.kv && data.kv[k] != null) await v.kvSet(k, data.kv[k]);
    if(v.publishSettings) await v.publishSettings();   // 공유 설정도 되돌려야 다음 접속 때 다시 덮어쓰이지 않음
    if(typeof renderSettings === 'function') renderSettings();
    if(typeof renderData === 'function') renderData();
    if(typeof refreshNavCounts === 'function') refreshNavCounts();
    if(v.renderLinks) v.renderLinks();
    return added;
  }
  $('v2BackupNow').addEventListener('click', async () => {
    const now = new Date();
    const r = await backup(`백업_${day(now)}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}.json`, true).catch(e => ({ ok:false, why:e.message }));
    $('v2BackupMsg').textContent = r.ok ? '백업했습니다.' : r.why;
    renderBackups();
  });
  $('v2BackupBody').addEventListener('click', async e => {
    const b = e.target.closest('[data-restore]'); if(!b) return;
    if(!confirm(`'${b.dataset.restore}' 시점으로 되돌릴까요?\n기준정보·센터 메모·견적 입력값이 그 시점으로 바뀌고 모든 사용자에게 적용됩니다. (지금 상태는 먼저 백업합니다)`)) return;
    try{ const n = await restore(b.dataset.restore); $('v2BackupMsg').textContent = `되돌렸습니다 · 백업에만 있던 통계 기록 ${n}건 추가`; }
    catch(err){ $('v2BackupMsg').textContent = '되돌리지 못했습니다: ' + err.message; }
    renderBackups();
  });
  document.addEventListener('v2:connected', autoBackup);
  if(V2X().shareDir) autoBackup();
  window.__v2settings = { showTab, backup, autoBackup, restore, renderBackups };
})();

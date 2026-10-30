/* ============================================================
   v2.6.6 · 근로조건/급여테이블 변경동의서 (호봉별 Word)
   - 기존 센터(급여테이블(변경전) 시트가 있는 파일)만 만듦. 신규 센터는 만들지 않음
   - 담당자 원본 양식(tools/consent_template.docx)의 {{토큰}}만 바꿔 서식은 그대로 유지
   - 조견표를 만든 호봉마다 1개: 변경전 짝이 없는 신규 호봉은 기존 값이 없어 제외
   - 기존과 같으면 '상동', 업적수당은 S등급 ~ E등급 금액
   - 시행일 = 급여테이블(변경후) 관리번호 오른쪽 '센터명/날짜'의 날짜 (없거나 애매하면 빈칸)
   - 설명회 일자·주요 변경사항은 지금 입력하거나, 원본 문구 그대로 두고 나중에 직접 작성
   - 조견표 ZIP에 '변경동의서/' 폴더로 함께 넣고, 생성 기록은 처리 이력 화면에 남김
   ============================================================ */
(() => {
  const $ = id => document.getElementById(id);
  const h = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
  const V2X = () => window.__v2 || {};
  const norm = s => String(s ?? '').replace(/\s+/g, '');
  const won = v => Math.round(v).toLocaleString('ko-KR');
  const amt = v => typeof v === 'number' && isFinite(v) ? `${won(v)}원` : '-';
  const pad = n => String(n).padStart(2, '0');
  const DEL = '\u0000DEL';
  const LOG_DIR = '동의서이력';
  const CHANGE_HINT = '주요 변경사항 기재';

  /* ---------- 급여테이블(변경후) 머리글: 관리번호 → 시행일, 요청사유 → 주요 변경사항 기본값 ---------- */
  function labelValue(grid, label){
    if(!grid || !Array.isArray(grid.values)) return '';
    for(const row of grid.values.slice(0, 40)){
      const i = (row || []).findIndex(v => norm(v) === label);
      if(i < 0) continue;
      for(let k = i + 1; k < row.length; k++){ const v = String(row[k] ?? '').trim(); if(v) return v; }
    }
    return '';
  }
  /* '센터명/2026년1월', '센터명/2026.01.01', '센터명/20260101' → { y, m, d } · 연도만 있거나 못 읽으면 null */
  function parseEffective(mgmt){
    const s = String(mgmt || ''), k = s.lastIndexOf('/');
    if(k < 0) return null;
    const t = s.slice(k + 1).trim();
    let m = t.match(/^(\d{4})(\d{2})(\d{2})$/);
    if(!m) m = t.match(/(\d{4})\s*[년.\-]\s*(\d{1,2})\s*(?:월|[.\-])?\s*(?:(\d{1,2})\s*일?)?/);
    if(!m) return null;
    const y = +m[1], mo = +m[2], d = m[3] ? +m[3] : 1;
    if(y < 2000 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return { y, m: mo, d };
  }
  const effText = e => e ? `${e.y}. ${pad(e.m)}. ${pad(e.d)}.` : '';

  /* ---------- 9.근무형태 표 → 직무별 근무일·근무시간·휴게시간 ---------- */
  /* 시트 칸에서 직접 찾음(직무 | 호봉 | 근무일 | 근무시간 | 휴게시간 머리행 아래, 빈 줄 전까지) → 없으면 특례사항 파싱 결과 */
  function gridWorkTable(grid){
    if(!grid || !Array.isArray(grid.values)) return null;
    const V = grid.values;
    for(let r = 0; r < V.length; r++){
      const row = (V[r] || []).map(v => String(v ?? '').trim());
      if(norm(row[0]) !== '직무' || !/호봉/.test(row[1] || '') || !row.some(v => /근무일|근무시간|휴게/.test(norm(v)))) continue;
      const idx = row.map((v, i) => v ? i : -1).filter(i => i >= 0);
      const rows = [];
      for(let k = r + 1; k < V.length; k++){
        const cells = idx.map(i => String((V[k] || [])[i] ?? '').trim());
        if(cells.every(v => !v)) break;
        rows.push(cells);
      }
      return { headers: idx.map(i => row[i]), rows };
    }
    return null;
  }
  function workTable(notes, grid){
    return gridWorkTable(grid) || (notes || []).find(n => n && n.type === 'table' && typeof isWorkTypeTable === 'function' && isWorkTypeTable(n.headers)) || null;
  }
  function workOf(job, notes, grid){
    const t = workTable(notes, grid);
    if(!t || !t.rows.length) return null;
    const row = (filterWorkTypeRowsForJob(job, t.headers, t.rows) || [])[0];
    if(!row) return null;
    const col = re => { const i = t.headers.findIndex(x => re.test(norm(x))); return i < 0 ? '' : String(row[i] || '').trim(); };
    const days = col(/^근무일/), slot = col(/^근무시간/), rest = col(/^휴게/);
    const both = `${days} ${slot}`;
    const dm = both.match(/주\s*(\d+)\s*일/), hm = both.match(/일\s*(\d+(?:\.\d+)?)\s*(?:H|시간)/i);
    const wm = both.replace(/일\s*\d+(?:\.\d+)?\s*(?:H|시간)/gi, '').match(/(\d+(?:\.\d+)?)\s*시간/);
    return { days, slot, rest, perWeek: dm ? +dm[1] : null, daily: hm ? +hm[1] : null, weekly: wm ? +wm[1] : null };
  }
  const weeklyFromMonth = mh => Math.round(mh / 4.345 / 1.2 * 2) / 2;   // 209 → 40, 167 → 32
  const monthFromWeekly = w => Math.round(w * 1.2 * 4.345);            // 40 → 209, 32 → 167
  function workText(w, monthHours){
    if(w && w.perWeek && w.weekly && w.daily) return `일${w.daily}H/주${w.perWeek}일/주 ${w.weekly}시간` + (w.slot ? ` (${w.slot})` : '');
    if(w && (w.days || w.slot)) return [w.days, w.slot].filter(Boolean).join(' ');
    const wk = weeklyFromMonth(monthHours);
    return wk % 5 === 0 ? `일${wk / 5}H/주5일/주 ${wk}시간` : `주 ${wk}시간`;
  }

  /* ---------- 직무 값 ---------- */
  const item = (job, name) => { const it = (job.items || []).find(([l]) => norm(l).includes(name)); return it && typeof it[1] === 'number' ? it[1] : null; };
  const grade = (job, g) => { const x = (job.grades || []).find(([n]) => String(n).trim().replace(/\.$/, '').toUpperCase() === g); return x && typeof x[1] === 'number' ? x[1] : null; };
  function perfText(job){
    const s = grade(job, 'S'), e = grade(job, 'E');
    return s == null && e == null ? '-' : `${amt(s)} ~ ${amt(e)}`;
  }

  /* 호봉 1개의 동의서 값 (p = 변경전 직무, j = 변경후 직무) */
  function valuesFor(p, j, prevNotes, curNotes){
    const wb = workOf(p, prevNotes, V2X().beforeData), wa = workOf(j, curNotes, V2X().curGrid);
    const hoursA = (V2X().baseHours ? V2X().baseHours(j) : 209) || 209;
    const weekA = wa && wa.weekly ? wa.weekly : weeklyFromMonth(hoursA);
    const weekB = wb && wb.weekly ? wb.weekly : weekA;
    const hoursB = weekB !== weekA ? monthFromWeekly(weekB) : hoursA;
    const basic = (job, w, hours, week) => {
      const base = item(job, '기본급');
      if(base == null) return ['-', DEL];
      const daily = w && w.daily ? w.daily : Math.round(week / 5 * 10) / 10;
      return [`시급 ${won(base / hours)}원 기준 산정`, `  - 일 ${daily}시간 기준 ${won(base)}원`];
    };
    const v = {
      WORKT: [workText(wb, hoursB), workText(wa, hoursA)],
      REST: [wb ? wb.rest : '', wa ? wa.rest : ''],
      JOB: [amt(item(p, '직무수당')), amt(item(j, '직무수당'))],
      POS: [amt(item(p, '직책수당')), amt(item(j, '직책수당'))],
      PERF: [perfText(p), perfText(j)],
      MEAL: [amt(item(p, '급식비')), amt(item(j, '급식비'))],
      OT: [amt(p.overtime), amt(j.overtime)],
      NIGHT: [amt(p.night), amt(j.night)]
    };
    const out = {};
    for(const [k, [b, a]] of Object.entries(v)){ out[`${k}_B`] = b; out[`${k}_A`] = b && a === b ? '상동' : a; }
    const [b1, b2] = basic(p, wb, hoursB, weekB), [a1, a2] = basic(j, wa, hoursA, weekA);
    Object.assign(out, { BASIC_B1: b1, BASIC_B2: b2 });
    if(b1 + b2 === a1 + a2) Object.assign(out, { BASIC_A1: '상동', BASIC_A2: DEL });
    else Object.assign(out, { BASIC_A1: a1, BASIC_A2: a2 });
    /* 근로조건: 주 근로시간이 바뀌면 그 내용, 근무 시간대만 바뀌면 시간대, 그대로면 문단 삭제 */
    out.WORK = weekB !== weekA ? `주 ${weekB}시간 근무에서 주 ${weekA}시간 근무로 변경`
      : wb && wa && wb.slot && wa.slot && norm(wb.slot) !== norm(wa.slot) ? `근무시간 ${wb.slot} → ${wa.slot} 변경` : DEL;
    return out;
  }

  /* ---------- Word 만들기 ---------- */
  const xmlEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let tplZip = null;
  async function template(){
    if(!tplZip) tplZip = await JSZip.loadAsync(window.V2_CONSENT_TPL, { base64:true });
    return tplZip;
  }
  async function makeDocx(vals){
    const src = await template(), z = new JSZip();
    for(const [name, f] of Object.entries(src.files)) if(!f.dir) z.file(name, await f.async('uint8array'));
    let x = await src.file('word/document.xml').async('string');
    for(const [k, v] of Object.entries(vals)){
      if(v === DEL) x = x.replace(new RegExp(`<w:p[ >](?:(?!<w:p[ >])[\\s\\S])*?\\{\\{${k}\\}\\}[\\s\\S]*?</w:p>`), '');
    }
    /* 원본의 빨간 안내 문구('주요 변경사항 기재')를 실제 내용으로 채우면 검정 글씨로 */
    if(vals.CHANGE && vals.CHANGE !== CHANGE_HINT) x = x.replace(/(<w:r[ >](?:(?!<w:r[ >])[\s\S])*?)<w:color w:val="FF0000"\/>((?:(?!<w:r[ >])[\s\S])*?\{\{CHANGE\}\})/, '$1$2');
    x = x.replace(/\{\{(\w+)\}\}/g, (m, k) => k in vals && vals[k] !== DEL ? xmlEsc(vals[k]) : '');
    z.file('word/document.xml', x);
    return z.generateAsync({ type:'blob', mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compression:'DEFLATE' });
  }

  /* ---------- 대상 호봉 ---------- */
  function targets(){
    const v = V2X(), prev = v.comparePrev, pairs = v.comparePairs || [];
    if(!prev || typeof parsedData === 'undefined' || !parsedData) return null;   // 변경전 시트 없음 = 신규 센터
    const chosen = parsedData.jobs.filter((j, i) => typeof selectedJobs === 'undefined' || selectedJobs.has(i));
    const list = [], fresh = [];
    chosen.forEach(j => { const pr = pairs.find(x => x.j === j); if(pr && pr.p) list.push(pr); else fresh.push(jobLabel(j)); });
    return { prev, list, fresh };
  }

  /* ---------- 입력 창 ---------- */
  document.body.insertAdjacentHTML('beforeend', `
  <div class="v2-modal" id="v2Consent" hidden role="dialog" aria-modal="true" aria-labelledby="v2ConTitle">
    <div class="v2-card">
      <div class="v2-wiz-head"><small>변경동의서</small><h2 id="v2ConTitle">변경동의서도 함께 받기</h2></div>
      <section>
        <p class="v2-con-info" id="v2ConInfo"></p>
        <label>시행일 <input type="text" id="v2ConEff" placeholder="예: 2026. 01. 01. (비우면 빈칸)"><span class="hint" id="v2ConEffHint"></span></label>
        <div class="v2-con-mode" role="radiogroup" aria-label="설명회 일자·주요 변경사항 작성 방법">
          <b>설명회 일자 · 주요 변경사항</b>
          <label class="v2-check"><input type="radio" name="v2ConMode" value="now" checked> 지금 입력</label>
          <label class="v2-check"><input type="radio" name="v2ConMode" value="later"> 나중에 직접 작성 (원본 문구 그대로 둠)</label>
        </div>
        <div id="v2ConNow" class="v2-con-now">
          <label>설명회 일자 <input type="date" id="v2ConBrief"></label>
          <label>주요 변경사항 <input type="text" id="v2ConChange" placeholder="예: 2026년 최저임금 인상 반영"></label>
        </div>
        <p class="v2-err" id="v2ConErr"></p>
        <div class="v2-act">
          <button type="button" class="btn-ghost" data-con="cancel">취소</button>
          <button type="button" class="btn-ghost" data-con="skip">동의서 없이 조견표만</button>
          <button type="button" class="btn-primary" data-con="ok">ZIP 받기</button>
        </div>
      </section>
    </div>
  </div>`);
  const modal = $('v2Consent');
  const syncMode = () => { $('v2ConNow').hidden = modal.querySelector('input[name="v2ConMode"]:checked').value !== 'now'; };
  modal.addEventListener('change', e => { if(e.target.name === 'v2ConMode') syncMode(); });
  let waiting = null;
  modal.addEventListener('click', e => {
    const b = e.target.closest('[data-con]'); if(!b || !waiting) return;
    const mode = modal.querySelector('input[name="v2ConMode"]:checked').value;
    if(b.dataset.con === 'ok' && mode === 'now' && !$('v2ConBrief').value){ $('v2ConErr').textContent = '설명회 일자를 넣거나 [나중에 직접 작성]을 골라 주세요.'; return; }
    modal.hidden = true;
    const done = waiting; waiting = null;
    done(b.dataset.con === 'ok' ? { mode, eff: $('v2ConEff').value.trim(), brief: $('v2ConBrief').value, change: $('v2ConChange').value.trim() } : b.dataset.con);
  });

  /* ZIP 받기 전에 호출: 동의서 대상이 없으면 null, 취소면 false, 아니면 { files, meta } */
  async function prepare(){
    const t = targets();
    if(!t) return null;
    if(!t.list.length){ V2X().toast && V2X().toast(`변경전과 짝이 맞는 호봉이 없어 변경동의서는 만들지 않습니다 (신규 호봉 ${t.fresh.length}개).`, 8000); return null; }
    if(waiting) return false;
    const center = parsedData.centerName, grid = V2X().curGrid;
    const mgmt = labelValue(grid, '관리번호'), eff = parseEffective(mgmt);
    const saved = ((await V2X().kvGet('consentInputs')) || {})[center] || {};
    $('v2ConInfo').innerHTML = `기존 센터입니다(변경전 시트 있음). 호봉별 변경동의서 <b>${t.list.length}개</b>(Word)를 조견표 PNG와 함께 ZIP의 '변경동의서' 폴더에 넣습니다.`
      + (t.fresh.length ? `<br><span class="hint">신규 호봉 ${t.fresh.length}개(${h(t.fresh.join(', '))})는 기존 값이 없어 제외합니다.</span>` : '');
    $('v2ConEff').value = effText(eff);
    $('v2ConEffHint').textContent = eff ? `급여테이블(변경후) 관리번호 '${mgmt}'에서 읽었습니다.` : mgmt ? `관리번호 '${mgmt}'에서 날짜를 읽지 못해 빈칸으로 둡니다.` : '관리번호를 찾지 못해 빈칸으로 둡니다.';
    modal.querySelector(`input[name="v2ConMode"][value="${saved.mode === 'later' ? 'later' : 'now'}"]`).checked = true;
    $('v2ConBrief').value = saved.brief || '';
    $('v2ConChange').value = saved.change || labelValue(grid, '요청사유');
    $('v2ConErr').textContent = '';
    syncMode();
    modal.hidden = false;
    const ans = await new Promise(res => { waiting = res; });
    if(ans === 'cancel') return false;
    if(ans === 'skip') return null;
    const map = (await V2X().kvGet('consentInputs')) || {};
    map[center] = { mode: ans.mode, brief: ans.brief, change: ans.change };
    V2X().kvSet('consentInputs', map);

    const ey = (ans.eff.match(/(\d{4})/) || [])[1] || (eff ? String(eff.y) : '') || ((mgmt + labelValue(grid, '요청사유')).match(/(20\d{2})/) || [])[1] || String(new Date().getFullYear());
    const bd = ans.mode === 'now' && ans.brief ? ans.brief.split('-') : null;
    const common = {
      YY: ey.slice(2), CENTER: center,
      BRIEF: bd ? `${bd[0]}년 ${bd[1]}월 ${bd[2]}일` : '0000년 00월 00일',
      CHANGE: ans.mode === 'now' && ans.change ? ans.change : CHANGE_HINT,
      EFF: ans.eff
    };
    const files = [], used = new Set();
    for(const pr of t.list){
      const vals = Object.assign({}, common, valuesFor(pr.p, pr.j, t.prev.notes, parsedData.notes));
      /* 조견표 PNG와 같은 이름 체계(급여조견표_센터_01_… → 변경동의서_센터_01_…)로 짝을 맞춤 */
      const card = typeof cardRegistry !== 'undefined' ? cardRegistry.find(c => parsedData.jobs[c.idx] === pr.j) : null;
      const base = card && /^급여조견표_/.test(safeName(card.filename)) ? safeName(card.filename).replace(/^급여조견표_/, '변경동의서_') : safeName(`변경동의서_${center}_${jobLabel(pr.j)}`);
      let name = base + '.docx', n = 2;
      while(used.has(name)) name = `${base}_${n++}.docx`;
      used.add(name);
      files.push({ name, blob: await makeDocx(vals), job: jobLabel(pr.j) });
    }
    return { files, meta: { center, count: files.length, jobs: files.map(f => f.job), fresh: t.fresh, eff: ans.eff, mode: ans.mode,
      brief: ans.mode === 'now' ? common.BRIEF : '', change: ans.mode === 'now' ? common.CHANGE : '' } };
  }

  /* ---------- 생성 기록 (이 PC + 공유 폴더 04_스냅샷/동의서이력) ---------- */
  async function log(consent, zipName){
    const prof = V2X().profile;
    const rec = Object.assign({ kind:'PAYCONSENT', v:1, id:`consent-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      at: new Date().toISOString(), by: prof ? prof.name : '', zip: zipName }, consent.meta);
    const list = (await V2X().kvGet('consentLog')) || [];
    list.unshift(rec); V2X().kvSet('consentLog', list.slice(0, 500));
    try{
      const v = V2X();
      if(v.shareDir && await v.perm(v.shareDir, false)){
        const dir = await (await v.sub(v.SUB.snap, true)).getDirectoryHandle(LOG_DIR, { create:true });
        await v.writeFile(dir, `${rec.id}.json`, JSON.stringify(rec, null, 1));
      }
    }catch(e){ console.error(e); }
  }
  async function loadLog(){
    const map = new Map();
    ((await V2X().kvGet('consentLog')) || []).forEach(r => map.set(r.id, r));
    try{
      const v = V2X();
      if(v.shareDir && await v.perm(v.shareDir, false)){
        const dir = await (await v.sub(v.SUB.snap, true)).getDirectoryHandle(LOG_DIR, { create:true });
        for await (const e of dir.values()){
          if(e.kind !== 'file' || !/\.json$/i.test(e.name)) continue;
          try{ const r = JSON.parse((await (await e.getFile()).text()).replace(/^﻿/, '')); if(r.kind === 'PAYCONSENT' && r.id) map.set(r.id, r); }catch(err){}
        }
      }
    }catch(e){ console.error(e); }
    return [...map.values()].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  }

  /* 처리 이력 화면 아래에 '변경동의서 생성 기록' */
  const histPanel = document.querySelector('#tabHistory .panel');
  if(histPanel){
    histPanel.insertAdjacentHTML('afterend', `<div class="panel" id="v2ConLog">
      <div class="ph"><h2>변경동의서 생성 기록</h2><span class="hint" id="v2ConLogCount"></span></div>
      <div class="tblwrap scroll"><table class="grid"><thead><tr><th>생성 시각</th><th>센터</th><th class="r">동의서</th><th>시행일</th><th>설명회 일자</th><th>주요 변경사항</th><th>만든 사람</th></tr></thead><tbody id="v2ConLogBody"></tbody></table></div>
      <p class="hint">조견표 ZIP을 받을 때 함께 만든 변경동의서입니다. 설명회 일자가 비어 있으면 '나중에 직접 작성'을 고른 경우입니다.</p>
    </div>`);
  }
  async function renderLog(){
    const body = $('v2ConLogBody'); if(!body) return;
    const rows = await loadLog();
    const fmt = t => new Date(t).toLocaleString('ko-KR', { year:'numeric', month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' });
    body.innerHTML = rows.slice(0, 300).map(r => `<tr><td class="num">${h(fmt(r.at))}</td><td>${h(r.center)}</td>
      <td class="r num" title="${h((r.jobs || []).join(', '))}">${h(r.count)}개${r.fresh && r.fresh.length ? ` <span class="hint">(신규 ${r.fresh.length} 제외)</span>` : ''}</td>
      <td class="num">${h(r.eff || '-')}</td><td class="num">${h(r.brief || '나중에 작성')}</td><td>${h(r.change || '-')}</td><td>${h(r.by || '-')}</td></tr>`).join('')
      || '<tr><td colspan="7" class="empty">아직 만든 변경동의서가 없습니다.</td></tr>';
    $('v2ConLogCount').textContent = rows.length ? `전체 ${rows.length}건` : '';
  }
  const origSwitch = switchAppTab;
  switchAppTab = function(tabId){ origSwitch(tabId); if(tabId === 'history') renderLog(); };
  const reload = $('v2HistReload'); if(reload) reload.addEventListener('click', renderLog);

  window.__v2consent = { prepare, log, loadLog, valuesFor, parseEffective, makeDocx };
})();

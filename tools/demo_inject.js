/* ============================================================
   데모 전용 스크립트 (급여조견표_관리시스템_데모.html 에만 들어감)
   - 실제 시스템과 다른 저장소(paytable-system-demo)를 사용
   - 가상 센터 30곳 + 샘플 급여테이블로 전체 흐름을 보여줌
   ============================================================ */
(function(){
  const $ = id => document.getElementById(id);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  let sampleCenter = '서울 금융1센터';

  /* 샘플 급여테이블 (조견표 생성기 파서 양식과 동일한 행·열 배치, 금액은 가상) */
  function samplePayload(center){
    const R = 70, C = 20, v = Array.from({ length:R }, () => Array(C).fill(''));
    const set = (r, c, x) => { v[r - 1][c - 1] = x; };
    set(1, 1, '2026년 급여테이블(변경후) — 샘플');
    set(3, 1, '센터명'); set(3, 4, center);
    const block = (title, row, jobs) => {
      set(row, 1, title);
      let lastG = null;
      jobs.forEach((j, i) => {
        const c = 4 + i;
        if(j.g !== lastG){ set(row + 1, c, j.g); lastG = j.g; }
        set(row + 2, c, j.n);
        const items = [j.base, j.pos, j.duty, j.ten, 200000, 0];
        ['기본급','직책수당','직무수당','근속수당','급식비','통근비'].forEach((l, k) => { set(row + 3 + k, 1, l); set(row + 3 + k, c, items[k]); });
        const std = items.reduce((a, b) => a + b, 0);
        set(row + 9, 1, '기준급여 합계'); set(row + 9, c, std);
        ['A.','B.','C.','D.','E.','F.'].forEach((g, k) => { set(row + 10 + k, 3, g); set(row + 10 + k, c, std + [150000, 100000, 60000, 30000, 0, 0][k]); });
        set(row + 16, 1, '초과근무수당'); set(row + 16, c, j.ot);
        set(row + 17, 1, '야간근로수당'); set(row + 17, c, j.night || 0);
        set(row + 18, 1, '통신비'); set(row + 18, c, 30000);
        set(row + 19, 1, '월 총액'); set(row + 19, c, std + j.ot + (j.night || 0) + 30000);
      });
      set(row + 10, 19, '업적평가 등급별 월 총액(기준급여 합계 + 업적수당)');
      set(row + 16, 19, '사원 10H, 팀장 20H');
      set(row + 19, 19, '통신비 포함');
    };
    block('Ⅰ. 보수테이블', 5, [
      { g:'일반상담', n:'사원', base:2150000, pos:0, duty:80000, ten:30000, ot:150000 },
      { g:'일반상담', n:'주임', base:2250000, pos:0, duty:80000, ten:50000, ot:150000 },
      { g:'일반상담', n:'선임', base:2350000, pos:0, duty:80000, ten:70000, ot:150000 },
      { g:'신입', n:'수습', base:2000000, pos:0, duty:60000, ten:0, ot:0 },
      { g:'야간상담', n:'심야상담', base:2200000, pos:0, duty:100000, ten:30000, ot:0, night:220000 }
    ]);
    block('Ⅱ. 리딩그룹 보수테이블', 27, [
      { g:'리더', n:'팀장', base:2700000, pos:300000, duty:120000, ten:80000, ot:300000 },
      { g:'리더', n:'센터장', base:3300000, pos:600000, duty:150000, ten:100000, ot:0 }
    ]);
    set(50, 1, '예외 및 특례사항');
    set(51, 1, '1. 근무형태');
    ['직무','호봉','근무일','','근무시간','휴게시간','비고'].forEach((h, i) => set(52, 1 + i, h));
    [['일반상담','1~5호봉','월~금','','09:00~18:00','12:00~13:00','주 40시간'],
     ['심야상담','1~3호봉','일~목','','22:00~07:00','02:00~03:00','야간수당 별도'],
     ['리더','-','월~금','','08:30~17:30','12:00~13:00','']].forEach((r, k) => r.forEach((x, i) => set(53 + k, 1 + i, x)));
    set(58, 1, '2. 수습기간(3개월) 중에는 수습 기준표를 적용하고, 종료 후 사원 1호봉으로 전환한다.');
    set(60, 1, '3. 초과근무수당은 직무별 약정시간 기준이며, 실제 근무시간이 초과할 경우 별도 정산한다.');
    set(63, 1, '10. 기타');
    return { v:1, kind:'PAYTABLE', sheet:'급여테이블(변경후)', file:`${center.replace(/\s/g, '')}_급여테이블(샘플).xlsx`, start:'A1', values:v };
  }

  function loadSample(){
    const { wb, fileName } = paytablePayloadToWorkbook(samplePayload(sampleCenter));
    showParsed(parsePaytable(wb), fileName + ' (자동연동)');
    setSaveStatus('데모: 샘플 급여테이블을 자동연동 파일처럼 불러왔습니다', 'ok');
  }

  async function seed(){
    await loadSystem();
    if(!SNAPS.length){
      $('demoLoadBtn').click();
      for(let i = 0; i < 60 && !SNAPS.length; i++) await wait(100);
    }
    const fin = SNAPS.filter(s => s.centerType === '금융').map(s => s.center).sort();
    if(fin.length) sampleCenter = fin[0];
    refreshNavCounts();
  }

  /* 둘러보기 단계 */
  async function stepTables(){
    switchAppTab('create');
    loadSample();
    $('checkPanel').scrollIntoView({ behavior:'smooth', block:'start' });
    tip('검사 결과 확인 항목이 나오면 체크해야 생성됩니다. 데모에서는 2초 뒤 자동으로 체크하고 생성합니다.');
    await wait(2200);
    checkState.issues.filter(i => i.level === 'confirm').forEach(i => { checkState.acked.add(i.key); checkState.reasons[i.key] = '데모: 담당자 확인'; });
    renderChecklist();
    generateTables();
    await wait(400);
    $('snapType').value = '금융';
    tip('직무별 조견표가 자동으로 만들어졌습니다. 아래 [⑥ 통계에 저장]을 누르면 통계에 반영됩니다.');
  }
  function stepStats(){
    switchAppTab('stats');
    tip('전사 → 센터유형 → 센터 순서로 눌러 들어가며 비교합니다. 막대나 센터 이름을 눌러 보세요.');
  }
  function pickReportCenter(){
    const period = periodsOf().at(-1);
    let best = null;
    SNAPS.filter(s => s.centerType === '금융').map(s => s.center).filter((c, i, a) => a.indexOf(c) === i).forEach(c => {
      const a = analyzeCenter(c, period, 'max');
      const row = a && a.rows.find(r => r.lt === '상담사');
      if(row && row.typeMed && (!best || row.cur / row.typeMed < best.d)) best = { c, d: row.cur / row.typeMed };
    });
    return best ? best.c : null;
  }
  function stepReport(){
    reportState.center = pickReportCenter() || reportState.center;
    reportState.period = null;
    switchAppTab('report');
    $('reportDoc').scrollIntoView({ behavior:'smooth', block:'start' });
    tip('화면의 문서가 보고서 미리보기입니다. 센터·목표 기준·인원을 바꾸면 즉시 다시 계산됩니다.');
  }
  function stepWord(){
    if(!$('tabReport').classList.contains('on')) stepReport();
    setTimeout(() => $('repWordBtn').click(), 300);
    tip('Word 파일(.doc)을 내려받았습니다. A4 세로, 인쇄 모양으로 열립니다.');
  }
  function tip(t){ $('demoTip').textContent = t; }

  /* 데모 막대 */
  const bar = document.createElement('div');
  bar.className = 'demo-bar no-print';
  bar.innerHTML = `
    <span class="demo-badge">데모</span>
    <span class="demo-title">가상 데이터 · 센터 30곳</span>
    <div class="demo-steps">
      <button type="button" data-demo="1"><b>1</b> 조견표 자동 생성</button>
      <button type="button" data-demo="2"><b>2</b> 통계 화면</button>
      <button type="button" data-demo="3"><b>3</b> 보고서 미리보기</button>
      <button type="button" data-demo="4"><b>4</b> Word로 출력</button>
    </div>
    <button type="button" class="demo-reset" data-demo="reset">데모 초기화</button>
    <div class="demo-tip" id="demoTip">위 단계 버튼을 순서대로 누르면 전체 흐름을 볼 수 있습니다. 모든 금액은 가상입니다.</div>`;
  document.querySelector('.main').insertBefore(bar, document.querySelector('.page-head'));
  bar.addEventListener('click', async e => {
    const b = e.target.closest('[data-demo]');
    if(!b) return;
    bar.querySelectorAll('.demo-steps button').forEach(x => x.classList.toggle('on', x === b));
    const k = b.dataset.demo;
    if(k === '1') stepTables();
    else if(k === '2') stepStats();
    else if(k === '3') stepReport();
    else if(k === '4') stepWord();
    else if(k === 'reset'){
      if(!confirm('데모 데이터를 처음 상태로 되돌릴까요? (실제 시스템 데이터에는 영향이 없습니다)')) return;
      try{ sysStore.db && sysStore.db.close(); }catch(err){}
      indexedDB.deleteDatabase('paytable-system-demo');
      setTimeout(() => location.reload(), 300);
    }
  });

  seed().then(() => { loadSample(); renderData(); });
})();

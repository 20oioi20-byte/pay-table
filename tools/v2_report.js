/* ============================================================
   인건비 분석 보고서 보정 (v2 전용 — v1 index.html은 그대로 둠)
   1) 시급·비교 금액: 실제 양식은 등급 행이 '업적수당 금액'이라
      기존 계산(등급 행 ÷ 209)이 시급을 3천원대로 만듦 → 아래 정의로 다시 계산
        월 총임금 = 기준급여 소계 + B등급 업적수당 + 고정 초과·야간·통신 (= '월 보수 합계')
        환산 시급 = (기준급여 소계 + B등급 업적수당) ÷ 월 소정시간(기본급 수식의 시간수)
      이미 저장된 스냅샷도 화면에 그릴 때 다시 계산하므로 다시 저장할 필요 없음
   2) Word 저장: 차트를 PNG 파트로 함께 넣은 MHTML(.doc) + 화면 스타일을 요소마다 직접 넣어
      Word에서도 화면과 같은 모양이 나오게 함
   ============================================================ */
(() => {
  const num = v => typeof v === 'number' && isFinite(v) ? v : 0;

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

  /* 저장된 스냅샷(메모리)의 비교 금액·시급을 새 정의로 맞춤 */
  function normalize(){
    SNAPS.forEach(s => (s.jobs || []).forEach(j => {
      const p = payOf(j);
      j.compareMonthly = p.monthly;
      j.hourly = p.hourly;
    }));
  }
  centerValue = function(snap, lt){
    return mean(snap.jobs.filter(j => j.laborType === lt).map(j => payOf(j).hourly));
  };

  const RELABEL = [
    ['비교 월액(B등급)', '월 총임금'],
    ['비교 기준은 B등급 월 급여를 상담유형별 월소정근로시간으로 나눈 시급입니다. B등급이 없는 직무는 월총액을 사용했습니다.',
     '월 총임금 = 기준급여 소계 + B등급 업적수당 + 고정 초과·야간·통신 수당. 환산 시급 = (기준급여 소계 + B등급 업적수당) ÷ 월 소정시간(기본급 수식의 시간수).']
  ];
  const relabel = el => { if(!el) return; let s = el.innerHTML; RELABEL.forEach(([a, b]) => { s = s.split(a).join(b); }); if(s !== el.innerHTML) el.innerHTML = s; };

  const origReport = renderReport;
  renderReport = function(){ normalize(); origReport.apply(this, arguments); relabel(document.getElementById('reportDoc')); };
  const origStats = renderStats;
  renderStats = function(){ normalize(); origStats.apply(this, arguments); relabel(document.getElementById('statsCenterJobs')); };

  /* ---------- Word 저장 (MHTML .doc) ---------- */
  const PROPS = ['color', 'background-color', 'font-size', 'font-weight', 'text-align', 'line-height',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'margin-top', 'margin-bottom'];
  const b64utf8 = s => { const b = new TextEncoder().encode(s); let bin = ''; for(let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(bin); };
  const wrap76 = s => s.replace(/.{1,76}/g, '$&\r\n');

  async function buildWord(){
    const src = document.getElementById('reportDoc');
    /* template 안에서 바꿔야 이미지 요청이 생기지 않음 */
    const tpl = document.createElement('template'); tpl.innerHTML = src.innerHTML;
    const live = [...src.querySelectorAll('*')], copy = [...tpl.content.querySelectorAll('*')];
    live.forEach((el, k) => {
      if(el.closest('svg')) return;
      const cs = getComputedStyle(el), out = [];
      PROPS.forEach(pr => { const v = cs.getPropertyValue(pr); if(pr === 'background-color' && /rgba\(0, 0, 0, 0\)|transparent/.test(v)) return; out.push(`${pr}:${v}`); });
      ['top', 'right', 'bottom', 'left'].forEach(sd => { const w = cs.getPropertyValue(`border-${sd}-width`); if(parseFloat(w) > 0) out.push(`border-${sd}:${w} ${cs.getPropertyValue(`border-${sd}-style`)} ${cs.getPropertyValue(`border-${sd}-color`)}`); });
      out.push("font-family:'KT Flow','맑은 고딕','Malgun Gothic',sans-serif");
      copy[k].setAttribute('style', out.join(';'));
    });
    /* Word는 grid/flex를 모르므로 요약 카드는 표로 */
    tpl.content.querySelectorAll('.rp-kpis').forEach(k => {
      const t = document.createElement('table'); t.setAttribute('style', 'border-collapse:collapse;width:100%;margin:6pt 0 10pt');
      const tr = t.insertRow();
      [...k.children].forEach(d => { const td = tr.insertCell(); td.setAttribute('style', d.getAttribute('style') + ';width:33%;vertical-align:top'); td.innerHTML = d.innerHTML; });
      k.replaceWith(t);
    });
    const parts = []; let n = 0;
    for(const box of tpl.content.querySelectorAll('.rp-chart')){
      const svg = box.querySelector('svg'); if(!svg) continue;
      const w = +svg.getAttribute('width') || 680, hgt = +svg.getAttribute('height') || 260;
      const url = await svgToPng(svg.outerHTML);
      if(!url){ box.innerHTML = ''; continue; }
      const name = `chart${++n}.png`;
      parts.push({ name, png: url.split(',')[1] });
      box.innerHTML = `<img src="report_files/${name}" width="${w}" height="${hgt}" alt="비교 차트">`;
    }
    const html = `<html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><title>${esc(reportFileBase())}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->
<style>@page Section1{size:21.0cm 29.7cm;margin:1.8cm;mso-page-orientation:portrait}div.Section1{page:Section1}
table{border-collapse:collapse;width:100%}</style></head>
<body><div class="Section1">${tpl.innerHTML}</div></body></html>`;
    const B = '----=_NextPart_PAYTABLE';
    let mht = `MIME-Version: 1.0\r\nContent-Type: multipart/related; boundary="${B}"; type="text/html"\r\n\r\n`
      + `--${B}\r\nContent-Location: file:///C:/report.htm\r\nContent-Transfer-Encoding: base64\r\nContent-Type: text/html; charset="utf-8"\r\n\r\n${wrap76(b64utf8(html))}\r\n`;
    parts.forEach(p => { mht += `--${B}\r\nContent-Location: file:///C:/report_files/${p.name}\r\nContent-Transfer-Encoding: base64\r\nContent-Type: image/png\r\n\r\n${wrap76(p.png)}\r\n`; });
    return { mht: mht + `--${B}--\r\n`, html, parts };
  }
  window.__v2report = { buildWord, payOf };

  /* 기존 [Word] 버튼의 동작을 새 방식으로 교체 */
  const btn = document.getElementById('repWordBtn');
  if(btn){
    const nb = btn.cloneNode(true); btn.replaceWith(nb);
    nb.addEventListener('click', async () => {
      const { mht } = await buildWord();
      downloadBlob(new Blob([mht], { type:'application/msword' }), reportFileBase() + '.doc');
    });
  }
})();

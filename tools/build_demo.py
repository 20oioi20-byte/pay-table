"""데모(시연용) HTML 만들기.

실제 시스템 배포본(dist/급여조견표_관리시스템.html)을 읽어
데모 전용 설정을 덧씌운 dist/급여조견표_관리시스템_데모.html 을 만든다.
실제 시스템 파일은 바꾸지 않는다.

    python3 tools/build_demo.py
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'dist' / '급여조견표_관리시스템.html'
OUT = ROOT / 'dist' / '급여조견표_관리시스템_데모.html'

WORD_OLD = ("const html = `<html xmlns:o=\"urn:schemas-microsoft-com:office:office\" xmlns:w=\"urn:schemas-microsoft-com:office:word\">"
            "<head><meta charset=\"utf-8\"><title>${esc(reportFileBase())}</title><style>${REPORT_CSS}</style></head>"
            "<body>${clone.innerHTML}</body></html>`;")
WORD_NEW = ("const html = `<html xmlns:o=\"urn:schemas-microsoft-com:office:office\" xmlns:w=\"urn:schemas-microsoft-com:office:word\" xmlns=\"http://www.w3.org/TR/REC-html40\">"
            "<head><meta charset=\"utf-8\"><title>${esc(reportFileBase())}</title>"
            "<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->"
            "<style>@page WordSection1{size:595.3pt 841.9pt;margin:54pt 50pt 54pt 50pt;mso-header-margin:28pt;mso-footer-margin:28pt;}"
            "div.WordSection1{page:WordSection1;}${REPORT_CSS}"
            " .rp-head{border-bottom:2pt solid #1d4ed8;padding-bottom:8pt;margin-bottom:6pt}"
            " h2{page-break-after:avoid} table{page-break-inside:avoid}"
            " td b{font-size:14pt} td span,td em{display:block;font-size:9pt;color:#6b7280;font-style:normal}</style></head>"
            "<body><div class=\"WordSection1\">${clone.innerHTML}"
            "<p style=\"font-size:8.5pt;color:#9ca3af;margin-top:18pt\">본 문서는 급여조견표 관리시스템에서 자동 생성되었습니다.</p></div></body></html>`;")

KPI_LINE = ("clone.querySelectorAll('.rp-kpis').forEach(k => { k.outerHTML = `<table><tr>${[...k.children]"
            ".map(d => `<td>${d.innerHTML}</td>`).join('')}</tr></table>`; });")
# Word·한글 뷰어마다 <style> 적용이 달라 표 테두리·글꼴을 셀에 직접 넣음
WORD_TABLE_STYLE = """
  const FONT = "font-family:'Malgun Gothic','맑은 고딕',sans-serif;";
  clone.querySelectorAll('table').forEach(t => { t.setAttribute('border', '1'); t.setAttribute('cellspacing', '0'); t.setAttribute('cellpadding', '5'); t.setAttribute('width', '100%');
    t.setAttribute('style', 'border-collapse:collapse;width:100%;margin:6pt 0;' + FONT); });
  clone.querySelectorAll('th,td').forEach(c => { const r = c.classList.contains('r');
    c.setAttribute('style', 'border:1pt solid #d1d5db;padding:3pt 6pt;font-size:9.5pt;line-height:1.25;' + FONT + (r ? 'text-align:right;white-space:nowrap;' : '')
      + (c.tagName === 'TH' ? 'background:#f3f4f6;font-weight:bold;' : '') + (c.closest('tr.sel') ? 'background:#eef2ff;font-weight:bold;' : '')); });
  clone.querySelectorAll('h1,h2,p,li,div,span,em,b').forEach(el => { el.setAttribute('style', (el.getAttribute('style') || '') + FONT); });
  clone.querySelectorAll('h2').forEach(h => h.setAttribute('style', FONT + 'font-size:13pt;border-bottom:1.5pt solid #1d4ed8;padding-bottom:3pt;margin:18pt 0 8pt;'));
"""

DEMO_CSS = """
  /* 데모 막대 */
  .demo-bar{ display:flex; flex-wrap:wrap; align-items:center; gap:8px 12px; margin:16px 28px 0; padding:12px 16px;
    background:#fff7e6; border:1px solid #f3d19a; border-radius:12px; }
  .demo-badge{ background:#b45309; color:#fff; font-weight:800; font-size:12px; padding:3px 10px; border-radius:999px; }
  .demo-title{ font-weight:700; color:#7c4a03; font-size:13.5px; }
  .demo-steps{ display:flex; gap:6px; flex-wrap:wrap; }
  .demo-steps button{ border:1px solid #e9c48a; background:#fff; color:#7c4a03; border-radius:8px; padding:7px 12px; font:inherit; font-size:13px; font-weight:600; cursor:pointer; }
  .demo-steps button b{ display:inline-flex; width:18px; height:18px; border-radius:50%; background:#f3d19a; color:#7c4a03; font-size:11px; align-items:center; justify-content:center; margin-right:4px; }
  .demo-steps button.on{ background:#b45309; border-color:#b45309; color:#fff; }
  .demo-steps button.on b{ background:#fff; color:#b45309; }
  .demo-reset{ margin-left:auto; border:0; background:none; color:#9a5b00; font:inherit; font-size:12.5px; text-decoration:underline; cursor:pointer; }
  .demo-tip{ flex-basis:100%; font-size:12.5px; color:#7c4a03; }
  @media (max-width:860px){ .demo-bar{ margin:12px 16px 0; } }
"""


def must_replace(s, old, new):
    assert old in s, f'찾을 수 없음: {old[:60]}'
    return s.replace(old, new, 1)


def main():
    s = SRC.read_text(encoding='utf-8')
    s = must_replace(s, '<title>급여조견표 관리시스템</title>', '<title>급여조견표 관리시스템 (데모)</title>')
    s = must_replace(s, "indexedDB.open('paytable-system', 1)", "indexedDB.open('paytable-system-demo', 1)")
    s = must_replace(s, "const COUNT = { '공공':42, '금융':51, '유통':44, '통신':33 };", "const COUNT = { '공공':8, '금융':9, '유통':7, '통신':6 };")
    s = must_replace(s, '(센터 170곳)', '(센터 30곳)')
    s = must_replace(s, WORD_OLD, WORD_NEW)
    s = must_replace(s, KPI_LINE, KPI_LINE + WORD_TABLE_STYLE)
    s = must_replace(s, '<strong>급여관리 시스템</strong>', '<strong>급여관리 시스템 · 데모</strong>')
    i = s.index('</style>\n</head>')
    s = s[:i] + DEMO_CSS + s[i:]
    demo_js = (ROOT / 'tools' / 'demo_inject.js').read_text(encoding='utf-8')
    i = s.rindex('</body>')
    s = s[:i] + '<script>\n' + demo_js + '\n</script>\n' + s[i:]
    OUT.write_text(s, encoding='utf-8')
    print(f'{OUT.name}: {len(s.encode()) // 1024} KB')


if __name__ == '__main__':
    main()

"""급여관리 시스템 v2 HTML 만들기.

인터넷 없이 동작하는 배포본(dist/급여조견표_관리시스템.html)을 읽어
v2 기능(첫 실행 안내, 공유 폴더 자동 연결, DRM 파일 백그라운드 처리·대기 중 질문,
공유 설정)을 덧씌운 dist/급여조견표_관리시스템_v2.html 과 dist/version.json 을 만든다.
v1 파일과 v1 저장소(paytable-system)는 바꾸지 않는다.

    python3 tools/build_v2.py [--sharepoint-url URL] [--team 팀이름]

--sharepoint-url 에 SharePoint '급여조견표' 폴더 주소를 넣으면, 첫 실행 안내의
[공유 폴더 열기] 버튼이 그 주소로 바로 연결된다(M365 설정 2단계 후 확인한 주소).
회사 주소를 저장소에 남기지 않도록, 인자 대신 tools/v2.local.json(저장소 제외 파일)에
{"sharepointUrl": "...", "team": "..."} 로 적어 두어도 된다.
"""
import argparse
import base64
import json
from urllib.parse import quote
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'dist' / '급여조견표_관리시스템.html'
OUT = ROOT / 'dist' / '급여조견표_관리시스템_v2.html'
APP_VERSION = '2.7.2'

V2_CSS = """
  /* ===== v2: 첫 실행 안내 · 공유 폴더 · 업로드 대기 ===== */
  .v2-modal{ position:fixed; inset:0; z-index:50; background:rgba(15,27,48,.55); display:flex; align-items:center; justify-content:center; padding:16px; }
  .v2-card{ background:var(--card); border-radius:14px; width:min(560px,100%); max-height:calc(100vh - 32px); overflow:auto; padding:26px 28px 18px; box-shadow:0 20px 50px rgba(0,0,0,.25); }
  .v2-wiz-head small{ color:var(--pri); font-weight:800; font-size:12px; letter-spacing:.06em; }
  .v2-wiz-head h2{ margin:2px 0 12px; font-size:20px; }
  .v2-dots{ display:flex; gap:6px; list-style:none; padding:0; margin:0 0 18px; }
  .v2-dots li{ flex:1; font-size:12px; color:var(--muted); border-top:3px solid var(--line); padding-top:6px; }
  .v2-dots li.on{ border-color:var(--pri); color:var(--pri); font-weight:700; }
  .v2-card section{ display:flex; flex-direction:column; gap:12px; font-size:14px; line-height:1.6; }
  .v2-card section > label{ display:flex; flex-direction:column; gap:5px; font-weight:600; font-size:13px; }
  .v2-card input[type=text]{ padding:9px 11px; border:1px solid #d5dbe4; border-radius:8px; font:inherit; font-size:14px; }
  .v2-card label.v2-check{ flex-direction:row; align-items:center; gap:8px; font-weight:600; }
  .v2-mini{ margin:0; padding-left:20px; font-size:13px; color:var(--ink2); }
  .v2-act{ display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap; }
  .v2-big{ padding:11px 18px; font-size:14.5px; text-decoration:none; display:inline-flex; justify-content:center; }
  .v2-err{ color:var(--bad); font-weight:700; font-size:13px; margin:0; } .v2-err:empty, .v2-ok:empty{ display:none; }
  .v2-ok{ color:var(--ok); font-weight:700; font-size:13px; margin:0; background:var(--ok-soft); padding:8px 10px; border-radius:8px; }
  .v2-later{ display:block; margin:14px auto 0; border:0; background:none; color:var(--muted); font:inherit; font-size:12.5px; text-decoration:underline; cursor:pointer; }
  .v2-webstart{ display:flex; gap:10px 14px; align-items:center; flex-wrap:wrap; margin:0 0 12px; padding:12px 14px; border:1px solid var(--pri); border-radius:12px; background:var(--pri-soft); }
  .v2-webstart a{ text-decoration:none; } .v2-webstart .hint{ flex:1; min-width:220px; margin:0; }
  .v2-fallback{ margin-top:12px; } .v2-fallback summary{ cursor:pointer; font-size:13px; color:var(--muted); font-weight:600; }
  .v2-conn{ margin-left:auto; margin-right:12px; border:1px solid var(--line); background:var(--card); border-radius:999px; padding:5px 12px; font:inherit; font-size:12.5px; font-weight:600; cursor:pointer; color:var(--muted); }
  .v2-conn::before{ content:""; display:inline-block; width:8px; height:8px; border-radius:50%; background:var(--muted); margin-right:6px; vertical-align:1px; }
  .v2-conn[data-state="on"]{ color:var(--ok); } .v2-conn[data-state="on"]::before{ background:var(--ok); }
  .v2-conn[data-state="ask"]{ color:var(--warn); border-color:var(--warn); } .v2-conn[data-state="ask"]::before{ background:var(--warn); }
  .v2-banner{ display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin:16px 28px 0; padding:10px 16px; background:var(--warn-soft); border:1px solid #f1c27d; border-radius:12px; font-size:13.5px; font-weight:600; color:#7c4a03; }
  .v2-toast{ position:fixed; right:20px; bottom:20px; z-index:60; max-width:420px; background:#0f1b30; color:#fff; padding:12px 16px; border-radius:10px; font-size:13.5px; line-height:1.5; box-shadow:0 10px 30px rgba(0,0,0,.25); }
  .v2-toast-btn{ display:block; margin-top:8px; border:0; border-radius:7px; background:#fff; color:#0f1b30; font:inherit; font-weight:800; font-size:13px; padding:6px 12px; cursor:pointer; }
  .v2-badge[data-state="done"]{ background:var(--ok); }
  .v2-job{ margin-top:14px; }
  .v2-job-head{ display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
  .v2-state{ font-size:12px; font-weight:800; padding:2px 9px; border-radius:999px; background:var(--pri-soft); color:var(--pri); }
  .v2-state[data-state="slow"], .v2-state[data-state="need"]{ background:var(--warn-soft); color:var(--warn); }
  .v2-state[data-state="done"]{ background:var(--ok-soft); color:var(--ok); }
  .v2-state[data-state="fail"]{ background:var(--bad-soft); color:var(--bad); }
  .v2-timer{ font-size:22px; font-weight:800; font-variant-numeric:tabular-nums; color:var(--ink2); }
  .v2-track{ height:6px; background:var(--line); border-radius:3px; overflow:hidden; margin:10px 0 6px; }
  .v2-fill{ height:100%; width:0; background:var(--pri); transition:width .8s linear; }
  .v2-qh{ font-size:14px; margin:14px 0 8px; }
  .v2-q{ display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:10px 14px; }
  .v2-q label{ display:flex; flex-direction:column; gap:4px; font-size:12.5px; font-weight:700; color:var(--muted); }
  .v2-q select, .v2-q input{ padding:7px 9px; border:1px solid #d5dbe4; border-radius:8px; font:inherit; font-size:13.5px; color:var(--ink2); background:#fff; }
  .v2-job .v2-act{ margin-top:12px; justify-content:flex-start; } .v2-job .v2-act:empty{ display:none; }
  .v2-badge{ margin-left:auto; font-size:10.5px; font-weight:800; padding:1px 7px; border-radius:999px; background:var(--pri); color:#fff; }
  .v2-badge[data-state="fail"]{ background:var(--bad); }
  .v2-share{ display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-top:12px; padding-top:12px; border-top:1px solid var(--line); }
  /* 바로가기 · 상태 점검 · 처리 이력 · 변경전 비교 · 도움말 */
  .v2-link{ text-decoration:none; display:inline-flex; align-items:center; white-space:nowrap; }
  a.v2-link.btn-ghost{ padding:6px 11px; border:1px solid var(--line); border-radius:8px; background:#fff; color:var(--ink2); font-size:12.5px; font-weight:600; }
  a.v2-link.btn-ghost:hover{ border-color:var(--pri); color:var(--pri); }
  .v2-links{ display:grid; grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); gap:8px; }
  .v2-linkcard{ display:flex; flex-direction:column; gap:2px; padding:10px 12px; border:1px solid var(--line); border-radius:10px; text-decoration:none; color:var(--ink2); background:#fff; }
  .v2-linkcard:hover{ border-color:var(--pri); background:var(--pri-soft); }
  .v2-linkcard b{ font-size:13.5px; color:var(--pri); } .v2-linkcard span{ font-size:12px; color:var(--muted); }
  .v2-admins{ display:flex; gap:8px 12px; align-items:flex-end; flex-wrap:wrap; margin-top:14px; padding-top:12px; border-top:1px solid var(--line); font-size:13px; }
  .v2-admins label{ display:flex; flex-direction:column; gap:4px; font-weight:600; }
  .v2-admins input{ padding:6px 9px; border:1px solid #d5dbe4; border-radius:8px; font:inherit; font-size:13px; width:180px; }
  .v2-healthbtn{ margin-right:12px; border:1px solid var(--line); background:var(--card); border-radius:999px; padding:5px 11px; font:inherit; font-size:12.5px; font-weight:600; color:var(--ink2); cursor:pointer; }
  .v2-healthbtn:hover{ border-color:var(--pri); color:var(--pri); }
  .v2-conn{ margin-right:6px; }
  .v2-wide{ width:min(720px,100%); }
  .v2-card .ph h2{ margin:0; font-size:18px; }
  .v2-checks{ list-style:none; margin:10px 0 14px; padding:0; display:flex; flex-direction:column; gap:6px; }
  .v2-checks li{ display:grid; grid-template-columns:14px minmax(0,1fr) auto; gap:10px; align-items:center; padding:9px 12px; border:1px solid var(--line); border-radius:10px; }
  .v2-checks li > div:nth-child(2){ display:flex; flex-direction:column; min-width:0; }
  .v2-checks li b{ font-size:13.5px; } .v2-checks li span{ font-size:12.5px; color:var(--muted); overflow-wrap:anywhere; }
  .v2-checks li .v2-act{ justify-content:flex-end; }
  .v2-dot{ width:10px; height:10px; border-radius:50%; background:var(--ok); }
  .v2-checks li[data-state="warn"] .v2-dot{ background:var(--warn); } .v2-checks li[data-state="bad"] .v2-dot{ background:var(--bad); }
  .v2-checks li[data-state="bad"]{ border-color:#f3c2c2; background:var(--bad-soft); }
  .v2-prefill{ margin:0 0 8px; font-size:12.5px; font-weight:600; color:var(--ok); background:var(--ok-soft); border-radius:8px; padding:6px 10px; }
  #v2Compare tr.v2-down td{ background:var(--bad-soft); color:var(--bad); font-weight:600; }
  #v2Compare tr.v2-big td{ background:var(--warn-soft); }
  .v2-help{ display:inline-flex; align-items:center; justify-content:center; width:17px; height:17px; border-radius:50%; border:1px solid #c9d1dc; background:#fff; color:var(--muted); font:inherit; font-size:11px; font-weight:800; line-height:1; cursor:pointer; vertical-align:1px; padding:0; margin-left:2px; }
  .v2-help:hover, .v2-help:focus-visible{ border-color:var(--pri); color:var(--pri); }
  .v2-pop{ position:fixed; z-index:70; background:#0f1b30; color:#fff; font-size:12.5px; line-height:1.55; padding:9px 12px; border-radius:8px; box-shadow:0 8px 24px rgba(0,0,0,.2); }
  .v2-state[data-state="upload"]{ background:var(--pri-soft); color:var(--pri); }
  .v2-steps a.btn-primary.v2-link{ padding:7px 14px; border-radius:8px; color:#fff; font-weight:700; }
  .v2-state[data-state="paste"]{ background:var(--pri-soft); color:var(--pri); }
  .v2-job .v2-act.v2-col{ flex-direction:column; align-items:stretch; gap:8px; }
  .v2-steps{ margin:0; padding-left:20px; font-size:13.5px; line-height:1.8; }
  .v2-paste{ width:100%; min-height:70px; padding:10px 12px; border:2px dashed var(--pri); border-radius:10px; font:inherit; font-size:13px; background:var(--pri-soft); resize:vertical; }
  .v2-sp{ display:flex; flex-direction:column; gap:6px; margin-top:14px; padding-top:12px; border-top:1px solid var(--line); font-size:13px; }
  .v2-sp p{ margin:0; } .v2-sp label{ display:flex; flex-direction:column; gap:4px; font-weight:600; }
  .v2-sp input{ padding:7px 9px; border:1px solid #d5dbe4; border-radius:8px; font:inherit; font-size:13px; max-width:720px; }
  .v2-sp-row{ display:flex; gap:12px; flex-wrap:wrap; } .v2-sp-row input{ width:180px; }
  .v2-q label.v2-q-wide{ grid-column:span 2; } .v2-pick.bad{ color:var(--bad); font-weight:700; font-size:13px; align-self:center; }
  .v2-snapsum{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:12px; font-size:13.5px; }
  .tblwrap.v2-collapsed tr.v2-auto{ display:none; } #snapJobs tr.v2-odd td{ background:var(--warn-soft); }
  .v2-demo{ margin:auto 12px 8px; padding:8px 10px; border:1px dashed rgba(255,255,255,.25); border-radius:10px; font-size:11.5px; color:var(--sb-quiet); display:flex; flex-direction:column; gap:6px; }
  .v2-demo[hidden]{ display:none; } .v2-demo div{ display:flex; gap:6px; }
  .v2-demo button{ flex:1; border:1px solid rgba(255,255,255,.2); background:transparent; color:var(--sb-ink); border-radius:7px; padding:4px 0; font:inherit; font-size:11.5px; cursor:pointer; }
  .v2-demo button:hover{ background:rgba(255,255,255,.08); }
  /* v2.7 · 단계별 탭 */
  #tabCreate.v2-flowon .v2-off{ display:none !important; }
  .v2-flow{ list-style:none; margin:0 0 14px; padding:0; display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:6px; }
  .v2-flow button{ width:100%; display:flex; flex-direction:column; align-items:flex-start; gap:2px; padding:9px 10px; border:1px solid var(--line); border-radius:10px; background:var(--card); font:inherit; cursor:pointer; text-align:left; color:var(--ink2); }
  .v2-flow button:disabled{ cursor:not-allowed; opacity:.5; }
  .v2-flow .n{ font-size:11px; font-weight:800; width:20px; height:20px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; background:var(--line); color:var(--ink2); }
  .v2-flow .t{ font-size:13px; font-weight:700; } .v2-flow .s{ font-size:11.5px; color:var(--muted); }
  .v2-flow button.done .n{ background:var(--ok); color:#fff; } .v2-flow button.warn .s{ color:var(--warn); font-weight:700; }
  .v2-flow button.stop .s{ color:var(--bad); font-weight:700; } .v2-flow button.skip .s{ color:var(--muted); }
  .v2-flow button.on{ border-color:var(--pri); box-shadow:0 0 0 2px var(--pri) inset; } .v2-flow button.on .n{ background:var(--pri); color:#fff; }
  @media (max-width:980px){ .v2-flow{ grid-template-columns:repeat(4,minmax(0,1fr)); } }
  .v2-get{ display:grid; grid-template-columns:1fr 1fr; gap:16px; } .v2-get > div{ border:1px solid var(--line); border-radius:12px; padding:14px 16px; }
  .v2-get p{ margin:6px 0 12px; } @media (max-width:860px){ .v2-get{ grid-template-columns:1fr; } }
  .v2-getprev{ margin-top:12px; } .v2-getprev summary{ cursor:pointer; font-weight:600; font-size:13px; color:var(--muted); }
  #tabCreate.v2-flowon #resultPanel.v2-collapsed{ position:absolute; left:-10000px; top:0; width:1200px; }
  #v2ConPlan tr.v2-muted td{ color:var(--muted); }
  /* v2.7 · 기준정보 하위 탭 */
  #tabSettings .v2-stoff{ display:none !important; }
  .v2-settabs{ display:flex; gap:6px; flex-wrap:wrap; margin:0 0 14px; }
  .v2-settabs button{ border:1px solid var(--line); background:var(--card); border-radius:999px; padding:8px 18px; font:inherit; font-size:14px; font-weight:700; cursor:pointer; color:var(--ink2); }
  .v2-settabs button[aria-selected="true"]{ background:#000; border-color:#000; color:#fff; }
  .v2-job-right{ display:flex; flex-direction:column; align-items:flex-end; gap:6px; }
  .v2-flow button.lock{ opacity:.55; } .v2-flow button.lock:hover{ opacity:.85; }
  .v2-lockmsg{ display:flex; flex-direction:column; align-items:flex-start; gap:6px; border-style:dashed; } .v2-lockmsg[hidden]{ display:none; } .v2-lockmsg p{ margin:0; }
  .v2-mode{ display:flex; flex-direction:column; gap:6px; margin-top:14px; padding-top:12px; border-top:1px solid var(--line); font-size:13px; }
  .v2-mode label{ display:flex; gap:6px; align-items:center; cursor:pointer; }
  /* v2.4 · 변경전 비교 접기 · 일괄 확인 · 다음 단계 막대 */
  .v2-cmp summary{ cursor:pointer; display:flex; gap:8px 12px; align-items:center; flex-wrap:wrap; font-size:14px; list-style:none; }
  .v2-cmp summary::-webkit-details-marker{ display:none; }
  .v2-cmp summary::before{ content:"▸"; color:var(--muted); } .v2-cmp[open] summary::before{ content:"▾"; }
  .v2-cmp .tblwrap{ margin-top:10px; }
  .v2-red{ color:var(--bad); }
  #v2Compare tr.v2-muted td{ color:var(--muted); }
  .v2-ackall{ margin:6px 0 2px; }
  .v2-next{ position:sticky; bottom:0; z-index:20; display:flex; flex-wrap:wrap; align-items:center; gap:8px 16px; margin-top:16px; padding:12px 18px;
    background:#0f1b30; color:#fff; border-radius:12px 12px 0 0; box-shadow:0 -6px 20px rgba(15,27,48,.18); }
  .v2-next-steps{ display:flex; gap:6px; flex-wrap:wrap; font-size:12px; }
  .v2-next-steps span{ padding:3px 9px; border-radius:999px; background:rgba(255,255,255,.08); color:#9fb0cc; }
  .v2-next-steps span.on{ background:#fff; color:#0f1b30; font-weight:800; } .v2-next-steps span.done{ color:#8fd6a6; }
  .v2-next-msg{ flex:1; min-width:200px; font-size:13.5px; font-weight:600; }
  .v2-next-act{ display:flex; gap:8px; flex-wrap:wrap; }
  .v2-next-act a.v2-link.btn-ghost{ background:transparent; color:#fff; border-color:rgba(255,255,255,.35); }
  .v2-next-act .btn-ghost{ background:transparent; color:#fff; border-color:rgba(255,255,255,.35); }
  .v2-flash{ outline:3px solid var(--pri); outline-offset:3px; transition:outline-color .6s; }
  .v2-sandbox{ background:var(--bad-soft); border-color:#f3c2c2; color:var(--bad); }
  /* v2.6.6 · 변경동의서 입력 창 */
  .v2-con-info{ margin:0; font-size:13.5px; }
  .v2-con-mode{ display:flex; flex-direction:column; gap:6px; font-size:13px; }
  .v2-con-now{ display:flex; flex-direction:column; gap:10px; padding:10px 12px; border:1px solid var(--line); border-radius:10px; background:#f8fafc; }
  .v2-con-now[hidden]{ display:none; }
  .v2-con-now label{ display:flex; flex-direction:column; gap:5px; font-weight:600; font-size:13px; }
  .v2-card input[type=date]{ padding:8px 10px; border:1px solid #d5dbe4; border-radius:8px; font:inherit; font-size:14px; }
  @media (prefers-reduced-motion:reduce){ .v2-fill{ transition:none; } }
  @media (max-width:860px){ .v2-banner{ margin:12px 16px 0; } }
"""


def must_replace(s, old, new):
    assert old in s, f'찾을 수 없음: {old[:60]}'
    return s.replace(old, new, 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--sharepoint-url', default='')
    ap.add_argument('--team', default='급여조견표 관리')
    ap.add_argument('--demo', action='store_true', help='시연용: 회사 주소 없이, 별도 저장소·가상 데이터·시연 안내 포함')
    a = ap.parse_args()
    local = ROOT / 'tools' / 'v2.local.json'
    links = {}
    if a.demo:
        pass   # 시연본에는 회사 주소를 넣지 않음
    elif local.exists():
        cfg_local = json.loads(local.read_text(encoding='utf-8'))
        a.sharepoint_url = a.sharepoint_url or cfg_local.get('sharepointUrl', '')
        a.team = cfg_local.get('team', a.team)
        env, flow = cfg_local.get('flowEnv', ''), cfg_local.get('flowId', '')
        links = {'folder': a.sharepoint_url,
                 'flowRuns': f'https://make.powerautomate.com/environments/{env}/flows/{flow}/details' if env and flow else '',
                 'flowEdit': f'https://make.powerautomate.com/environments/{env}/flows/{flow}' if env and flow else '',
                 'guide': cfg_local.get('guideUrl', ''),
                 'upload': a.sharepoint_url.rsplit('/', 1)[0] + '/' + quote(cfg_local.get('uploadFolder', '급여원본')) if a.sharepoint_url else '',
                 'archive': a.sharepoint_url.rsplit('/', 1)[0] + '/' + quote(cfg_local.get('archiveFolder', '급여보관')) if a.sharepoint_url else ''}
    elif a.sharepoint_url:
        links = {'folder': a.sharepoint_url}
    s = SRC.read_text(encoding='utf-8')
    s = must_replace(s, '<title>급여조견표 관리시스템</title>', '<title>급여조견표 관리시스템 v2 시연</title>' if a.demo else '<title>급여조견표 관리시스템 v2</title>')
    s = must_replace(s, "indexedDB.open('paytable-system', 1)", "indexedDB.open('paytable-system-v2', 1)")
    s = must_replace(s, "indexedDB.open('paytable-link', 1)", "indexedDB.open('paytable-link-v2', 1)")
    s = must_replace(s, '<strong>급여관리 시스템</strong>', '<strong>급여관리 시스템 v2</strong>')
    # v2는 서버(비밀번호) 없이 공유 폴더에서 여는 방식이라 접속 게이트를 쓰지 않음
    s = must_replace(s, "if(location.protocol === 'file:'){\n    document.body.classList.remove('gated');",
                     "if(true){\n    document.body.classList.remove('gated');")
    s = must_replace(s, "처음 한 번 <b>연동 폴더 연결</b>로 OneDrive의 '조견표연동결과' 폴더를 고르면, 이후에는 버튼 하나로 최신 파일을 불러와 바로 검사합니다.",
                     "공유 폴더(급여조견표)가 연결되어 있으면 올린 파일을 자동으로 처리합니다.")
    s = must_replace(s, '연동 파일·붙여넣기로 불러온 급여 데이터는 이 화면에서만 처리하며 외부로 저장하지 않습니다 · 엑셀 파일을 직접 올리면 서버 설정에 따라 저장소에 보관될 수 있습니다',
                     '급여 데이터는 이 PC와 회사 M365(공유 폴더) 안에서만 처리되며 외부 서버로 보내지 않습니다')
    s = must_replace(s, '업로드 시 서버(Supabase)에 자동 저장됩니다', '올린 파일은 팀 공유 폴더(01_원본)에 요청번호와 함께 보관되고, 보안 파일은 자동으로 풀어 읽습니다')
    s = must_replace(s, '<div class="side-group">기타</div>', '<div class="side-group" hidden>기타</div>')
    s = must_replace(s, "setSaveStatus('로컬 전용 모드 (서버 환경변수 미설정 — 클라우드 저장 안 함)', 'warn');",
                     "setSaveStatus('이 PC에서 읽었습니다 (외부 서버로 보내지 않음)', 'ok');")
    # 월총액 검사: 실제 양식은 월 보수 합계 = 통상임금소계 + B등급 업적수당 + 초과·야간·통신 → B등급 금액도 더해 봄
    s = must_replace(s, "const extras = [job.overtime, job.night, job.telecom].map(v => typeof v === 'number' ? v : 0);\n      const combos = [0,1,2,3,4,5,6,7].map(",
                     "const gradeB = ((job.grades || []).find(([g]) => /^B/i.test(String(g).trim())) || [])[1];\n      const extras = [job.overtime, job.night, job.telecom, gradeB].map(v => typeof v === 'number' ? v : 0);\n      const combos = [...Array(16).keys()].map(")
    s = must_replace(s, "기준급여합계와 수당(연장·야간·통신비) 합으로 설명되지 않습니다.", "기준급여합계 + B등급 업적수당 + 수당(연장·야간·통신비) 합으로 설명되지 않습니다.")
    i = s.index('</style>\n</head>')
    skin = (ROOT / 'tools' / 'v2_skin.css').read_text(encoding='utf-8')
    stats_css = (ROOT / 'tools' / 'v2_stats.css').read_text(encoding='utf-8')
    stats_css += (ROOT / 'tools' / 'v2_report.css').read_text(encoding='utf-8')
    s = s[:i] + V2_CSS + skin + stats_css + s[i:]
    # 화면 디자인은 KT 화이트로 고정 (되돌리려면 이 줄과 v2_skin.css를 빼고 빌드)
    s = must_replace(s, '<html lang="ko">', '<html lang="ko" data-skin="kt-light">')
    cfg = {'appVersion': APP_VERSION, 'folderName': '급여조견표', 'teamName': a.team, 'sharepointUrl': a.sharepoint_url,
           'links': links}
    js = '\n'.join((ROOT / 'tools' / f).read_text(encoding='utf-8') for f in ('v2_inject.js', 'v2_stats.js', 'v2_report.js', 'v2_quote.js', 'v2_consent.js', 'v2_flow.js', 'v2_settings.js'))
    # 변경동의서 Word 틀(tools/make_consent_template.py로 만든 것)을 base64로 넣음
    tpl = base64.b64encode((ROOT / 'tools' / 'consent_template.docx').read_bytes()).decode()
    i = s.rindex('</body>')
    s = (s[:i] + '<script>\n/* 관리자 설정: build_v2.py 인자로 바꿉니다 */\nwindow.V2_CONFIG = '
         + json.dumps(cfg, ensure_ascii=False) + ';\nwindow.V2_CONSENT_TPL = "' + tpl + '";\n' + js + '\n</script>\n' + s[i:])
    if a.demo:
        # 실제 시스템과 섞이지 않게 저장소 이름을 바꾸고, 가상 엑셀·시연 안내를 붙임 (version.json은 바꾸지 않음)
        s = s.replace("indexedDB.open('paytable-system-v2', 1)", "indexedDB.open('paytable-system-v2-demo', 1)")
        s = s.replace("indexedDB.open('paytable-link-v2', 1)", "indexedDB.open('paytable-link-v2-demo', 1)")
        xlsx = base64.b64encode((ROOT / 'samples' / '가상_실양식_급여테이블.xlsx').read_bytes()).decode()
        demo = (ROOT / 'tools' / 'demo_v2.js').read_text(encoding='utf-8')
        i = s.rindex('</body>')
        s = s[:i] + f'<script>\nwindow.DEMO_XLSX = "{xlsx}";\n{demo}\n</script>\n' + s[i:]
        out = ROOT / 'dist' / '급여조견표_관리시스템_v2_시연.html'
        out.write_text(s, encoding='utf-8')
        print(f'{out.name}: {len(s.encode()) // 1024} KB')
        return
    OUT.write_text(s, encoding='utf-8')
    (ROOT / 'dist' / 'version.json').write_text(json.dumps(
        {'version': APP_VERSION, 'file': OUT.name, 'date': date.today().isoformat()}, ensure_ascii=False), encoding='utf-8')
    print(f'{OUT.name}: {len(s.encode()) // 1024} KB')


if __name__ == '__main__':
    main()

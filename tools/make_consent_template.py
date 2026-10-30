"""변경동의서 Word 틀 만들기.

담당자가 쓰던 '26년 000센터 근로조건/급여테이블 변경 동의서' 원본(.docx)을 읽어,
서식(글꼴·표·여백)은 그대로 두고 값이 바뀌는 자리만 {{토큰}}으로 바꾼
tools/consent_template.docx 를 만든다. 작성자·마지막 수정자 정보는 지운다.
시스템(v2_consent.js)은 이 틀의 토큰만 바꿔 호봉별 동의서를 만든다.

    python3 tools/make_consent_template.py <원본.docx>
"""
import sys
import zipfile
from pathlib import Path
from lxml import etree

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'tools' / 'consent_template.docx'
W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
NS = {'w': W}


def runs(p):
    return [r for r in p.findall('w:r', NS) if r.find('w:t', NS) is not None]


def ptext(p):
    return ''.join(t.text or '' for t in p.iterfind('.//w:t', NS))


def set_runs(p, texts):
    """문단의 글자 run을 순서대로 texts로 바꿈 (None은 그대로, ''는 비움)"""
    rs = runs(p)
    assert len(rs) == len(texts), f'run 수가 다름: {ptext(p)!r} {len(rs)} != {len(texts)}'
    for r, s in zip(rs, texts):
        if s is None:
            continue
        t = r.find('w:t', NS)
        t.text = s
        t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')


def fill_cell_para(p, token):
    """칸 문단을 토큰 하나로: 첫 run에 토큰, 나머지 run은 비움. run이 없으면 문단 서식으로 run을 만듦"""
    rs = runs(p)
    if rs:
        set_runs(p, [token] + [''] * (len(rs) - 1))
        return
    r = etree.SubElement(p, f'{{{W}}}r')
    ppr_rpr = p.find('w:pPr/w:rPr', NS)
    if ppr_rpr is not None:
        rpr = etree.fromstring(etree.tostring(ppr_rpr))
        r.append(rpr)
    t = etree.SubElement(r, f'{{{W}}}t')
    t.text = token
    t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')


def find_para(paras, starts):
    hit = [p for p in paras if ptext(p).startswith(starts)]
    assert len(hit) == 1, f'문단을 찾지 못함: {starts}'
    return hit[0]


def main(src):
    with zipfile.ZipFile(src) as z:
        files = {n: z.read(n) for n in z.namelist()}
        order = z.namelist()
    doc = etree.fromstring(files['word/document.xml'])
    body = doc.find('w:body', NS)
    paras = body.findall('w:p', NS)

    # 제목: ‘26년 000센터 근로조건/급여테이블 변경 동의서
    set_runs(find_para(paras, '‘26년 000센터'), [None, '{{YY}}', '', '년 ', '{{CENTER}}', ' 근로조건/급여테이블 변경', None])
    # 본문: 0000년 00월 00일 실시된 ‘26년 000센터 … 설명회
    p = find_para(paras, '0000년 00월 00일')
    rs = runs(p)
    texts = [None] * len(rs)
    texts[0:6] = ['{{BRIEF}}', '', '', '', '', ' 실시된 ']
    texts[6:10] = ['‘{{YY}}', '', '년 ', '{{CENTER}}']
    texts[10] = rs[10].find('w:t', NS).text.replace('센터', '', 1)
    set_runs(p, texts)
    # 근로조건: 시간이 바뀐 경우만 남기고 없으면 문단 삭제({{WORK}}가 비면 시스템이 지움)
    p = find_para(paras, '○ 근로조건')
    n = len(runs(p))
    set_runs(p, [None] * 5 + ['{{WORK}}'] + [''] * (n - 6))
    # 급여테이블 변경 : 주요 변경사항 기재
    p = find_para(paras, '○ 급여테이블 변경')
    n = len(runs(p))
    set_runs(p, [None] * (n - 1) + ['{{CHANGE}}'])
    # 시행일
    p = find_para(paras, '○ 시행일')
    n = len(runs(p))
    set_runs(p, [None] * 5 + ['{{EFF}}'] + [''] * (n - 6))
    # 붙임
    p = find_para(paras, '붙임')
    set_runs(p, [None, None, None, '‘{{YY}}', '', '년 ', '{{CENTER}}', ' 급여테이블 ', None, None, None, None])

    # 비교표: 행 이름 → 토큰 이름 (기존 _B, 변경 _A)
    rows = {'근무시간': 'WORKT', '휴게시간': 'REST', '기본급': 'BASIC', '직무수당': 'JOB', '직책수당': 'POS',
            '업적수당': 'PERF', '급식비': 'MEAL', '초과근무': 'OT', '야간근로수당': 'NIGHT'}
    tbl = body.find('w:tbl', NS)
    # 원본 표는 '내용에 맞춤'이라 글자가 길면 열 너비가 바뀜 → 원본 열 너비(1696·3402·3918)로 고정
    tblpr = tbl.find('w:tblPr', NS)
    if tblpr.find('w:tblLayout', NS) is None:
        lay = etree.SubElement(tblpr, f'{{{W}}}tblLayout')
        lay.set(f'{{{W}}}type', 'fixed')
        seq = ['tblStyle', 'tblpPr', 'tblOverlap', 'bidiVisual', 'tblStyleRowBandSize', 'tblStyleColBandSize', 'tblW', 'jc',
                 'tblCellSpacing', 'tblInd', 'tblBorders', 'shd', 'tblLayout', 'tblCellMar', 'tblLook']
        kids = sorted(tblpr, key=lambda e: seq.index(etree.QName(e).localname) if etree.QName(e).localname in seq else 99)
        for k in kids:
            tblpr.remove(k)
        tblpr.extend(kids)
    seen = set()
    for tr in tbl.findall('w:tr', NS):
        tcs = tr.findall('w:tc', NS)
        key = rows.get(''.join(ptext(p) for p in tcs[0].findall('w:p', NS)).strip())
        if not key:
            continue
        seen.add(key)
        for tc, side in ((tcs[1], 'B'), (tcs[2], 'A')):
            ps = tc.findall('w:p', NS)
            if key == 'BASIC':
                assert len(ps) == 2
                fill_cell_para(ps[0], f'{{{{BASIC_{side}1}}}}')
                fill_cell_para(ps[1], f'{{{{BASIC_{side}2}}}}')
            else:
                fill_cell_para(ps[0], f'{{{{{key}_{side}}}}}')
                for extra in ps[1:]:
                    tc.remove(extra)
    assert seen == set(rows.values()), f'표 행 누락: {set(rows.values()) - seen}'

    files['word/document.xml'] = etree.tostring(doc, xml_declaration=True, encoding='UTF-8', standalone=True)

    # 작성자·마지막 수정자 지우기
    core = etree.fromstring(files['docProps/core.xml'])
    for tag in ('{http://purl.org/dc/elements/1.1/}creator',
                '{http://schemas.openxmlformats.org/package/2006/metadata/core-properties}lastModifiedBy'):
        el = core.find(tag)
        if el is not None:
            el.text = ''
    files['docProps/core.xml'] = etree.tostring(core, xml_declaration=True, encoding='UTF-8', standalone=True)

    with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
        for name in order:
            z.writestr(name, files[name])
    print(f'{OUT.relative_to(ROOT)}: {OUT.stat().st_size // 1024} KB')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])

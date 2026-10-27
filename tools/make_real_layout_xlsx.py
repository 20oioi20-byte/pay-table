"""실제 급여테이블과 행·열 구조가 같은 가상 엑셀 만들기 (센터명·담당자·금액 모두 가상).

실제 양식(보수테이블 32~61행, 리딩그룹 63~92행, 예외 및 특례사항 94행~)과 같은 위치에
같은 항목명·수식 형태를 넣는다. 파서·검증 엔진 회귀 테스트와 M365 연결 시험에 쓴다.

    python3 tools/make_real_layout_xlsx.py
"""
from pathlib import Path
import shutil
import subprocess
import tempfile
import openpyxl
from openpyxl.utils import get_column_letter as L

OUT = Path(__file__).resolve().parent.parent / 'samples' / '가상_실양식_급여테이블.xlsx'
MW = 10320                      # 2026년 최저시급
MAIN = [('수습', 0, 150000), ('상담1', 0, 150000), ('상담2', 20000, 150000), ('상담3', 40000, 150000)]
LEAD = [('D', '팀장', 200000, 150000, 50000), ('E', '강사', 150000, 100000, 30000), ('Q', '센터장', 400000, 300000, 80000)]
GRADES = ['S', 'A', 'B', 'C.', 'D', 'E']


def header(ws, center, pm):
    ws['A1'] = f'{center} 직무GROUP 인력운영 기준'
    ws['A4'] = 'Ⅰ. 관리'; ws['S4'] = f'[ 담당PM : {pm} ]'
    ws['A6'] = '요청조직명'; ws['D6'] = '가상사업본부 가상사업단 가상1팀'; ws['H6'] = '요청일자'; ws['K6'] = 46023
    ws['A7'] = '요청사유'; ws['D7'] = '2026년 최저임금 반영'; ws['H7'] = '관리번호'; ws['K7'] = f'{center}/2026년1월'
    ws['A9'] = 'Ⅱ. 직무Group'
    ws['A11'] = '직군명'; ws['D11'] = 'TM직군'
    ws['A12'] = '직무Group명'; ws['D12'] = center; ws['H12'] = '직무Group정의'; ws['K12'] = '고객상담'
    ws['A14'] = 'Ⅲ. 직무'; ws['R14'] = '(단위 : 원, 명)'
    for c, v in zip('ABEHIRS', ['구분', '직무명', '직무정의', '직무/직책수당', '직무규정(소속)', '비평가시 / (등급)', '정원']):
        ws[f'{c}15'] = v
    rows = [('조직장', '센터장', '=Q67'), (None, '팀장', '=D67'), (None, '교육/QAA', '=E67'), ('조직원', '상담사', None)]
    for i, (a, b, h) in enumerate(rows):
        r = 16 + i
        if a: ws[f'A{r}'] = a
        ws[f'B{r}'] = b; ws[f'E{r}'] = f'{b} 업무'; ws[f'R{r}'] = 'X'; ws[f'S{r}'] = 1 if i < 3 else 20
        if h: ws[f'H{r}'] = h
    ws['A22'] = '계'; ws['S22'] = '=SUM(S16:S21)'
    ws['A24'] = 'Ⅳ. 정원'; ws['R24'] = '(단위 : 명)'
    ws['A25'] = '구분'; ws['B25'] = '직급'; ws['D25'] = '컨설턴트(일반)'; ws['I25'] = '컨설턴트(전문)'; ws['S25'] = '계'
    ws['B26'] = '호봉'
    for i, (n, *_r) in enumerate(MAIN):
        ws.cell(26, 4 + i, n); ws.cell(27, 4 + i, [3, 8, 6, 3][i])
    ws['A27'] = '정원'; ws['S27'] = '=SUM(D27:R27)'
    ws['A28'] = '구분'; ws['B28'] = '직급'; ws['D28'] = 'Staff'; ws['P28'] = 'Leader'; ws['S28'] = '계'
    ws['B29'] = '호봉'; ws['D29'] = '상담팀장'; ws['E29'] = '교육강사'; ws['R29'] = '센터장'
    ws['A30'] = '정원'; ws['D30'] = 2; ws['E30'] = 1; ws['R30'] = 1; ws['S30'] = '=SUM(D30:R30)'
    ws['P31'] = '총계'; ws['S31'] = '=S27+S30'


def pay_block(ws, top, title, cols, rate, lead):
    """top = 제목 행(32 또는 63). 항목은 top+3 ~ top+8, 소계 top+9 …"""
    ws.cell(top, 1, title); ws.cell(top, 18, '(단위 : 원, 명)')
    ws.cell(top + 1, 1, '구분'); ws.cell(top + 1, 19, '비고')
    if lead:
        ws.cell(top + 1, 4, 'Staff'); ws.cell(top + 1, 16, 'Leader')
    else:
        ws.cell(top + 1, 4, '상담')
    items = ['기본급', '직책수당', '직무수당', '근속수당', '급식비', '통근비']
    for k, lab in enumerate(items):
        ws.cell(top + 3 + k, 1, lab)
    r_sub, r_g, r_ot, r_ng, r_tel, r_tot = top + 9, top + 10, top + 16, top + 17, top + 18, top + 19
    ws.cell(r_sub, 1, '통상임금소계'); ws.cell(r_g, 1, '업적수당')
    for k, g in enumerate(GRADES):
        ws.cell(r_g + k, 3, g)
    ws.cell(r_ot, 1, '초과근무수당'); ws.cell(r_ng, 1, '야간근로수당'); ws.cell(r_tel, 1, '통신비')
    ws.cell(r_tot, 1, '월 보수 합계')
    labels = ['연차수당(1D)', '시간외수당(1H)', '휴일근로수당(1H)', '야근수당(1H)', '호칭별 연간 보수 합계',
              '전체 연간 인건비 합계(정원기준)', '당해년도 입사자 국민연금 산정 기준 보수월액',
              '당해년도 입사자 건강/고용/산재보험 산정 기준 보수월액']
    for k, lab in enumerate(labels):
        ws.cell(r_tot + 1 + k, 1, lab)
    ws.cell(r_tot + 10, 1, '변경 전 월보수 GAP')
    ws.cell(r_g, 19, '평가결과에 따름 '); ws.cell(r_tot, 19, 'B등급 기준'); ws.cell(r_tot + 5, 19, 'B등급 기준')
    ws.cell(r_tot + 7, 19, 'D등급 기준'); ws.cell(r_tot + 8, 19, 'B등급 기준')
    ws.cell(r_tot + 6, 19, f'=SUM(D{r_tot + 6}:R{r_tot + 6})')
    for c in range(4, 19):
        X = L(c)
        ws.cell(r_sub, c, f'=SUM({X}{top + 3}:{X}{top + 8})')
        ws.cell(r_tot, c, f'={X}{r_sub}+{X}{r_g + 2}+SUM({X}{r_ot}:{X}{r_tel})')
        for k, (lab, mul) in enumerate([('연차', '8'), ('시간외', '1.5'), ('휴일', '1.5'), ('야근', '0.5')]):
            ws.cell(r_tot + 1 + k, c, f'={X}{r_sub}/209*{mul}')
        ws.cell(r_tot + 5, c, f'={X}{r_tot}*12')
        ws.cell(r_tot + 6, c, f'={X}{r_tot + 5}*{X}{27 if not lead else 30}')
        ws.cell(r_tot + 7, c, f'={X}{r_sub}+{X}{r_g + 4}+{X}{r_ot}+{X}{r_ng}+{X}{r_tel}+$C$62-{X}{top + 7}')
        ws.cell(r_tot + 8, c, f'={X}{r_sub}+{X}{r_g + 2}+{X}{r_ot}+{X}{r_ng}+{X}{r_tel}+$C$62')
        ws.cell(r_g + 5, c, 0)                                    # E등급 0원
    if lead:
        ws.cell(r_ot, 19, '팀장, 강사, 센터장 5H')
        for col, name, pos, duty, ten in cols:
            c = openpyxl.utils.column_index_from_string(col); X = col
            ws.cell(top + 2, c, name)
            ws.cell(top + 3, c, f'={MW}*209')
            for k, v in enumerate([pos, duty, ten, round(100000 * rate, -3)]):
                ws.cell(top + 4 + k, c, v)
            for k, add in enumerate([200000, 150000, 100000, 50000, 20000]):
                ws.cell(r_g + k, c, add)
            ws.cell(r_ot, c, f'=ROUNDUP({X}{r_tot + 2}*5,-1)')
            ws.cell(r_tot + 10, c, f"={X}{r_tot}-'급여테이블(변경전)'!{X}{r_tot}")
    else:
        ws.cell(r_ot, 19, '2H')
        for i, (name, ten, _) in enumerate(cols):
            c = 4 + i; X = L(c)
            ws.cell(top + 2, c, name)
            ws.cell(top + 3, c, f'={MW}*209')
            if ten: ws.cell(top + 6, c, ten)
            ws.cell(top + 7, c, round(100000 * rate, -3))
            for k, add in enumerate([120000, 90000, 60000, 30000, 10000]):
                ws.cell(r_g + k, c, add)
            if i: ws.cell(r_ot, c, f'=ROUNDUP({X}{r_tot + 2}*2,-1)')
            ws.cell(r_tot + 10, c, f"={X}{r_tot}-'급여테이블(변경전)'!{X}{r_tot}")


def exceptions(ws):
    ws['A94'] = 'Ⅵ. 예외 및 특례사항'
    lines = {95: '     1. 수습기간은 3개월 적용한다.', 98: '     2. 무급사유 발생 시 통상임금 항목은 일할 계산한다.',
             99: '     3. 업적수당 : 성과평가 결과에 따라 직무별 차등 지급한다. ', 100: '     4. 복리후생비 지급 기준',
             101: '     ㅇ 급식비 ', 102: '구분', 103: '지급기준', 104: '제외사항 ', 113: '  5. 인센티브 지급 기준 ',
             117: '  6. 호봉별 등급부여 기준', 122: '   7. 연차 평균 사용률', 125: '   8. 월 근무일수에 따른 업적수당 지급 기준',
             128: '  9.근무형태'}
    for r, t in lines.items():
        ws[f'A{r}'] = t
    ws['B102'] = '주요내용 '; ws['B103'] = '매 월 마지막 영업일 재직 시 전액 지급'; ws['B104'] = '실제 출근일 수 5일 이하자는 지급 제외'
    for c, v in zip('ABCEFG', ['직무', ' 호봉', ' 근무일', ' 근무시간', ' 휴게시간', ' 비고']):
        ws[f'{c}129'] = v
    for k, (a, b) in enumerate([('센터장', '센터장'), ('팀장, 강사', '팀장, 강사'), ('상담사', '상담사')]):
        r = 130 + k
        ws[f'A{r}'] = a; ws[f'B{r}'] = b; ws[f'C{r}'] = '주 5일(월~금), 40시간(일 8H)'
        ws[f'E{r}'] = '09:00 ~ 18:00'; ws[f'F{r}'] = ' 12:00 ~ 13:00'


def sheet(ws, rate):
    header(ws, '가상시 민원상담콜센터', '홍길동')
    pay_block(ws, 32, 'Ⅴ. 보수테이블', MAIN, rate, False)
    ws['C62'] = 0
    ws['A63'] = 'ㅇ 리딩그룹(스탭이상 ~ 센터장) '
    pay_block(ws, 63, 'ㅇ 리딩그룹(스탭이상 ~ 센터장) ', LEAD, rate, True)
    exceptions(ws)


def main():
    wb = openpyxl.Workbook()
    before = wb.active; before.title = '급여테이블(변경전)'
    sheet(before, 0.9)
    sheet(wb.create_sheet('급여테이블(변경후)'), 1.0)
    OUT.parent.mkdir(exist_ok=True)
    wb.save(OUT)
    recalc(OUT)
    print(OUT.name)


def recalc(path):
    """openpyxl은 수식 결과값을 넣지 못하므로 LibreOffice로 한 번 계산해 값까지 저장한다(없으면 건너뜀)."""
    soffice = shutil.which('soffice')
    if not soffice:
        print('LibreOffice가 없어 수식 결과값 없이 저장했습니다. Excel에서 한 번 열어 저장하면 값이 채워집니다.')
        return
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run([soffice, '--headless', '--calc', '--convert-to', 'xlsx:Calc MS Excel 2007 XML', '--outdir', tmp, str(path)],
                       check=True, capture_output=True, timeout=180)
        shutil.move(str(Path(tmp) / path.name), path)


if __name__ == '__main__':
    main()

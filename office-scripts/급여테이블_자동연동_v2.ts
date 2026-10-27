/**
 * 급여조견표 자동연동 스크립트 v2 (Power Automate '스크립트 실행' 동작에서 호출)
 *
 * 급여테이블(변경후) 값·수식과 변경전 시트 값을 JSON 텍스트로 돌려줍니다. 원본 파일은 바꾸지 않습니다.
 * v1(급여테이블_자동연동.ts)은 그대로 두고, v2 시스템에서만 이 스크립트를 씁니다.
 *
 * 주의: Power Automate에서 실행할 때 Excel 개체 배열에 find/map 같은 콜백 함수를 쓰면
 * "findAsync is not a function" 오류가 나므로 for 반복문만 사용합니다.
 */
function main(workbook: ExcelScript.Workbook): string {
  const sheets = workbook.getWorksheets();
  const names: string[] = [];
  let src: ExcelScript.Worksheet | undefined;
  let fallback: ExcelScript.Worksheet | undefined;
  let before: ExcelScript.Worksheet | undefined;
  for (let i = 0; i < sheets.length; i++) {
    const name = sheets[i].getName();
    names.push(name);
    if (name.indexOf("급여테이블") < 0) continue;
    if (!src && name.indexOf("변경후") >= 0) src = sheets[i];
    if (!before && name.indexOf("변경전") >= 0) before = sheets[i];
    if (!fallback) fallback = sheets[i];
  }
  if (!src) src = fallback;
  if (!src) {
    throw new Error("'급여테이블(변경후)' 시트를 찾지 못했습니다.");
  }

  const used = src.getUsedRange(true);
  if (!used) {
    throw new Error("급여테이블 시트가 비어 있습니다.");
  }
  const area = used.getAddress().split("!").pop() || "A1";
  const start = area.split(":")[0].replace(/\$/g, "");

  // 변경전 시트는 변경후와 같은 범위만 읽어 셀 위치를 맞춘다
  let beforeValues: (string | number | boolean)[][] | null = null;
  if (before) {
    beforeValues = before.getRange(area).getValues();
  }

  return JSON.stringify({
    v: 2,
    kind: "PAYTABLE",
    sheet: src.getName(),
    file: workbook.getName(),
    sheets: names,
    start: start,
    values: used.getValues(),
    formulas: used.getFormulas(),
    before: beforeValues
  });
}

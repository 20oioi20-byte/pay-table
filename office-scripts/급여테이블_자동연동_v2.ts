/**
 * 급여조견표 자동연동 스크립트 v2 (Power Automate '스크립트 실행' 동작에서 호출)
 *
 * v1과 같은 값(values)에 더해 수식(formulas)과 변경전 시트 값(before)을 함께 돌려줍니다.
 * 수식 누락·하드코딩·참조 오류, 변경전 대비 감소 검사에 쓰입니다. 원본 파일은 바꾸지 않습니다.
 * v1(급여테이블_자동연동.ts)은 그대로 두고, v2 시스템에서만 이 스크립트를 씁니다.
 */
function main(workbook: ExcelScript.Workbook): string {
  const sheets = workbook.getWorksheets();
  const src =
    sheets.find(s => s.getName().includes("급여테이블") && s.getName().includes("변경후")) ||
    sheets.find(s => s.getName().includes("급여테이블"));
  if (!src) {
    throw new Error("'급여테이블(변경후)' 시트를 찾지 못했습니다.");
  }
  const before = sheets.find(s => s.getName().includes("급여테이블") && s.getName().includes("변경전"));

  const used = src.getUsedRange(true);
  if (!used) {
    throw new Error("급여테이블 시트가 비어 있습니다.");
  }
  const startOf = (r: ExcelScript.Range) =>
    (r.getAddress().split("!").pop() || "A1").split(":")[0].replace(/\$/g, "");

  // 변경전 시트는 변경후와 같은 범위만 읽어 셀 위치를 맞춘다
  let beforeValues: (string | number | boolean)[][] | null = null;
  if (before) {
    beforeValues = before.getRange(used.getAddress().split("!").pop() || "A1").getValues();
  }

  return JSON.stringify({
    v: 2,
    kind: "PAYTABLE",
    sheet: src.getName(),
    file: workbook.getName(),
    sheets: sheets.map(s => s.getName()),
    start: startOf(used),
    values: used.getValues(),
    formulas: used.getFormulas(),
    before: beforeValues
  });
}

/**
 * 급여조견표 자동연동 스크립트 (Power Automate '스크립트 실행' 동작에서 호출)
 *
 * 급여테이블(변경후) 시트 값을 JSON 텍스트로 돌려줍니다. 원본 파일은 바꾸지 않습니다.
 * 흐름에서 이 결과를 '조견표연동결과' 폴더에 .json 파일로 저장하면,
 * 조견표 생성기 HTML에 그 파일을 끌어다 놓아 바로 불러올 수 있습니다.
 */
function main(workbook: ExcelScript.Workbook): string {
  const sheets = workbook.getWorksheets();
  const src =
    sheets.find(s => s.getName().includes("급여테이블") && s.getName().includes("변경후")) ||
    sheets.find(s => s.getName().includes("급여테이블"));
  if (!src) {
    throw new Error("'급여테이블(변경후)' 시트를 찾지 못했습니다.");
  }

  const used = src.getUsedRange(true);
  if (!used) {
    throw new Error("급여테이블 시트가 비어 있습니다.");
  }
  const address = used.getAddress();
  const start = (address.split("!").pop() || "A1").split(":")[0].replace(/\$/g, "");

  return JSON.stringify({
    v: 1,
    kind: "PAYTABLE",
    sheet: src.getName(),
    file: workbook.getName(),
    start: start,
    values: used.getValues()
  });
}

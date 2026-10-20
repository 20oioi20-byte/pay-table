/**
 * 급여조견표 연동 스크립트 (Excel [자동화] 탭 > 새 스크립트에 붙여넣어 저장)
 *
 * 보안 걸린 급여테이블 엑셀을 연 상태에서 실행합니다. 보안 해제는 필요 없습니다.
 *  - 첫 실행: '조견표연동' 시트를 만들고 A열을 선택해 둡니다 → Ctrl+C 로 복사 →
 *            조견표 생성기 HTML의 '붙여넣기 칸'에 Ctrl+V
 *  - 한 번 더 실행: '조견표연동' 시트를 지웁니다 (원본 파일에 남기지 않기 위해)
 *
 * 복사 중 따옴표·기호가 깨지지 않도록 시트 내용을 Base64 텍스트로 바꿔 담습니다.
 */
function main(workbook: ExcelScript.Workbook) {
  const OUT = "조견표연동";

  const old = workbook.getWorksheet(OUT);
  if (old) {
    old.delete();
    console.log("정리 완료: '조견표연동' 시트를 지웠습니다.");
    return;
  }

  const sheets = workbook.getWorksheets();
  const src =
    sheets.find(s => s.getName().includes("급여테이블") && s.getName().includes("변경후")) ||
    sheets.find(s => s.getName().includes("급여테이블"));
  if (!src) {
    console.log("'급여테이블(변경후)' 시트를 찾지 못했습니다. 시트 이름을 확인해 주세요.");
    return;
  }

  const used = src.getUsedRange(true);
  if (!used) {
    console.log("급여테이블 시트가 비어 있습니다.");
    return;
  }
  const address = used.getAddress();
  const start = (address.split("!").pop() || "A1").split(":")[0].replace(/\$/g, "");
  const values = used.getValues();

  const payload = JSON.stringify({
    v: 1,
    sheet: src.getName(),
    file: workbook.getName(),
    start: start,
    values: values
  });
  const b64 = toBase64Utf8(payload);

  // 셀 1개에 최대 32,767자 → 30,000자씩 나눠 A열에 한 줄씩 담음
  // 각 줄 앞의 'p'는 Excel이 '+', '/' 로 시작하는 값을 수식으로 오해하지 않게 하는 표시
  const CHUNK = 30000;
  const rows: string[][] = [["PAYTABLE-V1"]];
  for (let i = 0; i < b64.length; i += CHUNK) {
    rows.push(["p" + b64.substring(i, i + CHUNK)]);
  }
  rows.push(["END"]);

  const out = workbook.addWorksheet(OUT);
  const range = out.getRange("A1").getResizedRange(rows.length - 1, 0);
  range.setNumberFormat("@");
  range.setValues(rows);
  out.activate();
  range.select();

  console.log(`완료: 선택된 A1:A${rows.length} 를 Ctrl+C 로 복사해 조견표 생성기에 붙여넣으세요. ` +
    "붙여넣은 뒤 이 스크립트를 한 번 더 실행하면 '조견표연동' 시트가 지워집니다.");
}

function toBase64Utf8(text: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let c = text.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
      const d = text.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
        i++;
      }
    }
    if (c < 0x80) {
      bytes.push(c);
    } else if (c < 0x800) {
      bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    } else if (c < 0x10000) {
      bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    } else {
      bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
  }
  const T = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const has1 = i + 1 < bytes.length;
    const has2 = i + 2 < bytes.length;
    const b1 = has1 ? bytes[i + 1] : 0;
    const b2 = has2 ? bytes[i + 2] : 0;
    parts.push(
      T.charAt(b0 >> 2) +
      T.charAt(((b0 & 3) << 4) | (b1 >> 4)) +
      (has1 ? T.charAt(((b1 & 15) << 2) | (b2 >> 6)) : "=") +
      (has2 ? T.charAt(b2 & 63) : "=")
    );
  }
  return parts.join("");
}

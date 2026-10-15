/**
 * 깡비서 급여조견표 생성 — Office Script (Excel 웹 > 자동화 > 새 스크립트)
 *
 * 원본: pay-table/index.html 의 parsePaytable / buildCapture 로직을 그대로 옮김.
 * 하는 일
 *   ① '급여테이블(변경후)' 시트를 읽어 센터명·직무별 보수·예외 및 특례사항을 파싱
 *   ② 직무마다 '조견표' 시트를 새로 만들어 서식 적용 (1직무 = 1페이지)
 *   ③ (deleteSourceSheets=true) 원본 시트를 지워 PDF 변환 시 조견표만 남김
 *   ④ 결과 요약 JSON 반환 → Power Automate / Copilot 이 사용
 *
 * 원칙: 숫자는 이 스크립트가 엑셀 셀에서 그대로 읽는다. AI 가 금액을 계산·추정하지 않는다.
 *
 * 파라미터 (Power Automate '스크립트 실행' 에서 입력)
 *   deleteSourceSheets : true 면 조견표 시트만 남김 (반드시 '복사본'에서 실행)
 *   selectedJobs       : 만들 직무 표시명을 쉼표로 (빈 값 = 전체). 예: "제휴상담 · 사원,팀장 · 선임"
 *   overtimeOverrides  : 초과근무수당 비고 수동 지정 JSON. 예: {"팀장 · 선임":"팀장7H"}
 */

type Cell = string | number | boolean;

interface PayJob {
  index: number;
  block: string;
  groupLabel: string;
  jobName: string;
  displayName: string;
  items: [string, number | null][];
  grades: [string, number | null][];
  gradeNote: string;
  stdPaySum: number | null;
  overtime: number | null;
  overtimeNote: string;
  night: number | null;
  telecom: number | null;
  monthlyTotal: number | null;
  monthlyTotalNote: string;
}

interface NoteItem {
  type: string; // para | subheading | table
  text: string;
  headers: string[];
  rows: string[][];
}

interface JobSummary {
  index: number;
  sheet: string;
  displayName: string;
  block: string;
  stdPaySum: number | null;
  monthlyTotal: number | null;
  overtimeNote: string;
  overtimeUncertain: boolean;
  overtimeRawNote: string;
}

interface ScriptResult {
  ok: boolean;
  error: string;
  centerName: string;
  sourceSheet: string;
  jobCount: number;
  builtCount: number;
  uncertainCount: number;
  jobs: JobSummary[];
}

const PAY_LABEL_OFFSETS: [string, number][] = [["기본급", 3], ["직책수당", 4], ["직무수당", 5], ["근속수당", 6], ["급식비", 7], ["통근비", 8]];
const GRADE_OFFSETS: number[] = [10, 11, 12, 13, 14, 15];

function main(
  workbook: ExcelScript.Workbook,
  deleteSourceSheets: boolean = false,
  selectedJobs: string = "",
  overtimeOverrides: string = ""
): ScriptResult {
  const result: ScriptResult = { ok: false, error: "", centerName: "", sourceSheet: "", jobCount: 0, builtCount: 0, uncertainCount: 0, jobs: [] };

  const sheets = workbook.getWorksheets();
  let src = sheets.find(s => s.getName().includes("급여테이블") && s.getName().includes("변경후"));
  if (!src) src = sheets.find(s => s.getName().includes("급여테이블"));
  if (!src) { result.error = "'급여테이블(변경후)' 시트를 찾을 수 없습니다."; return result; }
  result.sourceSheet = src.getName();

  const used = src.getUsedRange(true);
  if (!used) { result.error = "시트가 비어 있습니다."; return result; }
  const rowCount = used.getRowIndex() + used.getRowCount();
  const colCount = Math.max(used.getColumnIndex() + used.getColumnCount(), 40);
  const grid: Cell[][] = src.getRangeByIndexes(0, 0, rowCount, colCount).getValues() as Cell[][];

  const parsed = parsePaytable(grid);
  result.centerName = parsed.centerName;
  result.jobCount = parsed.jobs.length;
  if (!parsed.jobs.length) { result.error = "직무 열을 찾지 못했습니다. '보수테이블' / '리딩그룹' 제목 행을 확인하세요."; return result; }

  let overrides: Record<string, string> = {};
  if (overtimeOverrides && overtimeOverrides.trim()) {
    try { overrides = JSON.parse(overtimeOverrides) as Record<string, string>; }
    catch (e) { result.error = "overtimeOverrides JSON 형식 오류"; return result; }
  }
  const pick = selectedJobs.split(",").map(s => normJobKey(s)).filter(s => s.length > 0);

  const usedNames: string[] = sheets.map(s => s.getName());
  parsed.jobs.forEach(job => {
    if (pick.length && pick.indexOf(normJobKey(job.displayName)) < 0) return;
    const hasOverride = Object.prototype.hasOwnProperty.call(overrides, job.displayName);
    const auto = computeOvertimeNoteAuto(job);
    const note = hasOverride ? overrides[job.displayName] : auto.text;
    const uncertain = !hasOverride && !auto.confident && !(job.overtime === null || job.overtime === 0);

    const sheetName = uniqueSheetName(`${String(job.index + 1).padStart(2, "0")}_${job.displayName}`, usedNames);
    usedNames.push(sheetName);
    const ws = workbook.addWorksheet(sheetName);
    buildCardSheet(ws, parsed.centerName, job, note, parsed.notes);

    result.jobs.push({
      index: job.index, sheet: sheetName, displayName: job.displayName, block: job.block,
      stdPaySum: job.stdPaySum, monthlyTotal: job.monthlyTotal,
      overtimeNote: note, overtimeUncertain: uncertain, overtimeRawNote: job.overtimeNote
    });
    if (uncertain) result.uncertainCount++;
  });
  result.builtCount = result.jobs.length;
  if (!result.builtCount) { result.error = "selectedJobs 와 일치하는 직무가 없습니다."; return result; }

  if (deleteSourceSheets) {
    const keep = result.jobs.map(j => j.sheet);
    workbook.getWorksheets().forEach(s => { if (keep.indexOf(s.getName()) < 0) s.delete(); });
  }
  result.ok = true;
  return result;
}

/* ───────────── 셀 접근 (1-based 행, 1-based 열) ───────────── */
function raw(g: Cell[][], r: number, c: number): Cell | undefined {
  if (r < 1 || c < 1 || r > g.length) return undefined;
  const row = g[r - 1];
  return c > row.length ? undefined : row[c - 1];
}
function num(g: Cell[][], r: number, c: number): number | null {
  const v = raw(g, r, c);
  return typeof v === "number" ? v : null;
}
function txt(g: Cell[][], r: number, c: number): string {
  const v = raw(g, r, c);
  if (v === undefined || v === null || v === "") return "";
  return String(v).replace(/\s+/g, " ").trim();
}
function findRow(g: Cell[][], contains: string): number | null {
  for (let r = 1; r <= g.length; r++) {
    const v = txt(g, r, 1);
    if (v && v.includes(contains)) return r;
  }
  return null;
}
function nearestLeft(g: Cell[][], row: number, col: number): string {
  for (let c = col; c >= 4; c--) { const v = txt(g, row, c); if (v) return v; }
  return "";
}

/* ───────────── 파싱 (index.html 과 동일 규칙) ───────────── */
function formatJobDisplay(group: string, job: string): string {
  const g = (group || "").trim(), n = (job || "").trim();
  if (!g) return n;
  if (!n || g === n) return g;
  return `${g} · ${n}`;
}

function parseBlock(g: Cell[][], titleRow: number, blockLabel: string, startIndex: number): PayJob[] {
  const jobs: PayJob[] = [];
  const groupRow = titleRow + 1, jobRow = titleRow + 2;
  const COL_S = 19;
  let lastGroup = "";
  for (let c = 4; c < 40; c++) {
    const rawGroup = txt(g, groupRow, c);
    if (rawGroup && !/비고/.test(rawGroup)) lastGroup = rawGroup;
    const jobName = txt(g, jobRow, c);
    if (!jobName || /비고/.test(jobName)) continue;
    const groupLabel = lastGroup || nearestLeft(g, groupRow, c);
    if (groupLabel && /비고/.test(groupLabel)) continue;

    const items: [string, number | null][] = PAY_LABEL_OFFSETS.map(([label, off]) =>
      [txt(g, titleRow + off, 1) || label, num(g, titleRow + off, c)] as [string, number | null]);
    const grades: [string, number | null][] = GRADE_OFFSETS.map(off =>
      [txt(g, titleRow + off, 3).replace(/\.$/, "") || "-", num(g, titleRow + off, c)] as [string, number | null]);

    jobs.push({
      index: startIndex + jobs.length, block: blockLabel, groupLabel, jobName,
      displayName: formatJobDisplay(groupLabel, jobName),
      items, grades,
      gradeNote: txt(g, titleRow + 10, COL_S),
      stdPaySum: num(g, titleRow + 9, c),
      overtime: num(g, titleRow + 16, c),
      overtimeNote: txt(g, titleRow + 16, COL_S),
      night: num(g, titleRow + 17, c),
      telecom: num(g, titleRow + 18, c),
      monthlyTotal: num(g, titleRow + 19, c),
      monthlyTotalNote: txt(g, titleRow + 19, COL_S)
    });
  }
  return jobs;
}

function extractCenterName(g: Cell[][]): string {
  for (let r = 1; r <= Math.min(g.length, 40); r++) {
    if (/직무\s*Group\s*명|직무Group명|센터명/.test(txt(g, r, 1))) {
      const d = txt(g, r, 4) || txt(g, r, 2) || txt(g, r, 3);
      if (d) return d;
    }
  }
  return txt(g, 12, 4) || txt(g, 1, 1) || "센터";
}

function parseExceptions(g: Cell[][]): NoteItem[] {
  const r0 = findRow(g, "예외 및 특례사항");
  if (r0 === null) return [];
  const items: NoteItem[] = [];
  let curTable: NoteItem | null = null;
  let curIdx: number[] = [];
  let curPara: string | null = null;
  const flushPara = () => { if (curPara !== null) { items.push({ type: "para", text: curPara.trim(), headers: [], rows: [] }); curPara = null; } };
  const flushTable = () => { if (curTable) { items.push(curTable); curTable = null; } };

  let r = r0 + 1, guard = 0, emptyStreak = 0;
  while (r <= g.length && guard < 400) {
    guard++;
    const cells: string[] = [];
    for (let c = 1; c <= 10; c++) cells.push(txt(g, r, c));
    const a = cells[0], b = cells[1];
    const any = cells.some(x => x.length > 0);

    if (/^\d+[.．]/.test(a)) {
      if (parseInt(a, 10) >= 10) break;
      flushTable(); flushPara(); curPara = a; emptyStreak = 0; r++; continue;
    }
    if (/^[○ㅇ]\s*\S/.test(a)) {
      flushTable(); flushPara(); items.push({ type: "subheading", text: a, headers: [], rows: [] }); emptyStreak = 0; r++; continue;
    }
    let headers: string[] = [], idxs: number[] = [];
    if (a === "구분" && /주요\s*내용/.test(b)) { headers = ["구분", "주요내용"]; idxs = [0, 1]; }
    else if (/^직무$/.test(a) && /호봉/.test(b)) { cells.forEach((v, i) => { if (v) { idxs.push(i); headers.push(v); } }); }
    if (headers.length >= 2) {
      flushPara(); curTable = { type: "table", text: "", headers, rows: [] }; curIdx = idxs; emptyStreak = 0; r++; continue;
    }
    if (curTable) {
      if (!any) { emptyStreak++; if (emptyStreak >= 3) flushTable(); r++; continue; }
      emptyStreak = 0;
      if (/^[ⅣⅤⅥⅦⅧⅨⅩ\d]/.test(a) && /절|사항|기준|테이블/.test(a)) { flushTable(); flushPara(); break; }
      const row = curIdx.map(i => cells[i] || "");
      if (row.every(x => !x)) { r++; continue; }
      curTable.rows.push(row); r++; continue;
    }
    if (any) { emptyStreak = 0; curPara = (curPara !== null ? curPara + "\n" : "") + (a || b); }
    else { emptyStreak++; if (emptyStreak >= 5 && items.length) break; }
    r++;
  }
  flushTable(); flushPara();
  return items;
}

function parsePaytable(g: Cell[][]): { centerName: string; jobs: PayJob[]; notes: NoteItem[] } {
  const centerName = extractCenterName(g);
  const rMain = findRow(g, "보수테이블");
  const rLead = findRow(g, "리딩그룹") || findRow(g, "리더그룹");
  let jobs: PayJob[] = [];
  if (rMain !== null) jobs = jobs.concat(parseBlock(g, rMain, "일반", 0));
  if (rLead !== null) jobs = jobs.concat(parseBlock(g, rLead, "리더그룹", jobs.length));
  return { centerName, jobs, notes: parseExceptions(g) };
}

/* ───────────── 초과근무 비고 자동 매칭 ───────────── */
function computeOvertimeNoteAuto(job: PayJob): { text: string; confident: boolean } {
  if (job.overtime === null || job.overtime === 0) return { text: "", confident: true };
  const full = job.overtimeNote || "";
  if (!full) return { text: "", confident: false };
  const name = `${job.groupLabel} ${job.jobName} ${job.displayName}`.replace(/\s+/g, "");
  const segs: { role: string; text: string }[] = [];
  const re = /([가-힣A-Za-z]+)\s*(\d+)\s*[Hh]/g;
  let m = re.exec(full);
  while (m !== null) { segs.push({ role: m[1], text: `${m[1]}${m[2]}H` }); m = re.exec(full); }
  segs.sort((x, y) => y.role.length - x.role.length);
  if (!segs.length) return { text: full, confident: false };
  const hit = segs.find(s => name.includes(s.role));
  if (hit) return { text: hit.text, confident: true };
  if (segs.length > 1) return { text: "", confident: false };
  return { text: segs[0].text, confident: false };
}

/* ───────────── 9.근무형태: 현재 직무 행만 ───────────── */
function normJobKey(s: string): string {
  return String(s || "").toLowerCase().replace(/\s+/g, "").replace(/[()\[\]·.,]/g, "").replace(/사$/, "");
}
function jobTextSimilarity(a: string, b: string): number {
  const na = normJobKey(a), nb = normJobKey(b);
  if (!na || !nb) return 0;
  if (na === nb) return 100;
  if (na.includes(nb) || nb.includes(na)) return 75;
  const numA = na.match(/(\d+)/g) || [];
  const baseA = na.replace(/\d+/g, "").replace(/~/g, "");
  const baseB = nb.replace(/\d+/g, "").replace(/~/g, "");
  if (baseA && baseA === baseB) return numA.some(n => nb.includes(n)) ? 85 : 55;
  let best = 0;
  for (let i = 0; i < na.length; i++) for (let j = i + 2; j <= na.length; j++) if (nb.includes(na.slice(i, j))) best = Math.max(best, j - i);
  return Math.round((2 * best) / (na.length + nb.length) * 60);
}
function filterWorkTypeRows(job: PayJob, headers: string[], rows: string[][]): string[][] {
  if (!rows.length) return rows;
  let ji = headers.findIndex(x => /직무/.test(x)); if (ji < 0) ji = 0;
  let hi = headers.findIndex(x => /호봉/.test(x)); if (hi < 0) hi = Math.min(1, rows[0].length - 1);
  const jobName = job.jobName, group = job.groupLabel, display = job.displayName;
  const jn = jobName + group + display;
  const scored = rows.map((cells, idx) => {
    const jikmu = cells[ji] || "", hobong = cells[hi] || "", field = `${jikmu} ${hobong}`;
    let s = 0;
    if (jobName && (normJobKey(jikmu) === normJobKey(jobName) || normJobKey(hobong) === normJobKey(jobName))) s += 120;
    if (group && (normJobKey(jikmu) === normJobKey(group) || normJobKey(hobong) === normJobKey(group))) s += 90;
    s += jobTextSimilarity(jobName, jikmu) + jobTextSimilarity(jobName, hobong);
    s += Math.round(jobTextSimilarity(group, jikmu) * 0.7) + Math.round(jobTextSimilarity(group, hobong) * 0.5);
    s += Math.round(jobTextSimilarity(display, field) * 0.4);
    if (/센터장/.test(jn) && /센터장/.test(field)) s += 100;
    if (/총괄매니저|총괄/.test(jn) && /총괄|매니저/.test(field)) s += 95;
    if (/선임팀장/.test(jn) && /선임팀장|팀장/.test(field)) s += 90;
    else if (/팀장/.test(jn) && /팀장/.test(field) && !/선임팀장/.test(field)) s += 90;
    if (/강사|교육|QA|큐에이/.test(jn) && /강사|교육|QA|큐에이/.test(field)) s += 90;
    if (/실장/.test(jn) && /실장|관리자|스탭|스텝|센터장/.test(field)) s += 70;
    if (/상담/.test(jn) && /상담/.test(field)) s += 40;
    const cm = jobName.match(/상담\s*([0-9]+)/);
    if (cm && hobong && hobong.replace(/\s/g, "").includes(cm[1])) s += 50;
    if (cm && /상담\s*1\s*[~～\-]\s*3|상담1~3|상담1-3/.test(hobong.replace(/\s/g, ""))) s += 45;
    if (/단축/.test(jn) && /단축|상담/.test(field)) s += 40;
    if (job.block === "리더그룹" && /관리자|스탭|스텝|센터장|팀장|실장|강사|매니저/.test(field)) s += 15;
    if (job.block !== "리더그룹" && /상담/.test(field) && !/센터장|팀장/.test(field)) s += 10;
    return { cells, s, idx };
  });
  scored.sort((x, y) => y.s - x.s || x.idx - y.idx);
  const top = scored[0].s;
  if (top < 25) return [scored[0].cells];
  return scored.filter(x => x.s === top).map(x => x.cells);
}

function formatNotesRichText(s: string): string {
  return s.replace(/(적용)\s*,\s*(80%\s*이상)/g, "$1,\n$2");
}

/* ───────────── 조견표 시트 그리기 ───────────── */
function uniqueSheetName(base: string, used: string[]): string {
  let name = base.replace(/[\[\]:*?\/\\]/g, "").slice(0, 31);
  let n = 2;
  while (used.indexOf(name) >= 0) { const suf = `_${n++}`; name = name.slice(0, 31 - suf.length) + suf; }
  return name;
}

function hasPayValue(v: number | null): boolean {
  return v !== null && v !== 0 && !isNaN(v);
}

function buildCardSheet(ws: ExcelScript.Worksheet, centerName: string, job: PayJob, overtimeNote: string, notes: NoteItem[]) {
  const HEAD_FILL = "#DDEBF7", HL_FILL = "#FFF2CC", FONT = "맑은 고딕";
  ws.getRange("A:A").getFormat().setColumnWidth(70);   // 구분(업적수당 라벨)
  ws.getRange("B:B").getFormat().setColumnWidth(110);  // 항목
  ws.getRange("C:C").getFormat().setColumnWidth(110);  // 금액
  ws.getRange("D:D").getFormat().setColumnWidth(260);  // 비고
  for (let c = 4; c < 10; c++) ws.getRangeByIndexes(0, c, 1, 1).getFormat().setColumnWidth(90);

  let r = 0; // 0-based
  const put = (row: number, col: number, v: Cell) => ws.getRangeByIndexes(row, col, 1, 1).setValue(v);

  put(r, 0, `[${centerName} - 보수테이블]`);
  ws.getRangeByIndexes(r, 0, 1, 4).getFormat().getFont().setBold(true);
  ws.getRangeByIndexes(r, 0, 1, 4).getFormat().getFont().setSize(16);
  r++;
  put(r, 0, job.block === "리더그룹" ? "○ 리더그룹" : "○ 상담그룹");
  ws.getRangeByIndexes(r, 0, 1, 4).getFormat().getFont().setBold(true);
  r += 2;

  const tableTop = r;
  ws.getRangeByIndexes(r, 0, 1, 2).merge(false);
  put(r, 0, "구분");
  put(r, 2, job.groupLabel && job.jobName && job.groupLabel !== job.jobName ? `${job.groupLabel}\n${job.jobName}` : (job.jobName || job.groupLabel));
  put(r, 3, "비고");
  const head = ws.getRangeByIndexes(r, 0, 1, 4);
  head.getFormat().getFill().setColor(HEAD_FILL);
  head.getFormat().getFont().setBold(true);
  head.getFormat().setHorizontalAlignment(ExcelScript.HorizontalAlignment.center);
  head.getFormat().setWrapText(true);
  r++;

  const line = (label: string, value: number | null, note: string, hl: boolean) => {
    if (!hl && !hasPayValue(value)) return;
    ws.getRangeByIndexes(r, 0, 1, 2).merge(false);
    put(r, 0, label);
    put(r, 2, value === null ? "" : Math.round(value));
    put(r, 3, note || "");
    if (hl) {
      ws.getRangeByIndexes(r, 0, 1, 4).getFormat().getFill().setColor(HL_FILL);
      ws.getRangeByIndexes(r, 0, 1, 4).getFormat().getFont().setBold(true);
    }
    r++;
  };

  job.items.forEach(([lbl, val]) => line(lbl, val, "", false));
  line("통상임금소계", job.stdPaySum, "", true);

  // 업적수당 S~E: 항상 전부 표시, 빈 값은 0
  const gTop = r;
  job.grades.forEach(([gname, val]) => { put(r, 1, gname); put(r, 2, val === null ? 0 : Math.round(val)); r++; });
  if (job.grades.length) {
    ws.getRangeByIndexes(gTop, 0, job.grades.length, 1).merge(false);
    put(gTop, 0, "업적수당");
    ws.getRangeByIndexes(gTop, 0, 1, 1).getFormat().setVerticalAlignment(ExcelScript.VerticalAlignment.center);
    ws.getRangeByIndexes(gTop, 3, job.grades.length, 1).merge(false);
    put(gTop, 3, job.gradeNote || "");
  }

  line("초과근무수당", job.overtime, overtimeNote, false);
  line("야간근로수당", job.night, "", false);
  line("통신비", job.telecom, "", false);
  line("월 보수 합계", job.monthlyTotal, job.monthlyTotalNote, true);

  const body = ws.getRangeByIndexes(tableTop, 0, r - tableTop, 4);
  styleGrid(body, FONT);
  ws.getRangeByIndexes(tableTop + 1, 2, r - tableTop - 1, 1).setNumberFormatLocal("#,##0");
  ws.getRangeByIndexes(tableTop + 1, 2, r - tableTop - 1, 1).getFormat().setHorizontalAlignment(ExcelScript.HorizontalAlignment.right);

  // 예외 및 특례사항
  r++;
  put(r, 0, "예외 및 특례사항");
  ws.getRangeByIndexes(r, 0, 1, 1).getFormat().getFont().setBold(true);
  r++;
  let lastPara = "";
  notes.forEach(item => {
    if (item.type === "para" || item.type === "subheading") {
      ws.getRangeByIndexes(r, 0, 1, 4).merge(false);
      put(r, 0, item.type === "para" ? formatNotesRichText(item.text) : item.text);
      const rg = ws.getRangeByIndexes(r, 0, 1, 4);
      rg.getFormat().setWrapText(true);
      rg.getFormat().setVerticalAlignment(ExcelScript.VerticalAlignment.top);
      if (item.type === "subheading") rg.getFormat().getFont().setBold(true);
      const lines = item.text.split("\n").length;
      rg.getFormat().setRowHeight(Math.max(18, 16 * lines));
      if (item.type === "para") lastPara = item.text;
      r++;
      return;
    }
    // 표
    const headers = item.headers.length ? item.headers : ["구분", "주요내용"];
    const isWorkType = (/직무/.test(headers.join(" ")) && /호봉/.test(headers.join(" "))) || /근무형태/.test(lastPara);
    const isAnnual = /연차\s*평균\s*사용률/.test(lastPara);
    let rows = item.rows;
    if (isWorkType) rows = filterWorkTypeRows(job, headers, rows);
    const top = r;
    if (headers.length === 2) {
      // 2열 표: 구분(A:B 병합) / 주요내용(C:D 병합)
      const writeRow = (cells: string[]) => {
        ws.getRangeByIndexes(r, 0, 1, 2).merge(false);
        ws.getRangeByIndexes(r, 2, 1, 2).merge(false);
        put(r, 0, cells[0] || "");
        let v = cells[1] || "";
        if (isAnnual && v.trim() === "1") v = "100%";
        put(r, 2, formatNotesRichText(v));
        r++;
      };
      writeRow(headers);
      rows.forEach(writeRow);
      styleGrid(ws.getRangeByIndexes(top, 0, r - top, 4), FONT);
      ws.getRangeByIndexes(top, 0, 1, 4).getFormat().getFill().setColor(HEAD_FILL);
    } else {
      headers.forEach((h, i) => put(r, i, h));
      r++;
      rows.forEach(cells => { headers.forEach((h, i) => put(r, i, cells[i] || "")); r++; });
      styleGrid(ws.getRangeByIndexes(top, 0, r - top, headers.length), FONT);
      ws.getRangeByIndexes(top, 0, 1, headers.length).getFormat().getFill().setColor(HEAD_FILL);
    }
    ws.getRangeByIndexes(top, 0, 1, Math.max(4, headers.length)).getFormat().getFont().setBold(true);
    r++;
  });

  ws.getRangeByIndexes(0, 0, r, 10).getFormat().getFont().setName(FONT);
  // 인쇄: 1직무 = 1페이지
  const pl = ws.getPageLayout();
  pl.setOrientation(ExcelScript.PageOrientation.portrait);
  pl.setZoom({ horizontalFitToPages: 1, verticalFitToPages: 1 });
  pl.setCenterHorizontally(true);
  ws.setShowGridlines(false);
}

function styleGrid(rg: ExcelScript.Range, font: string) {
  const f = rg.getFormat();
  f.setWrapText(true);
  f.setVerticalAlignment(ExcelScript.VerticalAlignment.center);
  f.getFont().setName(font);
  f.getFont().setSize(10);
  [ExcelScript.BorderIndex.edgeTop, ExcelScript.BorderIndex.edgeBottom, ExcelScript.BorderIndex.edgeLeft,
  ExcelScript.BorderIndex.edgeRight, ExcelScript.BorderIndex.insideHorizontal, ExcelScript.BorderIndex.insideVertical]
    .forEach(b => {
      const br = f.getRangeBorder(b);
      br.setStyle(ExcelScript.BorderLineStyle.continuous);
      br.setColor("#808080");
    });
}

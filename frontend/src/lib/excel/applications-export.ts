import ExcelJS from 'exceljs';

const FONT_NAME = 'Arial';
const COLOR_HEADER_SELECTED = 'FF1F7A4F'; // emerald
const COLOR_HEADER_REJECTED = 'FFA12B3F'; // rose
const COLOR_HEADER_INFO = 'FFF2F2F2';
const COLOR_WHITE = 'FFFFFFFF';
const COLOR_BLACK = 'FF000000';

const CATEGORY_LABEL: Record<string, string> = {
  '①': '중앙부처',
  '②': '광역지자체',
  '③': '기초지자체',
  '④': '공공기관',
  '⑤': '교육행정기관',
  '⑥': '기타'
};

const STAGE_LABEL: Record<string, string> = {
  docs: '서류',
  interview: '면접',
  final: '최종'
};

export type ExportApplication = {
  id: string;
  name: string;
  organization: string | null;
  department: string | null;
  jobRole: string | null;
  c2Choice: string | null;
  knowledgeScore: number | null;
  knowledgeCorrect: number | null;
  knowledgeTotal: number | null;
  multiSelectedCount: number | null;
  multiChoicesMax: number;
  planCharCount: number | null;
  prereqDoneCount: number;
  prereqMax: number;
  finalScore: number | null;
  decidedAt: string | null;
  rejectedStage: string | null;
};

type ColumnDef = {
  key:
    | keyof ExportApplication
    | 'no'
    | 'category'
    | 'knowledge'
    | 'multiCheck'
    | 'prereq'
    | 'rejectedStageLabel';
  header: string;
  width: number;
};

const COMMON_COLUMNS: ColumnDef[] = [
  { key: 'no', header: '번호', width: 6 },
  { key: 'name', header: '이름', width: 12 },
  { key: 'category', header: '분류', width: 14 },
  { key: 'organization', header: '소속기관', width: 24 },
  { key: 'department', header: '부서', width: 16 },
  { key: 'jobRole', header: '직책', width: 14 },
  { key: 'prereq', header: '사전학습', width: 10 },
  { key: 'knowledge', header: '지식평가', width: 14 },
  { key: 'multiCheck', header: '업무활용성', width: 12 },
  { key: 'planCharCount', header: '활용계획(자)', width: 14 },
  { key: 'finalScore', header: '종합점수', width: 12 }
];

const SELECTED_COLUMNS: ColumnDef[] = [
  ...COMMON_COLUMNS,
  { key: 'decidedAt', header: '선발일', width: 14 }
];

const REJECTED_COLUMNS: ColumnDef[] = [
  ...COMMON_COLUMNS,
  { key: 'rejectedStageLabel', header: '탈락단계', width: 12 }
];

// 분류별 분포 — 4그룹으로 묶어서 표시
const DISTRIBUTION_GROUPS: { label: string; choices: string[] }[] = [
  { label: '중앙부처', choices: ['①'] },
  { label: '지자체', choices: ['②', '③'] },
  { label: '공공·교육', choices: ['④', '⑤'] },
  { label: '기타', choices: ['⑥'] }
];

export async function buildApplicationsWorkbook({
  cohortName,
  selected,
  rejected
}: {
  cohortName: string;
  selected: ExportApplication[];
  rejected: ExportApplication[];
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  buildSheet(wb, '합격자', cohortName, selected, SELECTED_COLUMNS, COLOR_HEADER_SELECTED);
  buildSheet(wb, '불합격자', cohortName, rejected, REJECTED_COLUMNS, COLOR_HEADER_REJECTED);
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

function buildSheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  cohortName: string,
  rows: ExportApplication[],
  cols: ColumnDef[],
  titleColor: string
) {
  const ws = wb.addWorksheet(sheetName);

  // 컬럼 너비 (A 여백 + 1열 시작)
  ws.getColumn(1).width = 3;
  for (let i = 0; i < cols.length; i++) {
    ws.getColumn(2 + i).width = cols[i].width;
  }

  // 제목 (B2:lastCol3) — 2~3행 머지
  const lastCol = 1 + cols.length;
  const titleRange = `${cellRef(2, 2)}:${cellRef(lastCol, 3)}`;
  ws.mergeCells(titleRange);
  const titleCell = ws.getCell(2, 2);
  titleCell.value = `「${cohortName}」 ${sheetName} 명단`;
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: titleColor }
  };
  titleCell.font = {
    name: FONT_NAME,
    size: 18,
    bold: true,
    color: { argb: COLOR_WHITE }
  };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  applyBorder(titleCell, 'medium');

  // 메타 (4행) — 총 인원, 출력일
  const metaRange = `${cellRef(2, 4)}:${cellRef(lastCol, 4)}`;
  ws.mergeCells(metaRange);
  const metaCell = ws.getCell(2, 4);
  const today = new Date().toISOString().slice(0, 10);
  metaCell.value = `총 ${rows.length}명 · 출력일 ${today}`;
  metaCell.font = {
    name: FONT_NAME,
    size: 10,
    color: { argb: '666666' }
  };
  metaCell.alignment = { horizontal: 'right', vertical: 'middle' };

  // 분류 분포 (5행)
  const distRange = `${cellRef(2, 5)}:${cellRef(lastCol, 5)}`;
  ws.mergeCells(distRange);
  const distCell = ws.getCell(2, 5);
  distCell.value = buildDistributionText(rows);
  distCell.font = {
    name: FONT_NAME,
    size: 10,
    bold: true,
    color: { argb: '333333' }
  };
  distCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  distCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFAFAFA' }
  };
  applyBorder(distCell, 'thin');
  ws.getRow(5).height = 22;

  // 컬럼 헤더 (6행)
  const headerRow = 6;
  for (let i = 0; i < cols.length; i++) {
    const cell = ws.getCell(headerRow, 2 + i);
    cell.value = cols[i].header;
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLOR_HEADER_INFO }
    };
    cell.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: COLOR_BLACK } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    applyBorder(cell, 'thin');
  }
  widenLeft(ws.getCell(headerRow, 2));
  widenRight(ws.getCell(headerRow, lastCol));
  ws.getCell(headerRow, 2).border = {
    ...ws.getCell(headerRow, 2).border,
    top: { style: 'medium' },
    bottom: { style: 'medium' }
  };

  // 데이터 행
  if (rows.length === 0) {
    const emptyRange = `${cellRef(2, headerRow + 1)}:${cellRef(lastCol, headerRow + 1)}`;
    ws.mergeCells(emptyRange);
    const emptyCell = ws.getCell(headerRow + 1, 2);
    emptyCell.value = '대상자가 없습니다';
    emptyCell.font = {
      name: FONT_NAME,
      size: 11,
      color: { argb: '999999' },
      italic: true
    };
    emptyCell.alignment = { horizontal: 'center', vertical: 'middle' };
    applyBorder(emptyCell, 'thin');
    return;
  }

  for (let idx = 0; idx < rows.length; idx++) {
    const r = rows[idx];
    const rowNum = headerRow + 1 + idx;
    for (let ci = 0; ci < cols.length; ci++) {
      const col = cols[ci];
      const cell = ws.getCell(rowNum, 2 + ci);
      cell.value = renderValue(col, r, idx + 1);
      cell.font = { name: FONT_NAME, size: 11, color: { argb: COLOR_BLACK } };
      cell.alignment = {
        horizontal: alignFor(col.key),
        vertical: 'middle'
      };
      applyBorder(cell, 'thin');
    }
    widenLeft(ws.getCell(rowNum, 2));
    widenRight(ws.getCell(rowNum, lastCol));
  }

  // 마지막 행 아래쪽 border 강조
  const lastRow = headerRow + rows.length;
  for (let ci = 0; ci < cols.length; ci++) {
    const cell = ws.getCell(lastRow, 2 + ci);
    cell.border = { ...cell.border, bottom: { style: 'medium' } };
  }

  // 컬럼 헤더에 AutoFilter (드롭다운으로 필터·정렬 가능)
  ws.autoFilter = {
    from: { row: headerRow, column: 2 },
    to: { row: lastRow, column: lastCol }
  };
}

function renderValue(col: ColumnDef, r: ExportApplication, no: number): string | number | null {
  switch (col.key) {
    case 'no':
      return no;
    case 'name':
      return r.name;
    case 'category':
      return r.c2Choice ? (CATEGORY_LABEL[r.c2Choice] ?? '—') : '—';
    case 'organization':
      return r.organization ?? '—';
    case 'department':
      return r.department ?? '—';
    case 'jobRole':
      return r.jobRole ?? '—';
    case 'knowledge':
      if (r.knowledgeScore === null) return '—';
      if (r.knowledgeCorrect !== null && r.knowledgeTotal !== null) {
        return `${r.knowledgeScore} (${r.knowledgeCorrect}/${r.knowledgeTotal})`;
      }
      return r.knowledgeScore;
    case 'multiCheck':
      if (r.multiSelectedCount === null) return '—';
      return r.multiChoicesMax > 0
        ? `${r.multiSelectedCount}/${r.multiChoicesMax}`
        : `${r.multiSelectedCount}`;
    case 'prereq':
      if (r.prereqMax === 0) return '—';
      return `${r.prereqDoneCount}/${r.prereqMax}`;
    case 'planCharCount':
      return r.planCharCount ?? '—';
    case 'finalScore':
      return r.finalScore !== null ? Math.round(r.finalScore * 10) / 10 : '—';
    case 'decidedAt':
      return r.decidedAt ?? '—';
    case 'rejectedStageLabel':
      return r.rejectedStage ? (STAGE_LABEL[r.rejectedStage] ?? r.rejectedStage) : '—';
    default:
      return '—';
  }
}

function alignFor(key: ColumnDef['key']): 'left' | 'center' | 'right' {
  if (
    key === 'no' ||
    key === 'planCharCount' ||
    key === 'finalScore' ||
    key === 'multiCheck' ||
    key === 'prereq'
  ) {
    return 'right';
  }
  if (key === 'organization' || key === 'department' || key === 'jobRole') return 'left';
  return 'center';
}

function buildDistributionText(rows: ExportApplication[]): string {
  const total = rows.length;
  if (total === 0) return '분류 분포: —';
  const parts: string[] = [];
  for (const group of DISTRIBUTION_GROUPS) {
    const count = rows.filter((r) => r.c2Choice && group.choices.includes(r.c2Choice)).length;
    if (count === 0) continue;
    const pct = Math.round((count / total) * 1000) / 10;
    parts.push(`${group.label} ${count}명 (${pct}%)`);
  }
  return parts.length > 0 ? `분류 분포 · ${parts.join('   ·   ')}` : '분류 분포: —';
}

function applyBorder(cell: ExcelJS.Cell, style: 'thin' | 'medium') {
  cell.border = {
    top: { style },
    bottom: { style },
    left: { style },
    right: { style }
  };
}

function widenLeft(cell: ExcelJS.Cell) {
  cell.border = { ...cell.border, left: { style: 'medium' } };
}

function widenRight(cell: ExcelJS.Cell) {
  cell.border = { ...cell.border, right: { style: 'medium' } };
}

function cellRef(col: number, row: number): string {
  let c = '';
  let n = col;
  while (n > 0) {
    n--;
    c = String.fromCharCode(65 + (n % 26)) + c;
    n = Math.floor(n / 26);
  }
  return `${c}${row}`;
}

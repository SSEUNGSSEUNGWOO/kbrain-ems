import ExcelJS from 'exceljs';

const FONT_NAME = 'Arial';
const COLOR_PRIMARY = 'FF4A86E8';
const COLOR_HEADER_DATA = 'FFFCFCFC';
const COLOR_WHITE = 'FFFFFFFF';
const COLOR_BLACK = 'FF000000';

export type ExportCompletionRow = {
  name: string;
  organizationName: string | null;
  phone: string | null;
  completed: boolean;
};

type BuildArgs = {
  cohortName: string;
  totalSessions: number;
  minAttendance: number;
  rows: ExportCompletionRow[];
  hidePersonal: boolean;
};

function styleHeader(cell: ExcelJS.Cell, opts: { primary?: boolean }) {
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: opts.primary ? COLOR_PRIMARY : COLOR_HEADER_DATA }
  };
  cell.font = {
    name: FONT_NAME,
    size: 11,
    bold: true,
    color: { argb: opts.primary ? COLOR_WHITE : COLOR_BLACK }
  };
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  cell.border = {
    top: { style: 'medium' },
    bottom: { style: 'double' },
    left: { style: 'thin' },
    right: { style: 'thin' }
  };
}

function styleData(cell: ExcelJS.Cell) {
  cell.font = { name: FONT_NAME, size: 10, color: { argb: COLOR_BLACK } };
  cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
  cell.border = {
    top: { style: 'thin' },
    bottom: { style: 'thin' },
    left: { style: 'thin' },
    right: { style: 'thin' }
  };
}

export async function buildCompletionWorkbook({
  cohortName,
  totalSessions,
  minAttendance,
  rows,
  hidePersonal
}: BuildArgs): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'kbrain-ems';
  wb.created = new Date();

  const ws = wb.addWorksheet(`${cohortName} 수료자`);
  const colCount = hidePersonal ? 3 : 4;

  const titleRow = ws.addRow([
    `${cohortName} 수료자 명단 (출석 ${minAttendance}회 이상 / 총 ${totalSessions}회차)`
  ]);
  ws.mergeCells(titleRow.number, 1, titleRow.number, colCount);
  const titleCell = ws.getCell(titleRow.number, 1);
  titleCell.font = { name: FONT_NAME, size: 13, bold: true };
  titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
  titleRow.height = 24;

  ws.addRow([]);

  const headers = hidePersonal
    ? ['이름', '소속기관', '수료여부']
    : ['이름', '소속기관', '연락처', '수료여부'];
  const headerRow = ws.addRow(headers);
  headerRow.height = 28;
  headerRow.eachCell((cell, colNumber) => {
    styleHeader(cell, { primary: colNumber === 1 });
  });

  const colWidths = hidePersonal ? [14, 26, 12] : [14, 26, 16, 12];
  for (let i = 0; i < colWidths.length; i++) {
    ws.getColumn(i + 1).width = colWidths[i];
  }

  const sorted = rows.toSorted((a, b) => {
    if (a.completed !== b.completed) return a.completed ? -1 : 1;
    return a.name.localeCompare(b.name, 'ko');
  });

  sorted.forEach((r) => {
    const vals = hidePersonal
      ? [r.name, r.organizationName ?? '', r.completed ? '수료' : '미수료']
      : [
          r.name,
          r.organizationName ?? '',
          r.phone ?? '',
          r.completed ? '수료' : '미수료'
        ];
    const row = ws.addRow(vals);
    row.eachCell((cell, colNumber) => {
      styleData(cell);
      if (colNumber === colCount) cell.alignment = { ...cell.alignment, horizontal: 'center' };
    });
  });

  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 3 }];

  return wb.xlsx.writeBuffer();
}

import ExcelJS from 'exceljs';

const FONT_NAME = 'Arial';
const COLOR_PRIMARY = 'FF4A86E8';
const COLOR_HEADER = 'FFF2F2F2';
const COLOR_WHITE = 'FFFFFFFF';
const COLOR_BLACK = 'FF000000';

export type NoticeRosterRow = {
  name: string;
  categoryLabel: string;
  organizationName: string | null;
  phone: string | null;
  email: string | null;
  personalEmail: string | null;
};

export type NoticeRosterSheet = {
  /** 워크시트 탭 이름 (예: '선발자', '미선발자') */
  title: string;
  rows: NoticeRosterRow[];
};

type BuildArgs = {
  cohortName: string;
  sheets: NoticeRosterSheet[];
};

function styleHeader(cell: ExcelJS.Cell, primary: boolean) {
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: primary ? COLOR_PRIMARY : COLOR_HEADER }
  };
  cell.font = {
    name: FONT_NAME,
    size: 11,
    bold: true,
    color: { argb: primary ? COLOR_WHITE : COLOR_BLACK }
  };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  cell.border = {
    top: { style: 'thin' },
    bottom: { style: 'thin' },
    left: { style: 'thin' },
    right: { style: 'thin' }
  };
}

function styleData(cell: ExcelJS.Cell) {
  cell.font = { name: FONT_NAME, size: 10 };
  cell.alignment = { horizontal: 'left', vertical: 'middle' };
  cell.border = {
    top: { style: 'thin' },
    bottom: { style: 'thin' },
    left: { style: 'thin' },
    right: { style: 'thin' }
  };
}

function fillSheet(ws: ExcelJS.Worksheet, sheet: NoticeRosterSheet) {
  const headers = [
    'NO',
    '이름',
    '분류',
    '소속기관',
    '연락처',
    '공공 이메일',
    '개인 이메일'
  ];
  const widths = [6, 14, 14, 30, 18, 26, 26];

  const headerRow = ws.addRow(headers);
  headerRow.height = 28;
  headerRow.eachCell((cell, col) => styleHeader(cell, col === 1));
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));

  const sorted = sheet.rows.toSorted((a, b) => a.name.localeCompare(b.name, 'ko'));
  sorted.forEach((r, idx) => {
    const vals = [
      idx + 1,
      r.name,
      r.categoryLabel,
      r.organizationName ?? '',
      r.phone ?? '',
      r.email ?? '',
      r.personalEmail ?? ''
    ];
    const row = ws.addRow(vals);
    row.eachCell((cell, col) => {
      styleData(cell);
      if (col === 1) cell.alignment = { ...cell.alignment, horizontal: 'center' };
    });
  });

  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }];
}

export async function buildNoticeRosterWorkbook({
  cohortName,
  sheets
}: BuildArgs): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'kbrain-ems';
  wb.created = new Date();

  for (const s of sheets) {
    const ws = wb.addWorksheet(s.title);
    fillSheet(ws, s);
  }

  // 메타 정보 — 파일명에 들어가지 못하는 컨텍스트
  void cohortName;

  return wb.xlsx.writeBuffer();
}

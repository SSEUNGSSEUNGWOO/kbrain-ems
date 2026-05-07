import ExcelJS from 'exceljs';

const FONT_NAME = 'Arial';
const COLOR_PRIMARY = 'FF4A86E8';
const COLOR_DATE = 'FF1155CC';
const COLOR_HEADER_INFO = 'FFF2F2F2';
const COLOR_HEADER_DATA = 'FFF3F3F3';
const COLOR_WHITE = 'FFFFFFFF';
const COLOR_BLACK = 'FF000000';

const STATUS_LABELS: Record<string, string> = {
  late: '지각',
  early_leave: '조퇴',
  absent: '결석',
  excused: '사유결석'
};

export type ExportStudent = {
  id: string;
  name: string;
  category: string | null;
  organizationName: string | null;
  department: string | null;
  jobTitle: string | null;
};

export type ExportSession = {
  id: string;
  sessionDate: string;
  title: string | null;
};

export type ExportRecord = {
  sessionId: string;
  studentId: string;
  status: string;
  note: string | null;
  creditedHours: string | null;
};

function formatMonthDay(s: string): string {
  const [, m, d] = s.split('-');
  return `${Number(m)}.${Number(d)}`;
}

function buildNoteText(record: ExportRecord | undefined): string {
  if (!record) return '';
  if (record.note && record.note.trim()) return record.note.trim();
  return STATUS_LABELS[record.status] ?? '';
}

function applyMergedHeaderStyle(
  ws: ExcelJS.Worksheet,
  range: string,
  opts: { value: string | number; primary: boolean; fontSize: number }
) {
  ws.mergeCells(range);
  const [first] = range.split(':');
  const cell = ws.getCell(first);
  cell.value = opts.value;
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: opts.primary ? COLOR_PRIMARY : COLOR_DATE }
  };
  cell.font = {
    name: FONT_NAME,
    size: opts.fontSize,
    bold: true,
    color: { argb: COLOR_WHITE }
  };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  cell.border = {
    top: { style: 'thin' },
    bottom: { style: 'thin' },
    left: { style: 'thin' },
    right: { style: 'thin' }
  };
}

function applyColumnHeaderStyle(
  cell: ExcelJS.Cell,
  opts: { info: boolean }
) {
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: opts.info ? COLOR_HEADER_INFO : COLOR_HEADER_DATA }
  };
  cell.font = {
    name: FONT_NAME,
    size: 11,
    bold: opts.info,
    color: { argb: COLOR_BLACK }
  };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  cell.border = {
    top: { style: 'medium' },
    bottom: { style: 'double' },
    left: { style: 'thin' },
    right: { style: 'thin' }
  };
}

function applyDataStyle(cell: ExcelJS.Cell) {
  cell.font = {
    name: FONT_NAME,
    size: 11,
    color: { argb: COLOR_BLACK }
  };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  cell.border = {
    top: { style: 'thin' },
    bottom: { style: 'thin' },
    left: { style: 'thin' },
    right: { style: 'thin' }
  };
}

function widenLeftBorder(cell: ExcelJS.Cell) {
  cell.border = { ...cell.border, left: { style: 'medium' } };
}

function widenRightBorder(cell: ExcelJS.Cell) {
  cell.border = { ...cell.border, right: { style: 'medium' } };
}

export async function buildAttendanceWorkbook({
  cohortName,
  students,
  sessions,
  records
}: {
  cohortName: string;
  students: ExportStudent[];
  sessions: ExportSession[];
  records: ExportRecord[];
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('출석 현황');

  const N = sessions.length;
  const dataStartCol = 8; // H
  const sumCol = dataStartCol + 2 * N;

  // 컬럼 너비
  ws.getColumn(1).width = 5.75; // A 여백
  ws.getColumn(2).width = 12.63; // B 번호
  ws.getColumn(3).width = 12.63; // C 구분
  ws.getColumn(4).width = 20; // D 기관명
  ws.getColumn(5).width = 12.63; // E 하위부서
  ws.getColumn(6).width = 12.63; // F 직책
  ws.getColumn(7).width = 12.63; // G 이름
  for (let c = dataStartCol; c < sumCol; c++) {
    ws.getColumn(c).width = 12.63;
  }
  ws.getColumn(sumCol).width = 12.63;

  // 제목 (B2:G4)
  applyMergedHeaderStyle(ws, 'B2:G4', {
    value: `「${cohortName}」 교육생 출석 현황`,
    primary: true,
    fontSize: 19
  });

  // 회차 이름 (2~3행) + 날짜 (4행)
  for (let i = 0; i < N; i++) {
    const c1 = dataStartCol + 2 * i;
    const c2 = c1 + 1;
    applyMergedHeaderStyle(ws, `${cellRef(c1, 2)}:${cellRef(c2, 3)}`, {
      value: sessions[i].title ?? '',
      primary: true,
      fontSize: 11
    });
    applyMergedHeaderStyle(ws, `${cellRef(c1, 4)}:${cellRef(c2, 4)}`, {
      value: formatMonthDay(sessions[i].sessionDate),
      primary: false,
      fontSize: 11
    });
  }

  // 합계 헤더 (2~5행 머지)
  applyMergedHeaderStyle(ws, `${cellRef(sumCol, 2)}:${cellRef(sumCol, 5)}`, {
    value: '합계',
    primary: true,
    fontSize: 11
  });

  // 컬럼 헤더 (5행)
  const infoLabels = ['번호', '구분', '기관명', '하위부서', '직책', '이름'];
  for (let i = 0; i < infoLabels.length; i++) {
    const cell = ws.getCell(5, 2 + i);
    cell.value = infoLabels[i];
    applyColumnHeaderStyle(cell, { info: true });
  }
  for (let i = 0; i < N; i++) {
    const c1 = dataStartCol + 2 * i;
    const cellHours = ws.getCell(5, c1);
    cellHours.value = '출석시간';
    applyColumnHeaderStyle(cellHours, { info: false });
    const cellNote = ws.getCell(5, c1 + 1);
    cellNote.value = '비고';
    applyColumnHeaderStyle(cellNote, { info: false });
  }

  // 외곽 medium
  widenLeftBorder(ws.getCell(5, 2));
  if (N === 0) {
    widenRightBorder(ws.getCell(5, sumCol));
  }

  // 학생 데이터 (6행~)
  const recordMap = new Map<string, ExportRecord>();
  for (const r of records) {
    recordMap.set(`${r.sessionId}|${r.studentId}`, r);
  }

  for (let idx = 0; idx < students.length; idx++) {
    const row = 6 + idx;
    const st = students[idx];

    setData(ws, row, 2, idx + 1);
    setData(ws, row, 3, st.category ?? '');
    setData(ws, row, 4, st.organizationName ?? '');
    setData(ws, row, 5, st.department ?? '');
    setData(ws, row, 6, st.jobTitle ?? '');
    setData(ws, row, 7, st.name);

    let totalHours = 0;
    let hasHours = false;
    for (let i = 0; i < N; i++) {
      const c1 = dataStartCol + 2 * i;
      const r = recordMap.get(`${sessions[i].id}|${st.id}`);
      const hoursRaw = r?.creditedHours;
      const hours =
        hoursRaw != null && hoursRaw !== '' && Number.isFinite(Number(hoursRaw))
          ? Number(hoursRaw)
          : null;
      setData(ws, row, c1, hours);
      setData(ws, row, c1 + 1, buildNoteText(r));
      if (hours != null) {
        totalHours += hours;
        hasHours = true;
      }
    }

    setData(ws, row, sumCol, hasHours ? Math.round(totalHours * 10) / 10 : null);

    widenLeftBorder(ws.getCell(row, 2));
    widenRightBorder(ws.getCell(row, sumCol));
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

function setData(
  ws: ExcelJS.Worksheet,
  row: number,
  col: number,
  value: string | number | null
) {
  const cell = ws.getCell(row, col);
  cell.value = value;
  applyDataStyle(cell);
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

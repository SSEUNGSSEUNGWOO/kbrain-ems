import ExcelJS from 'exceljs';
import { TRACK_LABEL, type CertRow } from '@/lib/certified-roster';

const FONT_NAME = 'Arial';
const COLOR_PRIMARY = 'FF4A86E8';
const COLOR_HEADER_INFO = 'FFF2F2F2';
const COLOR_WHITE = 'FFFFFFFF';
const COLOR_BLACK = 'FF000000';

// 종합관리 xlsx 관례: "행정 (일반행정, …)" → "행정직렬"
function normalizeJobRole(jobRole: string | null): string {
  if (!jobRole) return '';
  const token = jobRole.replace(/^\d+\.\s*/, '').split(/[\s(]/)[0];
  if (!token) return '';
  return token.endsWith('직렬') ? token : `${token}직렬`;
}

function styleHeader(cell: ExcelJS.Cell, primary: boolean) {
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: primary ? COLOR_PRIMARY : COLOR_HEADER_INFO }
  };
  cell.font = {
    name: FONT_NAME,
    size: 11,
    bold: true,
    color: { argb: primary ? COLOR_WHITE : COLOR_BLACK }
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

export async function buildCertifiedWorkbook({
  rows,
  hidePersonal
}: {
  rows: CertRow[];
  hidePersonal: boolean;
}): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'kbrain-ems';
  wb.created = new Date();

  const ws = wb.addWorksheet('종합명단');

  // 종합관리 xlsx 13컬럼 구성. 인증일자는 데이터에 없어 빈 값.
  const headers = [
    'NO',
    '인증명',
    '인증유형',
    '구분',
    '이름',
    '기관분류',
    '기관',
    '부서명',
    '직급',
    '직렬',
    '연락처',
    '이메일',
    '인증번호',
    '인증일자'
  ];
  const headerRow = ws.addRow(headers);
  headerRow.height = 30;
  headerRow.eachCell((cell, colNumber) => {
    styleHeader(cell, colNumber === 1);
  });

  const colWidths = [6, 22, 12, 10, 10, 12, 30, 26, 10, 12, 16, 26, 14, 12];
  colWidths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  rows.forEach((r, idx) => {
    const row = ws.addRow([
      idx + 1,
      r.certName,
      r.kind,
      TRACK_LABEL[r.track] ?? r.track,
      r.name,
      r.category ?? '',
      r.organization ?? '',
      r.department ?? '',
      r.jobTitle ?? '',
      normalizeJobRole(r.jobRole),
      hidePersonal ? '' : (r.phone ?? ''),
      hidePersonal ? '' : (r.email ?? ''),
      r.certNo,
      ''
    ]);
    row.eachCell(styleData);
  });

  ws.views = [{ state: 'frozen', ySplit: 1 }];
  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

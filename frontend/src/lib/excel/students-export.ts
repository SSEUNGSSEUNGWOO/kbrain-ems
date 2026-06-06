import ExcelJS from 'exceljs';

const FONT_NAME = 'Arial';
const COLOR_PRIMARY = 'FF4A86E8';
const COLOR_HEADER_INFO = 'FFF2F2F2';
const COLOR_HEADER_DATA = 'FFFCFCFC';
const COLOR_WHITE = 'FFFFFFFF';
const COLOR_BLACK = 'FF000000';

export type ExportQuestion = {
  id: string;
  question_no: string;
  question_text: string;
  question_type: string;
  choices: { key: string; text: string }[] | null;
  display_order: number;
};

export type ExportStudentRow = {
  applicantId: string;
  name: string;
  category: string | null;
  organizationName: string | null;
  department: string | null;
  jobTitle: string | null;
  jobRole: string | null;
  email: string | null;
  phone: string | null;
  /** application.id (selected status) — answers 매칭 key */
  applicationId: string | null;
};

export type ExportAnswer = {
  application_id: string;
  question_id: string;
  answer_value: unknown;
};

type BuildArgs = {
  cohortName: string;
  students: ExportStudentRow[];
  questions: ExportQuestion[];
  answers: ExportAnswer[];
  hidePersonal: boolean;
};

function formatAnswer(q: ExportQuestion, value: unknown): string {
  if (value === null || value === undefined) return '';
  const choicesByKey = new Map<string, string>();
  for (const c of q.choices ?? []) choicesByKey.set(c.key, c.text);

  if (q.question_type === 'single') {
    const key = String(value);
    const text = choicesByKey.get(key);
    return text ? `${key} ${text}` : key;
  }
  if (q.question_type === 'multi') {
    if (!Array.isArray(value)) return String(value);
    return value
      .map((k) => {
        const key = String(k);
        const text = choicesByKey.get(key);
        return text ? `${key} ${text}` : key;
      })
      .join(', ');
  }
  if (q.question_type === 'likert5') {
    return String(value);
  }
  // text / 기타
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function styleHeader(cell: ExcelJS.Cell, opts: { primary?: boolean; info?: boolean }) {
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: {
      argb: opts.primary ? COLOR_PRIMARY : opts.info ? COLOR_HEADER_INFO : COLOR_HEADER_DATA
    }
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

export async function buildStudentsWorkbook({
  cohortName,
  students,
  questions,
  answers,
  hidePersonal
}: BuildArgs): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'kbrain-ems';
  wb.created = new Date();

  const ws = wb.addWorksheet(`${cohortName} 명단`);

  // answers 인덱싱: application_id → question_id → answer_value
  const answerMap = new Map<string, Map<string, unknown>>();
  for (const a of answers) {
    let inner = answerMap.get(a.application_id);
    if (!inner) {
      inner = new Map();
      answerMap.set(a.application_id, inner);
    }
    inner.set(a.question_id, a.answer_value);
  }

  const sortedQuestions = [...questions].sort(
    (a, b) => a.display_order - b.display_order || a.question_no.localeCompare(b.question_no)
  );

  // 헤더 행
  const staticHeaders = hidePersonal
    ? ['NO', '이름', '소속기관구분', '소속기관', '소속', '직책', '직무']
    : ['NO', '이름', '소속기관구분', '소속기관', '소속', '직책', '직무', '이메일', '전화번호'];
  const dynamicHeaders = sortedQuestions.map((q) =>
    q.question_no ? `[${q.question_no}] ${q.question_text}` : q.question_text
  );
  const headers = [...staticHeaders, ...dynamicHeaders];

  const headerRow = ws.addRow(headers);
  headerRow.height = 36;
  headerRow.eachCell((cell, colNumber) => {
    styleHeader(cell, { primary: colNumber === 1, info: colNumber <= staticHeaders.length });
  });

  // 컬럼 너비
  const colWidths = hidePersonal
    ? [6, 12, 14, 22, 30, 12, 12]
    : [6, 12, 14, 22, 30, 12, 12, 22, 16];
  for (let i = 0; i < staticHeaders.length; i++) {
    ws.getColumn(i + 1).width = colWidths[i];
  }
  for (let i = 0; i < sortedQuestions.length; i++) {
    ws.getColumn(staticHeaders.length + 1 + i).width = 28;
  }

  // 데이터 행
  const sortedStudents = [...students].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  sortedStudents.forEach((s, idx) => {
    const inner = s.applicationId ? answerMap.get(s.applicationId) : null;
    const staticVals = hidePersonal
      ? [
          idx + 1,
          s.name,
          s.category ?? '',
          s.organizationName ?? '',
          s.department ?? '',
          s.jobTitle ?? '',
          s.jobRole ?? ''
        ]
      : [
          idx + 1,
          s.name,
          s.category ?? '',
          s.organizationName ?? '',
          s.department ?? '',
          s.jobTitle ?? '',
          s.jobRole ?? '',
          s.email ?? '',
          s.phone ?? ''
        ];
    const dynamicVals = sortedQuestions.map((q) =>
      inner ? formatAnswer(q, inner.get(q.id) ?? null) : ''
    );
    const row = ws.addRow([...staticVals, ...dynamicVals]);
    row.eachCell((cell, colNumber) => {
      styleData(cell);
      if (colNumber === 1) cell.alignment = { ...cell.alignment, horizontal: 'center' };
    });
  });

  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }];

  return wb.xlsx.writeBuffer();
}

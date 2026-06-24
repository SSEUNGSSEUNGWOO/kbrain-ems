// 외부 신청 시스템 파서 + 매핑 로직
// 헤더: NO / 아이디 / 이름 / 전화번호 / 이메일 / 소속기관구분 / 소속기관 / 설문분류 / 설문항목 1~N
// 입력 포맷 자동 분기 — BIFF .xls (D0CF11E0) / .xlsx ZIP (PK) / HTML 위장 .xls
// universal (브라우저·서버 둘 다 사용)

import { parse } from 'node-html-parser';
import * as XLSX from 'xlsx';

export type AppChoice = { key: string; text: string };

export type AppQuestion = {
  id: string;
  question_no: string;
  question_type: 'single' | 'multi' | 'text' | 'likert5';
  section: string;
  choices: AppChoice[] | null;
  correct_choice: string | null;
};

export type ParsedRow = {
  rowIndex: number;
  externalId: string;
  name: string;
  phone: string;
  email: string;
  organizationCategoryRaw: string;
  organizationName: string;
  surveyType: string;
  rawValues: string[];
};

export type MultiQuestionMeta = {
  question_no: string;
  externalIds: string[];
  emsChoices: AppChoice[];
  autoSuggest: Record<string, string>;
};

export type MappingPreview = {
  totalRows: number;
  preSurveyRows: number;
  postSurveyRows: number;
  rowsWithoutName: number;
  newApplicants: number;
  updatedApplicants: number;
  newOrganizations: number;
  questionMapping: { question_no: string; mappedCount: number; failedCount: number }[];
  multiQuestions: MultiQuestionMeta[];
  unknownSingleValues: { question_no: string; row: number; raw: string }[];
};

// 매칭용 정규화: 공백·중점·쉼표·따옴표류를 모두 제거해 EMS 저장 텍스트와 외부 응답의 표기 차이를 흡수
const norm = (s: string) =>
  s.replace(/\s+/g, '').replace(/[·、,「」『』""'']/g, '');
const stripNumPrefix = (s: string) => s.replace(/^\d+\.\s*/, '').trim();

// 외부 export가 `& #40;` (공백 끼인 깨진 numeric entity) 같은 형태로 내려보내는 경우
// node-html-parser의 textContent는 이를 디코드하지 못하므로 직접 복구한다.
function decodeBrokenEntities(s: string): string {
  return s
    .replace(/&\s*#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&\s*#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}

export function mapSingleValue(raw: string, q: { choices: AppChoice[] | null }): string | null {
  const v = raw.trim();
  if (!v) return null;
  const m = v.match(/^\d+\.\s*([①②③④⑤⑥⑦⑧⑨⑩])/);
  if (m) return m[1];
  const text = stripNumPrefix(v);
  const nt = norm(text);
  for (const c of q.choices ?? []) {
    if (norm(c.text) === nt) return c.key;
  }
  for (const c of q.choices ?? []) {
    if (norm(c.text).includes(nt) || nt.includes(norm(c.text))) return c.key;
  }
  return null;
}

export function mapAnswerValue(
  raw: string,
  q: AppQuestion,
  multiMapping?: Record<string, string>
): unknown {
  const v = raw.trim();
  if (!v) return null;
  if (q.question_type === 'text') return v;
  if (q.question_type === 'single') return mapSingleValue(v, q);
  if (q.question_type === 'multi') {
    const tokens = v.split(/\|\|/).map((t) => t.trim()).filter(Boolean);
    if (multiMapping) {
      return tokens.map((t) => multiMapping[t] ?? t).filter(Boolean);
    }
    return tokens;
  }
  if (q.question_type === 'likert5') {
    const n = Number(v.match(/\d+/)?.[0] ?? NaN);
    return Number.isFinite(n) ? n : null;
  }
  return v;
}

// 외부 헤더의 메타 컬럼 수 (NO/아이디/이름/전화/이메일/소속기관구분/소속기관/설문분류)
const META_COLUMN_COUNT = 8;

// 파일 시그니처로 BIFF(.xls 바이너리)·ZIP(.xlsx)·HTML(텍스트) 자동 분기.
// 외부 시스템이 export 포맷을 BIFF .xls로 바꾼 뒤로는 ArrayBuffer 경로만 실제 사용됨.
export function parseAnyXls(input: ArrayBuffer | Uint8Array | string): ParsedRow[] {
  if (typeof input === 'string') {
    return parseXlsHtml(input);
  }
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const isBiff =
    bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (isBiff || isZip) {
    return parseXlsBinary(bytes);
  }
  return parseXlsHtml(new TextDecoder('utf-8').decode(bytes));
}

function parseXlsBinary(bytes: Uint8Array): ParsedRow[] {
  const wb = XLSX.read(bytes, { type: 'array' });
  const firstSheet = wb.SheetNames[0];
  if (!firstSheet) return [];
  const ws = wb.Sheets[firstSheet];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: null,
    raw: false
  });
  if (aoa.length === 0) return [];

  const header = (aoa[0] ?? []) as unknown[];
  const totalCols = header.length;
  if (totalCols <= META_COLUMN_COUNT) return [];
  const responseCount = totalCols - META_COLUMN_COUNT;

  const rows: ParsedRow[] = [];
  for (let r = 1; r < aoa.length; r++) {
    const row = (aoa[r] ?? []) as unknown[];
    const v0 = row[0];
    if (v0 === null || v0 === undefined) continue;
    if (!/^\d+$/.test(String(v0).trim())) continue;
    const cell = (i: number): string => {
      const v = row[i];
      if (v === null || v === undefined) return '';
      return String(v).replace(/\s+/g, ' ').trim();
    };
    const rawValues: string[] = [];
    for (let i = 0; i < responseCount; i++) rawValues.push(cell(META_COLUMN_COUNT + i));
    rows.push({
      rowIndex: rows.length + 1,
      externalId: cell(1),
      name: cell(2),
      phone: cell(3),
      email: cell(4),
      organizationCategoryRaw: cell(5),
      organizationName: cell(6),
      surveyType: cell(7),
      rawValues
    });
  }
  return rows;
}

export function parseXlsHtml(html: string): ParsedRow[] {
  const root = parse(html);
  const trs = root.querySelectorAll('tbody tr');
  const rows: ParsedRow[] = [];
  for (const tr of trs) {
    const tds = tr.querySelectorAll('td');
    if (tds.length <= META_COLUMN_COUNT) continue;
    const text = (i: number) =>
      decodeBrokenEntities((tds[i]?.textContent ?? '').replace(/\s+/g, ' ').trim());
    const responseCount = tds.length - META_COLUMN_COUNT;
    const rawValues: string[] = [];
    for (let i = 0; i < responseCount; i++) rawValues.push(text(META_COLUMN_COUNT + i));
    rows.push({
      rowIndex: rows.length + 1,
      externalId: text(1),
      name: text(2),
      phone: text(3),
      email: text(4),
      organizationCategoryRaw: text(5),
      organizationName: text(6),
      surveyType: text(7),
      rawValues
    });
  }
  return rows;
}

export function buildPreview(rows: ParsedRow[], questions: AppQuestion[]): MappingPreview {
  const preRows = rows.filter((r) => r.surveyType === '사전설문');
  const postRows = rows.filter((r) => r.surveyType === '사후설문');
  const rowsWithoutName = preRows.filter((r) => !r.name).length;

  const questionMapping = questions.map((q, qi) => {
    let mapped = 0;
    let failed = 0;
    for (const row of preRows) {
      const raw = row.rawValues[qi];
      if (!raw) continue;
      if (q.question_type === 'single') {
        if (mapSingleValue(raw, q)) mapped++;
        else failed++;
      } else {
        mapped++;
      }
    }
    return { question_no: q.question_no, mappedCount: mapped, failedCount: failed };
  });

  const multiQuestions: MultiQuestionMeta[] = [];
  for (let qi = 0; qi < questions.length; qi++) {
    const q = questions[qi];
    if (q.question_type !== 'multi') continue;
    const occurrenceCount = new Map<string, number>();
    for (const row of preRows) {
      const raw = row.rawValues[qi];
      if (!raw) continue;
      for (const t of raw.split(/\|\|/)) {
        const id = t.trim();
        if (id) occurrenceCount.set(id, (occurrenceCount.get(id) ?? 0) + 1);
      }
    }
    // 숫자 ID 와 비-숫자 ID 분리. LMS export 의 실제 답안은 숫자(보기 ID).
    // 한두 row 의 외부 데이터 오류(예: "1. ① O (맞다)") 가 자동 매핑을 어긋나게 하지 않도록
    // 숫자 ID 만 emsKeys 순서대로 자동 매칭, 비-숫자는 매핑 안 함.
    const numericIds = [...occurrenceCount.keys()]
      .filter((id) => /^\d+$/.test(id))
      .toSorted((a, b) => Number(a) - Number(b));
    const otherIds = [...occurrenceCount.keys()]
      .filter((id) => !/^\d+$/.test(id))
      .toSorted((a, b) => a.localeCompare(b));
    const emsKeys = (q.choices ?? []).map((c) => c.key);
    const autoSuggest: Record<string, string> = {};
    for (let i = 0; i < numericIds.length; i++) {
      autoSuggest[numericIds[i]] = emsKeys[i] ?? '';
    }
    multiQuestions.push({
      question_no: q.question_no,
      externalIds: [...numericIds, ...otherIds],
      emsChoices: q.choices ?? [],
      autoSuggest
    });
  }

  const unknownSingleValues: MappingPreview['unknownSingleValues'] = [];
  for (let qi = 0; qi < questions.length; qi++) {
    const q = questions[qi];
    if (q.question_type !== 'single') continue;
    for (const row of preRows) {
      const raw = row.rawValues[qi];
      if (!raw) continue;
      if (!mapSingleValue(raw, q)) {
        unknownSingleValues.push({ question_no: q.question_no, row: row.rowIndex, raw });
      }
    }
  }

  return {
    totalRows: rows.length,
    preSurveyRows: preRows.length,
    postSurveyRows: postRows.length,
    rowsWithoutName,
    newApplicants: 0,
    updatedApplicants: 0,
    newOrganizations: 0,
    questionMapping,
    multiQuestions,
    unknownSingleValues
  };
}

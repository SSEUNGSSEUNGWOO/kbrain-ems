// 일회성 — 5/7 만족도 조사 엑셀 응답을 1기/2기 양쪽에 동일 insert.
//
// 사전 조건:
//   - 마이그레이션 20260512000001_drop_response_token.sql 적용됨
//
// 동작:
//   1) 두 survey의 기존 survey_responses(dead 토큰) 모두 delete
//   2) 엑셀 26 행 × 2 survey = 52 익명 row insert
//   3) 척도: ceil(value/2)로 10→5점 환산
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(__dirname, '../.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SURVEY_IDS = [
  { name: '1기', id: 'effb3865-f0c5-4d27-9bb8-11f34edda094' },
  { name: '2기', id: 'dc86bd71-85f3-4aa5-b657-3d5c13a7425d' }
];

// 엑셀 컬럼 → DB question_no 매핑 (확인된 구조 기반)
//   엑셀 col 2  → Q1  (likert 1-1)
//   엑셀 col 3  → Q2  (text  1-1 사유)
//   ...
const COL_TO_QUESTION_NO: Record<number, number> = {
  2: 1,   3: 2,   4: 3,   5: 4,   6: 5,   7: 6,
  8: 7,   9: 8,  10: 9,  11: 10, 12: 11, 13: 12,
  14: 13, 15: 14, 16: 15, 17: 16, 18: 17, 19: 18,
  20: 19, 21: 20, 22: 21, 23: 22, 24: 23, 25: 24,
  26: 25, 27: 26, 28: 27
};

// 척도 환산 1-10 → 1-5
const scaleConvert = (n: number) => Math.max(1, Math.min(5, Math.ceil(n / 2)));

type Question = {
  id: string;
  question_no: number;
  type: string;
};

async function fetchQuestions(surveyId: string): Promise<Question[]> {
  const { data, error } = await supabase
    .from('survey_questions')
    .select('id, question_no, type')
    .eq('survey_id', surveyId);
  if (error || !data) throw new Error(error?.message ?? 'questions fetch failed');
  return data;
}

async function deleteExistingResponses(surveyId: string) {
  const { error, count } = await supabase
    .from('survey_responses')
    .delete({ count: 'exact' })
    .eq('survey_id', surveyId);
  if (error) throw new Error(error.message);
  console.log(`  deleted ${count} existing row(s)`);
}

async function parseExcel(): Promise<Array<{ submittedAt: string; rawByCol: Record<number, unknown> }>> {
  const file = path.resolve(__dirname, '../../tmp_survey_57.xlsx');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];

  const rows: Array<{ submittedAt: string; rawByCol: Record<number, unknown> }> = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const ts = row.getCell(1).value;
    if (!ts) continue; // 빈 행 건너뛰기

    const submittedAt =
      ts instanceof Date
        ? ts.toISOString()
        : typeof ts === 'string'
          ? new Date(ts).toISOString()
          : new Date().toISOString();

    const rawByCol: Record<number, unknown> = {};
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const v = cell.value;
      if (typeof v === 'object' && v && 'text' in v) {
        rawByCol[col] = String((v as { text?: unknown }).text ?? '');
      } else {
        rawByCol[col] = v;
      }
    });
    rows.push({ submittedAt, rawByCol });
  }
  return rows;
}

function buildResponses(
  rawByCol: Record<number, unknown>,
  questionsByNo: Map<number, Question>
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [colStr, qNo] of Object.entries(COL_TO_QUESTION_NO)) {
    const col = Number(colStr);
    const raw = rawByCol[col];
    if (raw === undefined || raw === null || raw === '') continue;
    const q = questionsByNo.get(qNo);
    if (!q) continue;

    if (q.type === 'likert5') {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (Number.isFinite(n) && n > 0) {
        out[q.id] = scaleConvert(n);
      }
    } else if (q.type === 'text') {
      const s = String(raw).trim();
      if (s.length > 0) out[q.id] = s;
    }
  }
  return out;
}

async function main() {
  console.log('=== 엑셀 파싱 ===');
  const excelRows = await parseExcel();
  console.log(`  ${excelRows.length} 응답 행`);

  for (const survey of SURVEY_IDS) {
    console.log(`\n=== ${survey.name} (${survey.id}) ===`);

    const questions = await fetchQuestions(survey.id);
    const questionsByNo = new Map(questions.map((q) => [q.question_no, q]));
    console.log(`  ${questions.length} 문항`);

    await deleteExistingResponses(survey.id);

    const insertRows = excelRows.map(({ submittedAt, rawByCol }) => ({
      survey_id: survey.id,
      student_id: null,
      submitted_at: submittedAt,
      responses: buildResponses(rawByCol, questionsByNo) as never
    }));

    const { error: insErr, data: inserted } = await supabase
      .from('survey_responses')
      .insert(insertRows)
      .select('id');
    if (insErr) throw new Error(insErr.message);
    console.log(`  inserted ${inserted?.length ?? 0} row(s)`);
  }

  console.log('\n=== 완료 ===');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

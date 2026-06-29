// 일회성 — 그린2/블루3/⑥ 신청 import dry-run (BIFF .xls + SheetJS).
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import {
  parseAnyXls,
  buildPreview,
  type AppQuestion
} from '../src/lib/applications-xls-parser';

const envPath = path.resolve(__dirname, '../.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TARGETS: { file: string; cohortName: string }[] = [
  {
    file: 'C:\\Users\\USER\\Downloads\\(260623_1800) 2026년 ⑥ 노코드 AI 서비스 구현.xls',
    cohortName: '노코드 AI 서비스 구현'
  },
  {
    file: 'C:\\Users\\USER\\Downloads\\(260623_1800) 2026년 AI 챔피언 그린(초급) 종합과정 2회차.xls',
    cohortName: 'AI 챔피언 그린 2회차'
  },
  {
    file: 'C:\\Users\\USER\\Downloads\\(260623_1800) 2026년 AI 챔피언 블루(중급) 종합과정 3회차.xls',
    cohortName: 'AI 챔피언 블루 3회차'
  }
];

async function dryRun(file: string, cohortName: string) {
  console.log('\n' + '='.repeat(100));
  console.log(`FILE: ${path.basename(file)}`);
  console.log(`COHORT: ${cohortName}`);
  console.log('='.repeat(100));

  const buf = fs.readFileSync(file);
  const rows = parseAnyXls(new Uint8Array(buf));
  console.log(`Parsed rows: ${rows.length}`);
  if (rows.length === 0) return;
  const sample = rows[0];
  console.log(`  meta: id=${sample.externalId} name=${sample.name} surveyType=${sample.surveyType}`);
  console.log(`  response cols/row: ${sample.rawValues.length}`);

  const { data: cohort } = await supabase
    .from('cohorts')
    .select('id, name')
    .eq('name', cohortName)
    .maybeSingle();
  if (!cohort) {
    console.log(`  ⚠️  cohort not found: ${cohortName}`);
    return;
  }

  const { data: qsRaw } = await supabase
    .from('application_questions')
    .select('question_no, section, question_type, question_text, choices, correct_choice, display_order')
    .eq('cohort_id', cohort.id)
    .order('display_order', { ascending: true });
  const qs = (qsRaw ?? []) as Array<{
    question_no: string;
    section: string;
    question_type: string;
    question_text: string;
    choices: { key: string; text: string }[] | null;
    correct_choice: string | null;
    display_order: number;
  }>;
  console.log(`  DB questions: ${qs.length}`);

  const fileCols = sample.rawValues.length;
  console.log(`  ${fileCols === qs.length ? '✓' : '❌'} count match: file=${fileCols} DB=${qs.length}`);

  const appQuestions: AppQuestion[] = qs.map((q, i) => ({
    id: String(i),
    question_no: q.question_no,
    question_type:
      q.question_type === 'multi' ? 'multi' :
      q.question_type === 'text' ? 'text' :
      q.question_type === 'likert5' ? 'likert5' :
      'single',
    section: q.section,
    choices: q.choices,
    correct_choice: q.correct_choice
  }));

  const preview = buildPreview(rows, appQuestions);
  console.log(`  사전설문: ${preview.preSurveyRows} / 사후설문: ${preview.postSurveyRows} / 이름없음: ${preview.rowsWithoutName}`);
  console.log(`  매핑 실패 (single): ${preview.unknownSingleValues.length}건`);

  console.log(`\n  per-question (single only):`);
  for (let i = 0; i < preview.questionMapping.length; i++) {
    const m = preview.questionMapping[i];
    const q = qs[i];
    if (!q || q.question_type !== 'single') continue;
    const mark = m.failedCount > 0 ? '❌' : '✓';
    console.log(`    ${mark} [${q.question_no.padStart(11)}] mapped=${m.mappedCount} failed=${m.failedCount}`);
  }

  if (preview.unknownSingleValues.length > 0) {
    console.log(`\n  실패 raw (sample 8):`);
    for (const u of preview.unknownSingleValues.slice(0, 8)) {
      console.log(`    Q${u.question_no} row=${u.row}  raw="${u.raw.slice(0, 80)}"`);
    }
  }

  console.log(`\n  multi questions:`);
  for (const m of preview.multiQuestions) {
    console.log(`    Q${m.question_no} extIds=${m.externalIds.length} emsChoices=${m.emsChoices.length}`);
  }
}

async function main() {
  for (const t of TARGETS) await dryRun(t.file, t.cohortName);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

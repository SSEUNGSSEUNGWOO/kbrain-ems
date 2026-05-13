// 시드 결과 빠른 검증 — application_questions 매핑/구성 확인.
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(__dirname, '../.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}

const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const target = process.argv[2] ?? 'AI 리터러시와 업무활용';

const { data: cohort } = await s.from('cohorts').select('id, name').eq('name', target).single();
if (!cohort) {
  console.error(`cohort not found: ${target}`);
  process.exit(1);
}

const { data: questions } = await s
  .from('application_questions')
  .select('section, question_no, difficulty, question_type, weight, correct_choice, question_text')
  .eq('cohort_id', cohort.id)
  .order('display_order');

console.log(`\n=== ${cohort.name} (${questions?.length}문항) ===\n`);
const bySection = new Map<string, number>();
for (const q of questions ?? []) {
  bySection.set(q.section, (bySection.get(q.section) ?? 0) + 1);
  const diff = q.difficulty ? `[${q.difficulty}]` : '';
  const ans = q.correct_choice ? `정답=${q.correct_choice}` : '';
  const w = q.weight !== 1 ? `w=${q.weight}` : '';
  console.log(
    `  ${q.section.padEnd(15)} ${q.question_no.padEnd(6)} ${q.question_type.padEnd(7)} ${diff} ${ans} ${w}`
  );
  console.log(`    ${q.question_text.slice(0, 60)}${q.question_text.length > 60 ? '…' : ''}`);
}
console.log('\n섹션별:', Object.fromEntries(bySection));

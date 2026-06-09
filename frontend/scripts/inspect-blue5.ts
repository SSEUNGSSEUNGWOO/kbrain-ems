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

const COHORT_ID = 'f046ddf8-c458-4bf4-a71d-3230bc798e8a';

const { data: cohort } = await s
  .from('cohorts')
  .select('*')
  .eq('id', COHORT_ID)
  .single();
console.log('cohort:', JSON.stringify(cohort, null, 2));

const { data: questions } = await s
  .from('application_questions')
  .select('section, question_no, question_type, choices, correct_choice, weight, display_order')
  .eq('cohort_id', COHORT_ID)
  .order('display_order');
console.log(`\n[application_questions] ${questions?.length ?? 0}개`);
for (const q of questions ?? []) {
  console.log(`  ${q.display_order}\t${q.section}\t${q.question_no}\t${q.question_type}\tcorrect=${q.correct_choice}\tw=${q.weight}`);
}

const { count } = await s
  .from('applications')
  .select('*', { count: 'exact', head: true })
  .eq('cohort_id', COHORT_ID);
console.log(`\n[applications] 현재 ${count}건`);

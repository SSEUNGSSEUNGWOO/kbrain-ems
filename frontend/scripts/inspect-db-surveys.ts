// 일회성 — 1기/2기의 5/7 만족도 설문과 문항 매핑 상태 확인.
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// .env.local 직접 파싱
const envPath = path.resolve(__dirname, '../.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing env. url:', !!url, 'key:', !!key);
  process.exit(1);
}

const supabase = createClient(url, key);

async function main() {
  console.log('==== cohorts ====');
  const { data: cohorts } = await supabase
    .from('cohorts')
    .select('id, name, started_at, ended_at')
    .order('started_at', { ascending: true, nullsFirst: false });
  console.log(cohorts);

  console.log('\n==== surveys (satisfaction) ====');
  const { data: surveys } = await supabase
    .from('surveys')
    .select('id, cohort_id, title, share_code, opens_at, type, scope, created_at')
    .eq('type', 'satisfaction')
    .order('created_at', { ascending: true });
  console.log(surveys);

  console.log('\n==== survey_questions for each satisfaction survey ====');
  for (const s of surveys ?? []) {
    console.log(`\n--- survey ${s.id}  (${s.title})  share=${s.share_code} ---`);
    const { data: qs } = await supabase
      .from('survey_questions')
      .select('id, question_no, type, text, section_no, section_title, instructor_id, options')
      .eq('survey_id', s.id)
      .order('question_no', { ascending: true });
    qs?.forEach((q) => {
      console.log(
        `  Q${q.question_no} sec${q.section_no} [${q.type}] inst=${q.instructor_id ?? '-'}  ${q.text.slice(0, 50)}`
      );
    });
  }

  console.log('\n==== existing survey_responses count per survey ====');
  for (const s of surveys ?? []) {
    const { count } = await supabase
      .from('survey_responses')
      .select('id', { count: 'exact', head: true })
      .eq('survey_id', s.id);
    console.log(`  ${s.title}: ${count} responses`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

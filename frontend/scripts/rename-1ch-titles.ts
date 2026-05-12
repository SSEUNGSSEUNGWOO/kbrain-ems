// 일회성 — 1·2기 기술교육 1회차 관련 제목을 새 컨벤션으로 통일.
//   sessions:    "1회차: AI 에이전트 시대 이해"           → "[기술교육] 1회차"
//   assignments: "1회차: AI 에이전트 시대 이해 과제"      → "[기술교육] 1회차 과제"
//   surveys:     "1회차: AI 에이전트 시대 이해 만족도 조사" → "[기술교육] 1회차 만족도 조사"
import { createClient } from '@supabase/supabase-js';
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

const COHORT_IDS = [
  '2b265ae5-814d-404b-83e8-e1c810a62825',
  '256c5c6f-ef95-4073-8a27-a9b5fbc44316'
];

async function main() {
  const sess = await supabase
    .from('sessions')
    .update({ title: '[기술교육] 1회차' })
    .in('cohort_id', COHORT_IDS)
    .eq('title', '1회차: AI 에이전트 시대 이해')
    .select('id, cohort_id, title');
  console.log('sessions:', sess.data);

  const asg = await supabase
    .from('assignments')
    .update({ title: '[기술교육] 1회차 과제' })
    .in('cohort_id', COHORT_IDS)
    .eq('title', '1회차: AI 에이전트 시대 이해 과제')
    .select('id, cohort_id, title');
  console.log('assignments:', asg.data);

  const surv = await supabase
    .from('surveys')
    .update({ title: '[기술교육] 1회차 만족도 조사' })
    .in('cohort_id', COHORT_IDS)
    .eq('title', '1회차: AI 에이전트 시대 이해 만족도 조사')
    .select('id, cohort_id, title');
  console.log('surveys:', surv.data);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

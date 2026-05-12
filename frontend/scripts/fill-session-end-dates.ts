// PDF 기준 multi-day session들의 종료일 일괄 채움.
//   - 그린·블루 11개 종합과정 (각 cohort 단일 session)
//   - 전문인재 1·2기 기술교육 2~8회차 (2일), 특별교육 2회차 (2일), 인증평가 1·2회차 (2일)
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

const COHORT1 = '2b265ae5-814d-404b-83e8-e1c810a62825';
const COHORT2 = '256c5c6f-ef95-4073-8a27-a9b5fbc44316';

type Job = { cohortId: string; title: string; endDate: string };

// 1·2기 종료일 (1기 목요일 시작 → 금요일 종료, 2기 금요일 시작 → 토요일 종료)
const EXPERT_END_DATES: Record<
  string,
  { c1: string | null; c2: string | null }
> = {
  '[기술교육] 2회차': { c1: '2026-05-15', c2: '2026-05-16' },
  '[기술교육] 3회차': { c1: '2026-05-22', c2: '2026-05-23' },
  '[기술교육] 4회차': { c1: '2026-05-29', c2: '2026-05-30' },
  '[기술교육] 5회차': { c1: '2026-06-19', c2: '2026-06-20' },
  '[기술교육] 6회차': { c1: '2026-06-26', c2: '2026-06-27' },
  '[기술교육] 7회차': { c1: '2026-07-03', c2: '2026-07-04' },
  '[기술교육] 8회차': { c1: '2026-07-10', c2: '2026-07-11' },
  '[특별교육] 2회차': { c1: '2026-07-24', c2: '2026-07-25' },
  '[인증평가] 1회차': { c1: '2026-11-03', c2: '2026-11-04' },
  '[인증평가] 2회차': { c1: '2026-11-06', c2: '2026-11-07' }
};

const jobs: Job[] = [];
for (const [title, { c1, c2 }] of Object.entries(EXPERT_END_DATES)) {
  if (c1) jobs.push({ cohortId: COHORT1, title, endDate: c1 });
  if (c2) jobs.push({ cohortId: COHORT2, title, endDate: c2 });
}

// 그린·블루 11개 cohort 종합과정 종료일
const AICHAMP_END_DATES: Array<{ cohortName: string; endDate: string }> = [
  { cohortName: 'AI 챔피언 그린 26-1기', endDate: '2026-06-04' },
  { cohortName: 'AI 챔피언 그린 26-2기', endDate: '2026-06-17' },
  { cohortName: 'AI 챔피언 그린 26-3기', endDate: '2026-07-01' },
  { cohortName: 'AI 챔피언 그린 26-4기', endDate: '2026-07-15' },
  { cohortName: 'AI 챔피언 그린 26-5기', endDate: '2026-08-05' },
  { cohortName: 'AI 챔피언 그린 26-6기', endDate: '2026-09-16' },
  { cohortName: 'AI 챔피언 블루 26-1기', endDate: '2026-06-17' },
  { cohortName: 'AI 챔피언 블루 26-2기', endDate: '2026-06-24' },
  { cohortName: 'AI 챔피언 블루 26-3기', endDate: '2026-07-08' },
  { cohortName: 'AI 챔피언 블루 26-4기', endDate: '2026-07-22' },
  { cohortName: 'AI 챔피언 블루 26-5기', endDate: '2026-08-12' }
];

// === 실행 ===
for (const j of jobs) {
  const r = await supabase
    .from('sessions')
    .update({ session_end_date: j.endDate })
    .eq('cohort_id', j.cohortId)
    .eq('title', j.title)
    .select('id, title');
  console.log(`[experts] ${j.title.padEnd(20)} → ${j.endDate}  ${r.error?.message ?? `${r.data?.length}건`}`);
}

for (const a of AICHAMP_END_DATES) {
  const { data: c } = await supabase.from('cohorts').select('id').eq('name', a.cohortName).maybeSingle();
  if (!c) {
    console.log(`[SKIP] ${a.cohortName}`);
    continue;
  }
  const r = await supabase
    .from('sessions')
    .update({ session_end_date: a.endDate })
    .eq('cohort_id', c.id)
    .select('id, title');
  console.log(`[aichamp] ${a.cohortName.padEnd(22)} → ${a.endDate}  ${r.error?.message ?? `${r.data?.length}건`}`);
}

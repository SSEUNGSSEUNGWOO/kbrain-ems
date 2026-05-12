// AI 챔피언 그린(초급) 6기 + 블루(중급) 5기 cohort 메타 채우기.
//   started_at / ended_at      : 교육 기간
//   application_start/end_at   : 신청 기간
//   max_capacity               : 인원
//
// 강사·세션은 별도 — cohort 안의 sessions에서 직접 추가 가능.
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

type Plan = {
  name: string;
  app_start: string;
  app_end: string;
  start: string;
  end: string;
  capacity: number;
};

const PLANS: Plan[] = [
  // 그린 (초급) 종합과정
  { name: 'AI 챔피언 그린 26-1기', app_start: '2026-05-15', app_end: '2026-05-22', start: '2026-06-01', end: '2026-06-04', capacity: 80 },
  { name: 'AI 챔피언 그린 26-2기', app_start: '2026-05-15', app_end: '2026-05-29', start: '2026-06-15', end: '2026-06-17', capacity: 100 },
  { name: 'AI 챔피언 그린 26-3기', app_start: '2026-05-15', app_end: '2026-05-29', start: '2026-06-29', end: '2026-07-01', capacity: 100 },
  { name: 'AI 챔피언 그린 26-4기', app_start: '2026-06-08', app_end: '2026-06-19', start: '2026-07-13', end: '2026-07-15', capacity: 80 },
  { name: 'AI 챔피언 그린 26-5기', app_start: '2026-07-06', app_end: '2026-07-16', start: '2026-08-03', end: '2026-08-05', capacity: 100 },
  { name: 'AI 챔피언 그린 26-6기', app_start: '2026-08-10', app_end: '2026-08-21', start: '2026-09-14', end: '2026-09-16', capacity: 100 },
  // 블루 (중급) 종합과정
  { name: 'AI 챔피언 블루 26-1기', app_start: '2026-05-15', app_end: '2026-05-22', start: '2026-06-15', end: '2026-06-17', capacity: 80 },
  { name: 'AI 챔피언 블루 26-2기', app_start: '2026-05-15', app_end: '2026-05-29', start: '2026-06-22', end: '2026-06-24', capacity: 100 },
  { name: 'AI 챔피언 블루 26-3기', app_start: '2026-06-08', app_end: '2026-06-19', start: '2026-07-06', end: '2026-07-08', capacity: 80 },
  { name: 'AI 챔피언 블루 26-4기', app_start: '2026-06-08', app_end: '2026-06-19', start: '2026-07-20', end: '2026-07-22', capacity: 100 },
  { name: 'AI 챔피언 블루 26-5기', app_start: '2026-07-06', app_end: '2026-07-16', start: '2026-08-10', end: '2026-08-12', capacity: 100 }
];

for (const p of PLANS) {
  const { data, error } = await supabase
    .from('cohorts')
    .update({
      application_start_at: p.app_start,
      application_end_at: p.app_end,
      started_at: p.start,
      ended_at: p.end,
      max_capacity: p.capacity
    })
    .eq('name', p.name)
    .select('id, name, started_at, ended_at, max_capacity');
  console.log(`${p.name.padEnd(25)} ${error?.message ?? (data?.[0] ? 'OK' : 'NOT FOUND')}`);
}

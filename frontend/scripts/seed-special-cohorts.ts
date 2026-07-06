/**
 * 행정안전부 특화과정 + 기관맞춤형 인증평가 cohort 등록.
 *   - 특화 종합과정 2개 (그린·블루)
 *   - 기관맞춤형 인증평가 8개 (그린 7~10월, 블루 7~10월, delivery_method=자기주도형)
 * 이름 중복 시 SKIP.
 */
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

type CohortSeed = {
  name: string;
  category: string;
  delivery_method: string;
  orientation_date?: string | null;
  started_at: string;
  ended_at: string;
  self_study_start_at?: string | null;
  self_study_end_at?: string | null;
  max_capacity?: number | null;
};

const COHORTS: CohortSeed[] = [
  // 특화 종합과정 2개
  {
    name: 'AI 챔피언 그린(중급) 종합과정 (특화)',
    category: 'special',
    delivery_method: '블렌디드',
    orientation_date: '2026-07-07',
    started_at: '2026-07-07',
    ended_at: '2026-07-28',
    self_study_start_at: '2026-07-16',
    self_study_end_at: '2026-07-20',
    max_capacity: null
  },
  {
    name: 'AI 챔피언 블루(고급) 종합과정 (특화)',
    category: 'special',
    delivery_method: '블렌디드',
    orientation_date: '2026-09-16',
    started_at: '2026-09-16',
    ended_at: '2026-10-28',
    self_study_start_at: '2026-10-01',
    self_study_end_at: '2026-10-06',
    max_capacity: null
  },

  // 기관맞춤형 인증평가 — 그린 4개월
  { name: '그린(중급) 기관맞춤형 인증평가 7월', category: 'special', delivery_method: '자기주도형', started_at: '2026-07-30', ended_at: '2026-07-30', max_capacity: 100 },
  { name: '그린(중급) 기관맞춤형 인증평가 8월', category: 'special', delivery_method: '자기주도형', started_at: '2026-08-27', ended_at: '2026-08-27', max_capacity: 100 },
  { name: '그린(중급) 기관맞춤형 인증평가 9월', category: 'special', delivery_method: '자기주도형', started_at: '2026-09-29', ended_at: '2026-09-29', max_capacity: 100 },
  { name: '그린(중급) 기관맞춤형 인증평가 10월', category: 'special', delivery_method: '자기주도형', started_at: '2026-10-27', ended_at: '2026-10-27', max_capacity: 100 },

  // 기관맞춤형 인증평가 — 블루 4개월
  { name: '블루(고급) 기관맞춤형 인증평가 7월', category: 'special', delivery_method: '자기주도형', started_at: '2026-07-30', ended_at: '2026-07-30', max_capacity: 100 },
  { name: '블루(고급) 기관맞춤형 인증평가 8월', category: 'special', delivery_method: '자기주도형', started_at: '2026-08-27', ended_at: '2026-08-27', max_capacity: 100 },
  { name: '블루(고급) 기관맞춤형 인증평가 9월', category: 'special', delivery_method: '자기주도형', started_at: '2026-09-30', ended_at: '2026-09-30', max_capacity: 100 },
  { name: '블루(고급) 기관맞춤형 인증평가 10월', category: 'special', delivery_method: '자기주도형', started_at: '2026-10-28', ended_at: '2026-10-28', max_capacity: 100 }
];

(async () => {
  console.log(`\n총 ${COHORTS.length}개 cohort 등록 시도\n`);
  let created = 0, skipped = 0;
  for (const c of COHORTS) {
    const { data: existing } = await s.from('cohorts').select('id').eq('name', c.name).maybeSingle();
    if (existing) {
      console.log(`  · SKIP ${c.name}  (이미 존재)`);
      skipped++;
      continue;
    }
    const { error } = await s.from('cohorts').insert(c);
    if (error) {
      console.log(`  ✗ ERR ${c.name}: ${error.message}`);
      continue;
    }
    console.log(`  ✓ ${c.name}  (${c.started_at} ~ ${c.ended_at})`);
    created++;
  }
  console.log(`\n완료: 신규 ${created}, 스킵 ${skipped}, 실패 ${COHORTS.length - created - skipped}`);
})();

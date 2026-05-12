// 전문인재 1·2기의 multi-day 회차 expand 되돌리기.
//   각 title에 대해 session 2개(시작일·시작일+1) 중 두 번째 삭제 + 첫 번째 session_end_date 복원.
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

// title → { 1기 종료일, 2기 종료일 }
const REVERT: Record<string, { c1: string; c2: string }> = {
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

async function revertOne(cohortId: string, title: string, endDate: string) {
  const { data: rows } = await supabase
    .from('sessions')
    .select('id, session_date')
    .eq('cohort_id', cohortId)
    .eq('title', title)
    .order('session_date', { ascending: true });
  if (!rows || rows.length === 0) {
    console.log(`  [SKIP] ${title} (cohort=${cohortId.slice(0, 8)}) — 없음`);
    return;
  }
  // 첫 번째(시작일) 유지, 나머지(추가된 일자) 삭제
  const [first, ...extras] = rows;
  if (extras.length > 0) {
    const extraIds = extras.map((r) => r.id);
    const { error } = await supabase.from('sessions').delete().in('id', extraIds);
    if (error) {
      console.log(`  [ERR ] ${title} 삭제: ${error.message}`);
      return;
    }
  }
  // 첫 session에 session_end_date 복원
  const { error: upErr } = await supabase
    .from('sessions')
    .update({ session_end_date: endDate })
    .eq('id', first.id);
  if (upErr) {
    console.log(`  [ERR ] ${title} update: ${upErr.message}`);
    return;
  }
  console.log(
    `  ${title.padEnd(20)} cohort=${cohortId.slice(0, 8)} ${first.session_date} ~ ${endDate}  (-${extras.length} sessions)`
  );
}

async function main() {
  for (const [title, { c1, c2 }] of Object.entries(REVERT)) {
    await revertOne(COHORT1, title, c1);
    await revertOne(COHORT2, title, c2);
  }
  console.log('\n=== 복원 완료 ===');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

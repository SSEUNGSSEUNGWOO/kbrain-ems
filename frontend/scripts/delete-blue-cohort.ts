// 일회성 — 테스트 cohort "AI 챔피언 블루" wipe.
//   applications → students → cohorts 순서. 나머지 FK는 CASCADE로 자동 정리.
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

const BLUE_ID = '9ebfce13-037c-4f0d-a246-5d579bac8fcf';

async function main() {
  const cohort = await supabase.from('cohorts').select('id, name').eq('id', BLUE_ID).maybeSingle();
  if (!cohort.data) {
    console.log('블루 cohort 이미 없음.');
    return;
  }
  console.log(`타겟: ${cohort.data.name} (${cohort.data.id})`);

  // 사전 카운트
  const [appCount, stuCount, sessCount, asgCount, survCount] = await Promise.all([
    supabase.from('applications').select('id', { count: 'exact', head: true }).eq('cohort_id', BLUE_ID),
    supabase.from('students').select('id', { count: 'exact', head: true }).eq('cohort_id', BLUE_ID),
    supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('cohort_id', BLUE_ID),
    supabase.from('assignments').select('id', { count: 'exact', head: true }).eq('cohort_id', BLUE_ID),
    supabase.from('surveys').select('id', { count: 'exact', head: true }).eq('cohort_id', BLUE_ID)
  ]);
  console.log(`사전 카운트: applications=${appCount.count} students=${stuCount.count} sessions=${sessCount.count} assignments=${asgCount.count} surveys=${survCount.count}`);

  // 1) applications (RESTRICT — 명시 삭제)
  const a = await supabase.from('applications').delete().eq('cohort_id', BLUE_ID).select('id');
  console.log(`applications 삭제: ${a.data?.length ?? 0}건 (err=${a.error?.message ?? '-'})`);

  // 2) students (RESTRICT — 명시 삭제)
  const s = await supabase.from('students').delete().eq('cohort_id', BLUE_ID).select('id');
  console.log(`students 삭제: ${s.data?.length ?? 0}건 (err=${s.error?.message ?? '-'})`);

  // 3) cohort 본체 (CASCADE로 sessions/assignments/surveys/tracks 등 자동)
  const c = await supabase.from('cohorts').delete().eq('id', BLUE_ID).select('id, name');
  console.log(`cohorts 삭제: ${JSON.stringify(c.data)} (err=${c.error?.message ?? '-'})`);

  if (c.error) {
    console.error('cohort 삭제 실패 — 다른 FK가 막고 있을 가능성. 메시지 확인 필요.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

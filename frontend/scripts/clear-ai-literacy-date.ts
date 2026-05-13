// "AI 리터러시와 업무활용" 코호트: 일자 미정 처리 — started_at/ended_at NULL 및 세션 삭제.
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

const NAME = 'AI 리터러시와 업무활용';

const { data: cohorts, error: qErr } = await s
  .from('cohorts')
  .select('id, name, started_at, ended_at')
  .ilike('name', `%리터러시와 업무활용%`);

if (qErr) {
  console.error('조회 실패:', qErr.message);
  process.exit(1);
}

if (!cohorts || cohorts.length === 0) {
  console.log(`[NOT FOUND] "${NAME}" 매칭 cohort 없음`);
  process.exit(0);
}

for (const c of cohorts) {
  console.log(`[FOUND] ${c.name} (${c.id}) start=${c.started_at} end=${c.ended_at}`);

  const { data: sessions } = await s.from('sessions').select('id, session_date, title').eq('cohort_id', c.id);
  for (const sess of sessions ?? []) {
    console.log(`  └ session: ${sess.title} ${sess.session_date}`);
  }

  const { error: delErr } = await s.from('sessions').delete().eq('cohort_id', c.id);
  if (delErr) {
    console.error(`  [ERR] 세션 삭제 실패:`, delErr.message);
    continue;
  }
  console.log(`  ✓ 세션 ${sessions?.length ?? 0}개 삭제`);

  const { error: updErr } = await s
    .from('cohorts')
    .update({
      started_at: null,
      ended_at: null,
      application_start_at: null,
      application_end_at: null,
      decided_at: null,
      notified_at: null,
      recruitment_round_id: null
    })
    .eq('id', c.id);
  if (updErr) {
    console.error(`  [ERR] 날짜 NULL 실패:`, updErr.message);
    continue;
  }
  console.log(`  ✓ 일정·모집·라운드 매핑 모두 NULL`);
}

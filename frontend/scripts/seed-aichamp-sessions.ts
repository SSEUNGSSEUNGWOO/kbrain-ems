// AI 챔피언 그린·블루 11개 cohort에 종합과정 session 1개씩 + 메인 강사 매핑.
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

type Plan = { cohortName: string; date: string; instructorName: string };

const PLANS: Plan[] = [
  { cohortName: 'AI 챔피언 그린 26-1기', date: '2026-06-01', instructorName: '신성진' },
  { cohortName: 'AI 챔피언 그린 26-2기', date: '2026-06-15', instructorName: '현중균' },
  { cohortName: 'AI 챔피언 그린 26-3기', date: '2026-06-29', instructorName: '김태유' },
  { cohortName: 'AI 챔피언 그린 26-4기', date: '2026-07-13', instructorName: '이중균' },
  { cohortName: 'AI 챔피언 그린 26-5기', date: '2026-08-03', instructorName: '이중균' },
  { cohortName: 'AI 챔피언 그린 26-6기', date: '2026-09-14', instructorName: '김용재' },
  { cohortName: 'AI 챔피언 블루 26-1기', date: '2026-06-15', instructorName: '신성진' },
  { cohortName: 'AI 챔피언 블루 26-2기', date: '2026-06-22', instructorName: '이중균' },
  { cohortName: 'AI 챔피언 블루 26-3기', date: '2026-07-06', instructorName: '현중균' },
  { cohortName: 'AI 챔피언 블루 26-4기', date: '2026-07-20', instructorName: '김태유' },
  { cohortName: 'AI 챔피언 블루 26-5기', date: '2026-08-10', instructorName: '김용재' }
];

// 강사 이름 → id 매핑 fetch
const { data: ins } = await supabase.from('instructors').select('id, name');
const idByName = new Map((ins ?? []).map((i) => [i.name, i.id] as const));

for (const p of PLANS) {
  // cohort id
  const { data: c } = await supabase
    .from('cohorts')
    .select('id')
    .eq('name', p.cohortName)
    .maybeSingle();
  if (!c) {
    console.log(`[SKIP] ${p.cohortName} — cohort 없음`);
    continue;
  }
  const instructorId = idByName.get(p.instructorName);
  if (!instructorId) {
    console.log(`[SKIP] ${p.cohortName} — 강사 ${p.instructorName} 없음`);
    continue;
  }

  // 동일 cohort에 이미 session 있는지 확인 (재실행 안전)
  const { count } = await supabase
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .eq('cohort_id', c.id);
  if (count && count > 0) {
    console.log(`[SKIP] ${p.cohortName} — 이미 session ${count}개 있음`);
    continue;
  }

  // session insert
  const { data: sess, error: sErr } = await supabase
    .from('sessions')
    .insert({
      cohort_id: c.id,
      session_date: p.date,
      title: `${p.cohortName.replace(/^AI 챔피언 /, '').replace(/ 26-\d+기$/, '')} 종합과정`
    })
    .select('id')
    .single();
  if (sErr || !sess) {
    console.log(`[ERR ] ${p.cohortName}: ${sErr?.message}`);
    continue;
  }

  // session_instructors
  const { error: siErr } = await supabase.from('session_instructors').insert({
    session_id: sess.id,
    instructor_id: instructorId,
    role: 'main'
  });
  if (siErr) {
    console.log(`[ERR ] ${p.cohortName} session_instructors: ${siErr.message}`);
    continue;
  }

  console.log(`[OK  ] ${p.cohortName.padEnd(22)}  ${p.date}  ${p.instructorName}`);
}

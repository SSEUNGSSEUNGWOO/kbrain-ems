// session_end_date가 있는 multi-day session을 일별 sessions로 분리.
//   원본 session: session_date (시작일) 유지, session_end_date를 NULL로
//   추가 일자: 새 session + session_instructors 복제 + attendance_records 복제
//   동일 title 유지 (예: "[기술교육] 2회차"가 5/14, 5/15 두 row로)
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

function addDays(ymd: string, n: number): string {
  const d = new Date(ymd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string): number {
  const a = new Date(start + 'T00:00:00Z');
  const b = new Date(end + 'T00:00:00Z');
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

async function main() {
  const { data: multiDay } = await supabase
    .from('sessions')
    .select('id, cohort_id, session_date, session_end_date, title')
    .not('session_end_date', 'is', null);

  if (!multiDay || multiDay.length === 0) {
    console.log('분리 대상 없음.');
    return;
  }

  console.log(`분리 대상 ${multiDay.length}개 session\n`);

  for (const s of multiDay) {
    const gap = daysBetween(s.session_date, s.session_end_date!);
    if (gap <= 0) {
      // 종료일이 시작일과 같거나 잘못된 경우 — end_date만 null로
      await supabase.from('sessions').update({ session_end_date: null }).eq('id', s.id);
      continue;
    }

    // 강사·학생 list 한 번 fetch
    const [siRes, stuRes] = await Promise.all([
      supabase.from('session_instructors').select('instructor_id, role').eq('session_id', s.id),
      supabase.from('students').select('id').eq('cohort_id', s.cohort_id)
    ]);
    const siRows = siRes.data ?? [];
    const stuIds = (stuRes.data ?? []).map((r) => r.id);

    // 추가 일자 sessions
    let added = 0;
    for (let i = 1; i <= gap; i++) {
      const newDate = addDays(s.session_date, i);
      const { data: ns, error: nErr } = await supabase
        .from('sessions')
        .insert({ cohort_id: s.cohort_id, session_date: newDate, title: s.title })
        .select('id')
        .single();
      if (nErr || !ns) {
        console.log(`  [ERR] ${s.title} ${newDate}: ${nErr?.message}`);
        continue;
      }

      if (siRows.length > 0) {
        await supabase.from('session_instructors').insert(
          siRows.map((r) => ({
            session_id: ns.id,
            instructor_id: r.instructor_id,
            role: r.role
          }))
        );
      }
      if (stuIds.length > 0) {
        await supabase.from('attendance_records').insert(
          stuIds.map((id) => ({ session_id: ns.id, student_id: id, status: 'none' }))
        );
      }
      added++;
    }

    // 원본의 session_end_date null로
    await supabase.from('sessions').update({ session_end_date: null }).eq('id', s.id);
    console.log(`${s.title?.padEnd(22) ?? '-'.padEnd(22)}  ${s.session_date} ~ ${s.session_end_date}  +${added}일`);
  }

  console.log('\n=== 완료 ===');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

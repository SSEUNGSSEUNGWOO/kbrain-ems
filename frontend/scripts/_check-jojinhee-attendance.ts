import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const envPath = path.resolve(__dirname, '../.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  // 1) '[비공개]' 이름의 학생 모두
  const { data: students } = await supabase
    .from('students')
    .select('id, name, cohort_id, organizations(name), cohorts:cohort_id(name)')
    .eq('name', '[비공개]');

  console.log(`\n=== [비공개] 학생 row: ${students?.length ?? 0}건 ===`);
  for (const s of students ?? []) {
    const stu = s as unknown as {
      id: string;
      name: string;
      cohort_id: string;
      organizations: { name: string } | null;
      cohorts: { name: string } | null;
    };
    console.log(
      `  id=${stu.id} | cohort=${stu.cohorts?.name} | org=${stu.organizations?.name ?? '-'}`
    );
  }

  const studentIds = (students ?? []).map((s) => (s as { id: string }).id);
  if (studentIds.length === 0) {
    console.log('학생 매칭 실패. 이름이 다르거나 학생 등록 안 됨.');
    return;
  }

  // 2) 그 학생들의 진단 응답
  type Resp = {
    id: string;
    student_id: string;
    started_at: string | null;
    submitted_at: string | null;
    total_score: number | null;
    diagnoses: {
      id: string;
      title: string;
      type: string;
      attendance_check_id: string | null;
      duration_minutes: number;
    } | null;
  };
  const { data: responses } = await supabase
    .from('diagnosis_responses')
    .select(
      'id, student_id, started_at, submitted_at, total_score, diagnoses(id, title, type, attendance_check_id, duration_minutes)'
    )
    .in('student_id', studentIds)
    .returns<Resp[]>();

  console.log(`\n=== 진단 응답: ${responses?.length ?? 0}건 ===`);
  for (const r of responses ?? []) {
    console.log(
      `  resp=${r.id} | ${r.diagnoses?.type}/${r.diagnoses?.title}\n` +
        `    started=${r.started_at ?? 'NULL'}\n` +
        `    submitted=${r.submitted_at ?? 'NULL'}\n` +
        `    score=${r.total_score ?? '-'}\n` +
        `    attendance_check_id=${r.diagnoses?.attendance_check_id ?? 'NULL (출석 연동 X)'}`
    );
  }

  // 3) 연결된 attendance_check 들의 정보
  const checkIds = Array.from(
    new Set(
      (responses ?? [])
        .map((r) => r.diagnoses?.attendance_check_id)
        .filter((id): id is string => !!id)
    )
  );

  if (checkIds.length === 0) {
    console.log('\n!! 연결된 attendance_check 없음 — 출석 자동 연동이 애초에 동작 안 함.');
    console.log('   진단 페이지에서 "출석 자동 연동" 드롭다운으로 체크포인트를 먼저 연결해야 함.');
    return;
  }

  type Chk = {
    id: string;
    label: string;
    session_id: string;
    attendance_role: string | null;
    criterion_at: string | null;
    sessions: { session_date: string; title: string | null } | null;
  };
  const { data: checks } = await supabase
    .from('attendance_checks')
    .select('id, label, session_id, attendance_role, criterion_at, sessions(session_date, title)')
    .in('id', checkIds)
    .returns<Chk[]>();

  console.log(`\n=== 연결된 attendance_checks ===`);
  for (const c of checks ?? []) {
    console.log(
      `  check=${c.id} | ${c.sessions?.session_date} ${c.sessions?.title ?? ''} / ${c.label}\n` +
        `    attendance_role=${c.attendance_role ?? 'NULL (← 이 경우 출석 동기화 안 됨!)'}\n` +
        `    criterion_at=${c.criterion_at ?? 'NULL'}`
    );
  }

  // 4) attendance_check_records 에 [비공개] 기록 있나
  const { data: acrs } = await supabase
    .from('attendance_check_records')
    .select('check_id, student_id, checked_at')
    .in('check_id', checkIds)
    .in('student_id', studentIds);

  console.log(`\n=== attendance_check_records (체크인 로그) ===`);
  if (!acrs || acrs.length === 0) {
    console.log('  없음 — force_close 의 출석 INSERT 가 실행 안 됐다는 뜻.');
  } else {
    for (const a of acrs) {
      console.log(`  check=${a.check_id} student=${a.student_id} at=${a.checked_at}`);
    }
  }

  // 5) attendance_records (실제 출결)
  const sessionIds = Array.from(new Set((checks ?? []).map((c) => c.session_id)));
  const { data: arrs } = await supabase
    .from('attendance_records')
    .select('session_id, student_id, status, arrival_time, departure_time')
    .in('session_id', sessionIds)
    .in('student_id', studentIds);

  console.log(`\n=== attendance_records (출결 표) ===`);
  if (!arrs || arrs.length === 0) {
    console.log('  없음 — 출결표에 [비공개] 행 자체가 없음.');
  } else {
    for (const a of arrs) {
      console.log(
        `  session=${a.session_id} status=${a.status} arrival=${a.arrival_time ?? '-'} departure=${a.departure_time ?? '-'}`
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

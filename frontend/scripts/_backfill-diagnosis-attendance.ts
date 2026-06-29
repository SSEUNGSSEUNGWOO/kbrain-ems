// 진단 응답(submitted_at 있음)인데 attendance 연동이 누락된 학생들을 백필.
// 마이그레이션의 DO 블록과 동일 로직. 멱등.
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

type Resp = {
  id: string;
  student_id: string;
  started_at: string | null;
  submitted_at: string;
  diagnoses: {
    attendance_check_id: string;
  } | null;
};

type Chk = {
  id: string;
  session_id: string;
  attendance_role: string | null;
  criterion_at: string | null;
};

function toKstHHMM(iso: string): string {
  const d = new Date(iso);
  // UTC → KST
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const hh = String(kst.getUTCHours()).padStart(2, '0');
  const mm = String(kst.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}:00`;
}

async function main() {
  // 1) 후보 응답들 — submitted_at, student_id, attendance_check_id 모두 있어야 함
  const { data: responses, error } = await supabase
    .from('diagnosis_responses')
    .select('id, student_id, started_at, submitted_at, diagnoses(attendance_check_id)')
    .not('submitted_at', 'is', null)
    .not('student_id', 'is', null)
    .returns<Resp[]>();
  if (error) {
    console.error('responses query error:', error.message);
    process.exit(1);
  }

  const candidates = (responses ?? []).filter((r) => r.diagnoses?.attendance_check_id);
  console.log(`\n후보 응답 (submitted+student+attendance_check 모두 있음): ${candidates.length}건`);

  // 2) attendance_check 정보 미리 조회
  const checkIds = Array.from(
    new Set(candidates.map((r) => r.diagnoses!.attendance_check_id))
  );
  const { data: checks } = await supabase
    .from('attendance_checks')
    .select('id, session_id, attendance_role, criterion_at')
    .in('id', checkIds)
    .returns<Chk[]>();
  const checkMap = new Map((checks ?? []).map((c) => [c.id, c]));

  // 3) 이미 attendance_check_records 에 있는 (check_id, student_id) 집합 조회
  const pairs = candidates.map((r) => ({
    check_id: r.diagnoses!.attendance_check_id,
    student_id: r.student_id
  }));
  const existingSet = new Set<string>();
  // 한 번에 다 조회 (in 절은 OR — 별도 검증)
  const studentIds = Array.from(new Set(pairs.map((p) => p.student_id)));
  const { data: existing } = await supabase
    .from('attendance_check_records')
    .select('check_id, student_id')
    .in('check_id', checkIds)
    .in('student_id', studentIds);
  for (const e of existing ?? []) {
    existingSet.add(`${(e as { check_id: string }).check_id}::${(e as { student_id: string }).student_id}`);
  }

  // 4) 누락된 것만 처리
  const missing = candidates.filter(
    (r) => !existingSet.has(`${r.diagnoses!.attendance_check_id}::${r.student_id}`)
  );
  console.log(`이미 체크인된 것 제외, 백필 대상: ${missing.length}건\n`);

  let inserted = 0;
  let attRecordUpsert = 0;
  for (const r of missing) {
    const check = checkMap.get(r.diagnoses!.attendance_check_id);
    if (!check) continue;
    const at = r.started_at ?? r.submitted_at;

    // attendance_check_records 추가
    const { error: acrErr } = await supabase
      .from('attendance_check_records')
      .upsert(
        { check_id: check.id, student_id: r.student_id, checked_at: at },
        { onConflict: 'check_id,student_id', ignoreDuplicates: true }
      );
    if (acrErr) {
      console.error(`  [실패 acr] student=${r.student_id}: ${acrErr.message}`);
      continue;
    }
    inserted++;

    // attendance_records 동기화
    if (check.attendance_role === 'arrival') {
      const isLate = !!(check.criterion_at && new Date(at) > new Date(check.criterion_at));
      const { error: arErr } = await supabase
        .from('attendance_records')
        .upsert(
          {
            session_id: check.session_id,
            student_id: r.student_id,
            status: isLate ? 'late' : 'present',
            arrival_time: toKstHHMM(at)
          },
          { onConflict: 'session_id,student_id' }
        );
      if (arErr) console.error(`  [실패 ar arrival] student=${r.student_id}: ${arErr.message}`);
      else attRecordUpsert++;
    } else if (check.attendance_role === 'departure') {
      const { data: existingAr } = await supabase
        .from('attendance_records')
        .select('status')
        .eq('session_id', check.session_id)
        .eq('student_id', r.student_id)
        .maybeSingle();
      const { error: arErr } = await supabase
        .from('attendance_records')
        .upsert(
          {
            session_id: check.session_id,
            student_id: r.student_id,
            status: (existingAr as { status: string } | null)?.status ?? 'present',
            departure_time: toKstHHMM(r.submitted_at)
          },
          { onConflict: 'session_id,student_id' }
        );
      if (arErr) console.error(`  [실패 ar departure] student=${r.student_id}: ${arErr.message}`);
      else attRecordUpsert++;
    } else {
      console.log(`  [skip] check=${check.id} attendance_role=NULL → 출결표 업데이트 안 함`);
    }
  }

  console.log(`\n=== 결과 ===`);
  console.log(`attendance_check_records 신규: ${inserted}건`);
  console.log(`attendance_records 동기화: ${attRecordUpsert}건`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * attendance_checks.attendance_role 가 NULL이라 attendance_records 로 동기화가 안 된 케이스 백필.
 *
 * 정책:
 *  - 기존 attendance_records row 는 절대 건드리지 않는다 (덮어쓰기 금지).
 *  - 학생 단위로 attendance_records 가 없을 때만 INSERT.
 *  - role 추론: label에 "퇴실" → departure / "입실|출석" → arrival.
 *  - 같은 학생에 여러 입실 체크인이 있으면 가장 빠른 시각을 arrival_time으로 사용.
 *  - 같은 학생에 여러 퇴실 체크인이 있으면 가장 늦은 시각을 departure_time으로 사용.
 *  - status는 일단 'present' (criterion_at 비교는 안 함 — 안전 우선; 운영자가 필요 시 수동 보정).
 *
 * usage:
 *   bun run scripts/_backfill-attendance-records.ts          # dry-run
 *   bun run scripts/_backfill-attendance-records.ts --apply  # 실행
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

const APPLY = process.argv.includes('--apply');

function inferRole(label: string | null): 'arrival' | 'departure' | null {
  if (!label) return null;
  if (/퇴실/.test(label)) return 'departure';
  if (/입실|출석/.test(label)) return 'arrival';
  return null;
}

// HH:MM 추출 (UTC ISO를 KST로 변환)
function timeFromIso(iso: string): string {
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(11, 16);
}

async function main() {
  console.log(`mode: ${APPLY ? 'APPLY' : 'dry-run'}\n`);

  // role=null인 attendance_checks 조회
  const { data: nullChecks } = await s
    .from('attendance_checks')
    .select('id, session_id, label, criterion_at')
    .is('attendance_role', null);
  console.log(`role=null 체크포인트: ${nullChecks?.length ?? 0}개`);

  // session_id별로 그룹핑
  type CheckInfo = { id: string; label: string | null; role: 'arrival' | 'departure' | null };
  const checksBySession = new Map<string, CheckInfo[]>();
  for (const c of nullChecks ?? []) {
    const arr = checksBySession.get(c.session_id) ?? [];
    arr.push({ id: c.id, label: c.label, role: inferRole(c.label) });
    checksBySession.set(c.session_id, arr);
  }

  // 각 세션 처리
  let totalInsert = 0;
  let totalSkipExisting = 0;
  let totalSkipNoRole = 0;
  const sessionSummaries: string[] = [];

  for (const [sessionId, checks] of checksBySession) {
    // role 추론 실패한 check는 건너뜀
    const usable = checks.filter((c) => c.role !== null);
    const skippedChecks = checks.length - usable.length;

    if (usable.length === 0) {
      sessionSummaries.push(`${sessionId.slice(0, 8)} — role 추론 실패 (${skippedChecks}개 check 건너뜀)`);
      totalSkipNoRole += skippedChecks;
      continue;
    }

    // 이 세션의 모든 check_records (학생 + 시각) 가져오기
    const checkIds = usable.map((c) => c.id);
    const { data: checkRecs } = await s
      .from('attendance_check_records')
      .select('check_id, student_id, checked_at')
      .in('check_id', checkIds);

    // 학생별로 arrival_time(min) + departure_time(max) 집계
    type StudentTimes = { arrival?: string; departure?: string };
    const byStudent = new Map<string, StudentTimes>();
    for (const r of checkRecs ?? []) {
      const role = usable.find((c) => c.id === r.check_id)?.role;
      if (!role) continue;
      const t = timeFromIso(r.checked_at);
      const cur = byStudent.get(r.student_id) ?? {};
      if (role === 'arrival') {
        if (!cur.arrival || t < cur.arrival) cur.arrival = t;
      } else {
        if (!cur.departure || t > cur.departure) cur.departure = t;
      }
      byStudent.set(r.student_id, cur);
    }

    // 이 세션에 이미 attendance_records 있는 학생 ids
    const { data: existingAR } = await s
      .from('attendance_records')
      .select('student_id')
      .eq('session_id', sessionId);
    const existingStudentIds = new Set((existingAR ?? []).map((r) => r.student_id));

    // INSERT 대상 추리기
    const rowsToInsert: Array<{
      session_id: string;
      student_id: string;
      status: 'present';
      arrival_time: string | null;
      departure_time: string | null;
    }> = [];
    let skipCount = 0;
    for (const [studentId, times] of byStudent) {
      if (existingStudentIds.has(studentId)) {
        skipCount++;
        continue;
      }
      rowsToInsert.push({
        session_id: sessionId,
        student_id: studentId,
        status: 'present',
        arrival_time: times.arrival ?? null,
        departure_time: times.departure ?? null
      });
    }

    totalInsert += rowsToInsert.length;
    totalSkipExisting += skipCount;

    sessionSummaries.push(
      `${sessionId.slice(0, 8)}  insert=${rowsToInsert.length}  skip(이미있음)=${skipCount}`
    );

    if (!APPLY || rowsToInsert.length === 0) continue;

    // chunked insert (PostgREST max 1000)
    for (let i = 0; i < rowsToInsert.length; i += 500) {
      const slice = rowsToInsert.slice(i, i + 500);
      const { error } = await s.from('attendance_records').insert(slice);
      if (error) {
        console.error(`[ERR] session=${sessionId.slice(0, 8)} insert 실패:`, error.message);
        process.exit(1);
      }
    }
  }

  // 세션 정보 join하여 사람이 읽을 수 있게
  const sessionIds = [...checksBySession.keys()];
  const { data: sessions } = await s
    .from('sessions')
    .select('id, title, session_date, cohorts(name)')
    .in('id', sessionIds);
  const sessMap = new Map<string, any>();
  for (const sess of sessions ?? []) sessMap.set(sess.id, sess);

  console.log('\n=== 세션별 백필 결과 ===');
  for (const [sessionId, checks] of checksBySession) {
    const sess = sessMap.get(sessionId);
    const cName = sess?.cohorts?.name ?? '?';
    const sd = sess?.session_date ?? '?';
    const title = sess?.title ?? '?';
    const summary = sessionSummaries.find((s) => s.startsWith(sessionId.slice(0, 8))) ?? '';
    console.log(`  ${sd}  ${cName}  ${title}`);
    console.log(`     ${summary}`);
  }

  console.log(`\n=== 합계 ===`);
  console.log(`  새로 insert할 attendance_records: ${totalInsert}건`);
  console.log(`  기존 row 있어 skip: ${totalSkipExisting}건`);
  console.log(`  role 추론 실패로 건너뜀: ${totalSkipNoRole}개 check`);
  console.log(`\n완료${APPLY ? ' (apply)' : ' (dry-run)'}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

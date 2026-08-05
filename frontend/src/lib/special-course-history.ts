// 특화(그린/블루 종합과정) 이력 조회 — 자기주도형 선발 화면에서 지원자별로
// 특화 수료·미수료·미인증 여부를 뱃지로 보여주기 위한 집계.
// 수료 판정은 completion.ts 규칙과 동일: 집중 3일 이상 출석 + 인증평가 참여.
// (미수료·시험만 남음 = 집중은 채웠고 인증평가만 안 봄 → 이번 시험 응시 시
//  특화 수료 요건이 충족되어 수료증 추가 발급 대상)

import { createAdminClient } from '@/lib/supabase/server';
import { ATTENDED_STATUSES, ABSENT_STATUSES } from '@/lib/completion';
import { isTestStudent } from '@/lib/students';

export type SpecialHistoryStatus =
  | 'completed' // 수료 (집중 3일 + 인증평가 참여)
  | 'not_certified' // 수료했지만 인증 불합격 → 재응시 관리 대상
  | 'exam_only_left' // 집중 3일 채움 + 인증평가 미참여 → 시험만 보면 수료
  | 'insufficient'; // 집중교육 미달 → 시험 응시만으로는 수료 불가

export type SpecialHistory = {
  cohortName: string;
  status: SpecialHistoryStatus;
  attendedDays: number;
  requiredDays: number;
};

/** 종료된 특화 종합과정 전체를 훑어 applicant_id → 특화 이력 맵을 만든다. */
export async function getSpecialCourseHistoryByApplicant(): Promise<Map<string, SpecialHistory>> {
  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: specialCohorts } = await supabase
    .from('cohorts')
    .select('id, name, intensive_start_at, intensive_end_at')
    .ilike('name', '%종합과정%')
    .not('intensive_end_at', 'is', null)
    .lte('intensive_end_at', today);

  const result = new Map<string, SpecialHistory>();
  if (!specialCohorts || specialCohorts.length === 0) return result;

  for (const cohort of specialCohorts) {
    const [{ data: students }, { data: sessions }] = await Promise.all([
      supabase.from('students').select('id, name, applicant_id').eq('cohort_id', cohort.id),
      supabase
        .from('sessions')
        .select('id, session_date')
        .eq('cohort_id', cohort.id)
        .gte('session_date', cohort.intensive_start_at!)
        .lte('session_date', cohort.intensive_end_at!)
    ]);
    const real = (students ?? []).filter((s) => !isTestStudent(s.name));
    const sessionIds = (sessions ?? []).map((s) => s.id);
    if (real.length === 0 || sessionIds.length === 0) continue;

    const [{ data: att }, { data: checks }, certRes] = await Promise.all([
      supabase
        .from('attendance_records')
        .select('student_id, session_id, status')
        .in('session_id', sessionIds),
      supabase.from('attendance_checks').select('id, session_id').in('session_id', sessionIds),
      (
        supabase.from('certification_results' as unknown as 'cohorts') as unknown as {
          select: (cols: string) => {
            eq: (
              col: string,
              v: string
            ) => Promise<{ data: { student_id: string | null; passed: boolean | null }[] | null }>;
          };
        }
      )
        .select('student_id, passed')
        .eq('cohort_id', cohort.id)
    ]);

    const checkIds = (checks ?? []).map((c) => c.id);
    const checkRecords: { check_id: string; student_id: string }[] = [];
    if (checkIds.length > 0) {
      const { data } = await supabase
        .from('attendance_check_records')
        .select('check_id, student_id')
        .in('check_id', checkIds);
      checkRecords.push(...(data ?? []));
    }

    const attMap = new Map<string, string>();
    for (const a of att ?? []) attMap.set(`${a.student_id}__${a.session_id}`, a.status);
    const checksBySession = new Map<string, string[]>();
    for (const c of checks ?? []) {
      const arr = checksBySession.get(c.session_id) ?? [];
      arr.push(c.id);
      checksBySession.set(c.session_id, arr);
    }
    const myCheckIns = new Map<string, Set<string>>();
    for (const r of checkRecords) {
      const set = myCheckIns.get(r.student_id) ?? new Set<string>();
      set.add(r.check_id);
      myCheckIns.set(r.student_id, set);
    }
    const certByStudent = new Map<string, boolean | null>();
    for (const c of certRes.data ?? []) {
      if (c.student_id) certByStudent.set(c.student_id, c.passed);
    }

    const isAttended = (studentId: string, sessionId: string): boolean => {
      const status = attMap.get(`${studentId}__${sessionId}`);
      if (status && ATTENDED_STATUSES.has(status)) return true;
      if (status && ABSENT_STATUSES.has(status)) return false;
      const required = checksBySession.get(sessionId) ?? [];
      if (required.length === 0) return false;
      const mine = myCheckIns.get(studentId) ?? new Set<string>();
      return required.every((id) => mine.has(id));
    };

    for (const s of real) {
      if (!s.applicant_id) continue;
      const days = sessionIds.filter((id) => isAttended(s.id, id)).length;
      const tookExam = certByStudent.has(s.id);
      const passed = certByStudent.get(s.id);
      let status: SpecialHistoryStatus;
      if (days >= 3 && tookExam) status = passed === false ? 'not_certified' : 'completed';
      else if (days >= 3) status = 'exam_only_left';
      else status = 'insufficient';
      result.set(s.applicant_id, {
        cohortName: cohort.name,
        status,
        attendedDays: days,
        requiredDays: 3
      });
    }
  }
  return result;
}

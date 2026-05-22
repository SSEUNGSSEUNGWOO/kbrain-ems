// 회차(수업)별 결과보고서용 메타데이터 수집.
// 서버에서 직접 호출. scripts/session-report-data.ts CLI도 이 함수를 thin wrap만 함.
//
// 만족도 척도: likert5 / likert10 둘 다 처리. distribution은 척도에 맞게 길이 조정.

import { createAdminClient } from '@/lib/supabase/server';

const round = (n: number, digits = 2): number => {
  const p = 10 ** digits;
  return Math.round(n * p) / p;
};

const numOrNull = (v: string | number | null | undefined): number | null =>
  v === null || v === undefined ? null : Number(v);

export type SessionReportData = {
  generated_at: string;
  session: {
    id: string;
    no: number | null;
    cohort_id: string;
    cohort_name: string;
    cohort_category: string | null;
    date: string | null;
    title: string | null;
    start_time: string | null;
    end_time: string | null;
    break_minutes: number | null;
    break_start_time: string | null;
    break_end_time: string | null;
    total_hours_planned: number | null;
    location: string | null;
  };
  instructors: Array<{
    session_instructor_id: string;
    id: string | null;
    name: string | null;
    role: string | null;
    grade_code: string | null;
    grade_name: string | null;
    grade_hourly_rate: number | null;
    hours: number | null;
    fee: {
      hourly_rate: number | null;
      hours: number | null;
      calculated_amount: number | null;
      approved_amount: number | null;
      status: string | null;
    } | null;
  }>;
  attendance: {
    total: number;
    present: number;
    absent: number;
    rate: number | null;
    absentees: Array<{
      student_id: string;
      name: string | null;
      organization: string | null;
      status: string;
      note: string | null;
    }>;
  };
  surveys: Array<{
    id: string;
    title: string | null;
    type: string | null;
    n: number;
    denominator: number;
    response_rate: number | null;
    questions: Array<{
      question_no: number | null;
      section_no: number | null;
      section_title: string | null;
      text: string;
      type: string;
      instructor_id: string | null;
      instructor_name: string | null;
      avg: number | null;
      n: number | null;
      distribution: number[] | null;
      text_responses: string[] | null;
    }>;
  }>;
};

export async function collectSessionReportData(sessionId: string): Promise<SessionReportData> {
  const sb = createAdminClient();

  // ── 1) session + cohort ────────────────────────────────────────────────────
  const { data: session, error: sErr } = await sb
    .from('sessions')
    .select(
      'id, cohort_id, session_date, title, start_time, end_time, break_minutes, break_start_time, break_end_time, location_id, locations(name), cohorts(id, name, category)'
    )
    .eq('id', sessionId)
    .maybeSingle();
  if (sErr) throw sErr;
  if (!session) throw new Error(`session not found: ${sessionId}`);

  const cohort = (session as unknown as { cohorts: { id: string; name: string; category: string | null } })
    .cohorts;
  const location = (session as unknown as { locations: { name: string } | null }).locations;

  const { data: cohortSessions } = await sb
    .from('sessions')
    .select('id, session_date')
    .eq('cohort_id', cohort.id)
    .order('session_date');
  const sessionNo = (cohortSessions ?? []).findIndex((s) => s.id === sessionId) + 1 || null;

  let totalHoursPlanned: number | null = null;
  if (session.start_time && session.end_time) {
    const [sh, sm] = session.start_time.split(':').map(Number);
    const [eh, em] = session.end_time.split(':').map(Number);
    const grossMin = eh * 60 + em - (sh * 60 + sm);
    const breakMin = session.break_minutes ?? 0;
    totalHoursPlanned = round(Math.max(grossMin - breakMin, 0) / 60, 2);
  }

  // ── 2) instructors + 강사료 ────────────────────────────────────────────────
  const { data: instLinks } = await sb
    .from('session_instructors')
    .select(
      'id, instructor_id, role, hours, instructors(id, name, grade_id, instructor_grades(code, name, hourly_rate))'
    )
    .eq('session_id', sessionId);

  const sessionInstructorIds = (instLinks ?? []).map((l) => l.id);
  const { data: fees } = await sb
    .from('instructor_fees')
    .select(
      'session_instructor_id, hourly_rate, hours, calculated_amount, approved_amount, status'
    )
    .in(
      'session_instructor_id',
      sessionInstructorIds.length > 0 ? sessionInstructorIds : ['__none__']
    );
  type FeeRow = NonNullable<typeof fees>[number];
  const feeBySI = new Map<string, FeeRow>();
  for (const f of fees ?? []) feeBySI.set(f.session_instructor_id, f);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const instructors = (instLinks ?? []).map((l: any) => {
    const fee = feeBySI.get(l.id);
    const grade = l.instructors?.instructor_grades;
    return {
      session_instructor_id: l.id,
      id: l.instructors?.id ?? null,
      name: l.instructors?.name ?? null,
      role: l.role,
      grade_code: grade?.code ?? null,
      grade_name: grade?.name ?? null,
      grade_hourly_rate: numOrNull(grade?.hourly_rate ?? null),
      hours: numOrNull(l.hours),
      fee: fee
        ? {
            hourly_rate: numOrNull(fee.hourly_rate),
            hours: numOrNull(fee.hours),
            calculated_amount: numOrNull(fee.calculated_amount),
            approved_amount: numOrNull(fee.approved_amount),
            status: fee.status
          }
        : null
    };
  });

  // ── 3) 출결 + 미참석자 명단 ─────────────────────────────────────────────────
  const { data: records } = await sb
    .from('attendance_records')
    .select(
      'student_id, status, note, students(id, name, organization_id, organizations(name))'
    )
    .eq('session_id', sessionId);

  const attendees = records ?? [];
  const presentCount = attendees.filter((r) => r.status === 'present').length;
  const absentees = attendees
    .filter((r) => r.status !== 'present')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((r: any) => ({
      student_id: r.student_id,
      name: r.students?.name ?? null,
      organization: r.students?.organizations?.name ?? null,
      status: r.status,
      note: r.note
    }));
  const attendance = {
    total: attendees.length,
    present: presentCount,
    absent: attendees.length - presentCount,
    rate: attendees.length > 0 ? round((presentCount / attendees.length) * 100, 1) : null,
    absentees
  };

  // ── 4) 회차 매핑 만족도 설문 (likert5 + likert10 양쪽 처리) ────────────────
  const { data: surveys } = await sb
    .from('surveys')
    .select('id, title, type, respondent_total')
    .eq('session_id', sessionId);

  type LikertStat = { count: number; sum: number; distribution: number[]; scaleMax: number };
  const newStat = (scaleMax: number): LikertStat => ({
    count: 0,
    sum: 0,
    distribution: Array(scaleMax).fill(0),
    scaleMax
  });

  const scaleMaxOf = (qType: string): number =>
    qType === 'likert10' ? 10 : qType === 'likert5' ? 5 : 0;
  const isLikert = (qType: string): boolean => qType === 'likert5' || qType === 'likert10';

  const surveyList: SessionReportData['surveys'] = [];
  for (const sv of surveys ?? []) {
    const [{ data: qs }, { data: rs }] = await Promise.all([
      sb
        .from('survey_questions')
        .select(
          'id, question_no, type, text, section_no, section_title, instructor_id, instructors(name)'
        )
        .eq('survey_id', sv.id)
        .order('question_no'),
      sb
        .from('survey_responses')
        .select('responses')
        .eq('survey_id', sv.id)
        .not('submitted_at', 'is', null)
    ]);
    const submitted = rs ?? [];
    const denom = sv.respondent_total ?? attendance.total;
    const responseRate = denom > 0 ? round((submitted.length / denom) * 100, 1) : null;

    const qStats = new Map<string, LikertStat>();
    const qTexts = new Map<string, string[]>();
    for (const q of qs ?? []) {
      if (isLikert(q.type)) qStats.set(q.id, newStat(scaleMaxOf(q.type)));
      if (q.type === 'text') qTexts.set(q.id, []);
    }
    for (const r of submitted) {
      const obj = (r.responses ?? {}) as Record<string, unknown>;
      for (const q of qs ?? []) {
        const v = obj[q.id];
        if (v === undefined || v === null || v === '') continue;
        if (isLikert(q.type) && typeof v === 'number') {
          const s = qStats.get(q.id)!;
          if (v >= 1 && v <= s.scaleMax) {
            s.count += 1;
            s.sum += v;
            s.distribution[v - 1] += 1;
          }
        } else if (q.type === 'text' && typeof v === 'string' && v.trim().length > 0) {
          qTexts.get(q.id)?.push(v.trim());
        }
      }
    }

    surveyList.push({
      id: sv.id,
      title: sv.title,
      type: sv.type,
      n: submitted.length,
      denominator: denom,
      response_rate: responseRate,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      questions: (qs ?? []).map((q: any) => {
        const stat = qStats.get(q.id);
        const texts = qTexts.get(q.id);
        return {
          question_no: q.question_no,
          section_no: q.section_no,
          section_title: q.section_title,
          text: q.text,
          type: q.type,
          instructor_id: q.instructor_id,
          instructor_name: q.instructors?.name ?? null,
          avg: stat && stat.count > 0 ? round(stat.sum / stat.count, 2) : null,
          n: stat?.count ?? null,
          distribution: stat ? stat.distribution : null,
          text_responses: texts && texts.length > 0 ? texts : null
        };
      })
    });
  }

  return {
    generated_at: new Date().toISOString(),
    session: {
      id: session.id,
      no: sessionNo,
      cohort_id: cohort.id,
      cohort_name: cohort.name,
      cohort_category: cohort.category,
      date: session.session_date,
      title: session.title,
      start_time: session.start_time,
      end_time: session.end_time,
      break_minutes: session.break_minutes,
      break_start_time: session.break_start_time,
      break_end_time: session.break_end_time,
      total_hours_planned: totalHoursPlanned,
      location: location?.name ?? null
    },
    instructors,
    attendance,
    surveys: surveyList
  };
}

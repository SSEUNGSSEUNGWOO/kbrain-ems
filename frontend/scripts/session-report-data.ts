/**
 * 회차(수업)별 결과보고서용 메타데이터 수집.
 *
 * 사용:
 *   bun run scripts/session-report-data.ts <sessionId>
 *   bun run scripts/session-report-data.ts <sessionId> --out reports/foo.json
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import type { Database } from '../src/lib/supabase/types';

const envPath = path.resolve(__dirname, '../.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}

const args = process.argv.slice(2);
const sessionId = args[0];
const outIdx = args.indexOf('--out');
const outPath = outIdx >= 0 ? args[outIdx + 1] : null;
if (!sessionId) {
  console.error('Usage: bun run scripts/session-report-data.ts <sessionId> [--out path]');
  process.exit(1);
}

const sb = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const round = (n: number, digits = 2): number => {
  const p = 10 ** digits;
  return Math.round(n * p) / p;
};

const numOrNull = (v: string | number | null | undefined): number | null =>
  v === null || v === undefined ? null : Number(v);

// ── 1) session + cohort ────────────────────────────────────────────────────
const { data: session, error: sErr } = await sb
  .from('sessions')
  .select(
    'id, cohort_id, session_date, title, start_time, end_time, break_minutes, break_start_time, break_end_time, location_id, locations(name), cohorts(id, name, category)'
  )
  .eq('id', sessionId)
  .maybeSingle();
if (sErr) throw sErr;
if (!session) {
  console.error(`session not found: ${sessionId}`);
  process.exit(1);
}

const cohort = (session as unknown as { cohorts: { id: string; name: string; category: string | null } }).cohorts;
const location = (session as unknown as { locations: { name: string } | null }).locations;

// 회차 번호 — 해당 cohort의 sessions를 session_date 순으로 정렬한 후 위치
const { data: cohortSessions } = await sb
  .from('sessions')
  .select('id, session_date')
  .eq('cohort_id', cohort.id)
  .order('session_date');
const sessionNo =
  (cohortSessions ?? []).findIndex((s) => s.id === sessionId) + 1 || null;

// 총 계획 시간 (start_time ~ end_time - break)
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
  .in('session_instructor_id', sessionInstructorIds.length > 0 ? sessionInstructorIds : ['__none__']);
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

// ── 4) 회차 매핑 만족도 설문 ────────────────────────────────────────────────
const { data: surveys } = await sb
  .from('surveys')
  .select('id, title, type, respondent_total')
  .eq('session_id', sessionId);

type LikertStat = { count: number; sum: number; distribution: number[] };
const newStat = (): LikertStat => ({ count: 0, sum: 0, distribution: [0, 0, 0, 0, 0] });

const surveyList = [];
for (const sv of surveys ?? []) {
  const [{ data: qs }, { data: rs }] = await Promise.all([
    sb
      .from('survey_questions')
      .select('id, question_no, type, text, section_no, section_title, instructor_id')
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
    if (q.type === 'likert5') qStats.set(q.id, newStat());
    if (q.type === 'text') qTexts.set(q.id, []);
  }
  for (const r of submitted) {
    const obj = (r.responses ?? {}) as Record<string, unknown>;
    for (const q of qs ?? []) {
      const v = obj[q.id];
      if (v === undefined || v === null || v === '') continue;
      if (q.type === 'likert5' && typeof v === 'number' && v >= 1 && v <= 5) {
        const s = qStats.get(q.id)!;
        s.count += 1;
        s.sum += v;
        s.distribution[v - 1] += 1;
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
    questions: (qs ?? []).map((q) => {
      const stat = qStats.get(q.id);
      const texts = qTexts.get(q.id);
      return {
        question_no: q.question_no,
        section_no: q.section_no,
        section_title: q.section_title,
        text: q.text,
        type: q.type,
        instructor_id: q.instructor_id,
        avg: stat && stat.count > 0 ? round(stat.sum / stat.count, 2) : null,
        n: stat?.count ?? null,
        distribution: stat ? stat.distribution : null,
        text_responses: texts && texts.length > 0 ? texts : null
      };
    })
  });
}

// ── 출력 ────────────────────────────────────────────────────────────────────
const output = {
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

const json = JSON.stringify(output, null, 2);
if (outPath) {
  const abs = path.isAbsolute(outPath) ? outPath : path.resolve(process.cwd(), outPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, json, 'utf8');
  console.error(`saved → ${abs}`);
} else {
  process.stdout.write(json + '\n');
}

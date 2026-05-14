/**
 * 차수별 결과보고서용 메타데이터 수집.
 *
 * 사용:
 *   bun run scripts/cohort-report-data.ts <cohortId>          # stdout
 *   bun run scripts/cohort-report-data.ts <cohortId> --out reports/foo.json
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
const cohortId = args[0];
const outIdx = args.indexOf('--out');
const outPath = outIdx >= 0 ? args[outIdx + 1] : null;
if (!cohortId) {
  console.error('Usage: bun run scripts/cohort-report-data.ts <cohortId> [--out path]');
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

// ── 1) cohort ───────────────────────────────────────────────────────────────
const { data: cohort, error: cErr } = await sb
  .from('cohorts')
  .select(
    'id, name, category, started_at, ended_at, application_start_at, application_end_at, max_capacity, delivery_method'
  )
  .eq('id', cohortId)
  .maybeSingle();
if (cErr) throw cErr;
if (!cohort) {
  console.error(`cohort not found: ${cohortId}`);
  process.exit(1);
}

// ── 2) enrollment ───────────────────────────────────────────────────────────
const [{ count: applicantsN }, { count: selectedN }, { count: studentsN }] = await Promise.all([
  sb
    .from('applications')
    .select('id', { count: 'exact', head: true })
    .eq('cohort_id', cohortId),
  sb
    .from('applications')
    .select('id', { count: 'exact', head: true })
    .eq('cohort_id', cohortId)
    .eq('status', 'selected'),
  sb.from('students').select('id', { count: 'exact', head: true }).eq('cohort_id', cohortId)
]);
const enrollment = {
  applicants: applicantsN ?? 0,
  selected: selectedN ?? 0,
  enrolled: studentsN ?? 0,
  completed: null as number | null // 수료 판정 로직 미정 — 추후 출석 기준 충족 인원으로 산출
};

// ── 3) tracks ───────────────────────────────────────────────────────────────
const { data: tracks } = await sb
  .from('tracks')
  .select('id, code, name, display_order')
  .eq('cohort_id', cohortId)
  .order('display_order');

const { data: studentsForTrack } = await sb
  .from('students')
  .select('assigned_track_id')
  .eq('cohort_id', cohortId);

const trackCount = new Map<string, number>();
for (const s of studentsForTrack ?? []) {
  if (!s.assigned_track_id) continue;
  trackCount.set(s.assigned_track_id, (trackCount.get(s.assigned_track_id) ?? 0) + 1);
}
const trackList = (tracks ?? []).map((t) => ({
  code: t.code,
  name: t.name,
  student_count: trackCount.get(t.id) ?? 0
}));

// ── 4) sessions + attendance + instructors ──────────────────────────────────
const { data: sessions } = await sb
  .from('sessions')
  .select(
    'id, session_date, title, start_time, end_time, location_id, locations(name), session_instructors(instructor_id, role, hours, instructors(id, name, grade_id))'
  )
  .eq('cohort_id', cohortId)
  .order('session_date');

const sessionIds = (sessions ?? []).map((s) => s.id);
const { data: attendance } = await sb
  .from('attendance_records')
  .select('session_id, status, credited_hours')
  .in('session_id', sessionIds.length > 0 ? sessionIds : ['__none__']);

const attBySession = new Map<string, Record<string, number>>();
for (const a of attendance ?? []) {
  const m = attBySession.get(a.session_id) ?? {};
  m[a.status] = (m[a.status] ?? 0) + 1;
  attBySession.set(a.session_id, m);
}

const sessionList = (sessions ?? []).map((s, i) => {
  const counts = attBySession.get(s.id) ?? {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const present = counts['present'] ?? 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loc = (s as any).locations as { name: string } | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const instLinks = ((s as any).session_instructors ?? []) as Array<{
    instructor_id: string;
    role: string;
    hours: string | null;
    instructors: { id: string; name: string; grade_id: string | null } | null;
  }>;
  return {
    no: i + 1,
    id: s.id,
    title: s.title,
    date: s.session_date,
    start_time: s.start_time,
    end_time: s.end_time,
    location: loc?.name ?? null,
    instructors: instLinks
      .filter((l) => l.instructors)
      .map((l) => ({
        id: l.instructors!.id,
        name: l.instructors!.name,
        role: l.role,
        hours: l.hours ? Number(l.hours) : null
      })),
    attendance: {
      counts,
      total,
      present,
      rate: total > 0 ? round((present / total) * 100, 1) : null
    }
  };
});

const overallTotal = sessionList.reduce((a, s) => a + s.attendance.total, 0);
const overallPresent = sessionList.reduce((a, s) => a + s.attendance.present, 0);
const attendance_overall = {
  total_records: overallTotal,
  present_count: overallPresent,
  present_rate: overallTotal > 0 ? round((overallPresent / overallTotal) * 100, 1) : null
};

// ── 5) instructors aggregate ────────────────────────────────────────────────
const instAgg = new Map<
  string,
  { id: string; name: string; grade_id: string | null; sessions: number; hours: number }
>();
for (const s of sessionList) {
  for (const inst of s.instructors) {
    const cur = instAgg.get(inst.id) ?? {
      id: inst.id,
      name: inst.name,
      grade_id: null,
      sessions: 0,
      hours: 0
    };
    cur.sessions += 1;
    cur.hours += inst.hours ?? 0;
    instAgg.set(inst.id, cur);
  }
}
const gradeIds = [...new Set([...instAgg.values()].map((i) => i.grade_id).filter(Boolean))] as string[];
const gradeNameById = new Map<string, string>();
if (gradeIds.length > 0) {
  const { data: gs } = await sb
    .from('instructor_grades')
    .select('id, name')
    .in('id', gradeIds);
  for (const g of gs ?? []) gradeNameById.set(g.id, g.name);
}

// ── 6) surveys + responses ──────────────────────────────────────────────────
const { data: surveys } = await sb
  .from('surveys')
  .select('id, title, type, respondent_total')
  .eq('cohort_id', cohortId);

type LikertStat = { count: number; sum: number; distribution: number[] };
const newStat = (): LikertStat => ({ count: 0, sum: 0, distribution: [0, 0, 0, 0, 0] });

const surveyList = [];
const instructorSatisfaction = new Map<string, LikertStat>();

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

  const denom = sv.respondent_total ?? enrollment.enrolled;
  const responseRate = denom > 0 ? round((submitted.length / denom) * 100, 1) : null;

  const questionStats = new Map<string, LikertStat>();
  const textAnswers = new Map<string, string[]>();
  for (const q of qs ?? []) {
    if (q.type === 'likert5') questionStats.set(q.id, newStat());
    if (q.type === 'text') textAnswers.set(q.id, []);
  }

  for (const r of submitted) {
    const obj = (r.responses ?? {}) as Record<string, unknown>;
    for (const q of qs ?? []) {
      const v = obj[q.id];
      if (v === undefined || v === null || v === '') continue;
      if (q.type === 'likert5' && typeof v === 'number' && v >= 1 && v <= 5) {
        const s = questionStats.get(q.id)!;
        s.count += 1;
        s.sum += v;
        s.distribution[v - 1] += 1;
        if (q.instructor_id) {
          if (!instructorSatisfaction.has(q.instructor_id)) {
            instructorSatisfaction.set(q.instructor_id, newStat());
          }
          const is = instructorSatisfaction.get(q.instructor_id)!;
          is.count += 1;
          is.sum += v;
          is.distribution[v - 1] += 1;
        }
      } else if (q.type === 'text' && typeof v === 'string' && v.trim().length > 0) {
        textAnswers.get(q.id)?.push(v.trim());
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
      const stat = questionStats.get(q.id);
      const texts = textAnswers.get(q.id);
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

const instructors = [...instAgg.values()].map((i) => {
  const sat = instructorSatisfaction.get(i.id);
  return {
    id: i.id,
    name: i.name,
    grade: i.grade_id ? gradeNameById.get(i.grade_id) ?? null : null,
    session_count: i.sessions,
    hours_total: round(i.hours, 1),
    satisfaction: sat && sat.count > 0
      ? { avg: round(sat.sum / sat.count, 2), n: sat.count, distribution: sat.distribution }
      : null
  };
});

// ── 7) diagnoses (pre/post) ─────────────────────────────────────────────────
const { data: diags } = await sb
  .from('diagnoses')
  .select('id, title, type')
  .eq('cohort_id', cohortId);

const diagStat = async (diagId: string) => {
  const { data: rs } = await sb
    .from('diagnosis_responses')
    .select('total_score')
    .eq('diagnosis_id', diagId)
    .not('submitted_at', 'is', null);
  const scores = (rs ?? [])
    .map((r) => (r.total_score ? Number(r.total_score) : null))
    .filter((v): v is number => v !== null && !Number.isNaN(v));
  if (scores.length === 0) return null;
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((a, b) => a + (b - avg) ** 2, 0) / scores.length;
  return { avg: round(avg, 2), sd: round(Math.sqrt(variance), 2), n: scores.length };
};

let preStat = null;
let postStat = null;
for (const d of diags ?? []) {
  if (d.type === 'pre') preStat = await diagStat(d.id);
  if (d.type === 'post') postStat = await diagStat(d.id);
}
const diagnoses = {
  pre: preStat,
  post: postStat,
  delta: preStat && postStat ? round(postStat.avg - preStat.avg, 2) : null
};

// ── 8) assignments ──────────────────────────────────────────────────────────
const { data: assigns } = await sb
  .from('assignments')
  .select('id, title, due_date')
  .eq('cohort_id', cohortId);

const assignmentList = [];
for (const a of assigns ?? []) {
  const { data: subs } = await sb
    .from('assignment_submissions')
    .select('status')
    .eq('assignment_id', a.id);
  const submitted = (subs ?? []).filter((s) => s.status === 'submitted').length;
  const total = subs?.length ?? 0;
  assignmentList.push({
    title: a.title,
    due_date: a.due_date,
    submitted,
    total,
    rate: total > 0 ? round((submitted / total) * 100, 1) : null
  });
}

// ── 출력 ────────────────────────────────────────────────────────────────────
const output = {
  generated_at: new Date().toISOString(),
  cohort,
  enrollment,
  tracks: trackList,
  sessions: sessionList,
  attendance_overall,
  instructors,
  surveys: surveyList,
  diagnoses,
  assignments: assignmentList
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

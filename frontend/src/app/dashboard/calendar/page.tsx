import PageContainer from '@/components/layout/page-container';
import { createAdminClient } from '@/lib/supabase/server';
import { computeAssistantSchedule } from '@/lib/assistant-schedule';
import { Calendar } from './_components/calendar';

type Props = {
  searchParams: Promise<{ ym?: string }>;
};

export default async function CalendarPage({ searchParams }: Props) {
  const { ym } = await searchParams;
  const today = new Date();
  const [yStr, mStr] = (ym ?? '').split('-');
  const year = Number.parseInt(yStr ?? '', 10) || today.getFullYear();
  const month = Number.parseInt(mStr ?? '', 10) || today.getMonth() + 1; // 1-12

  const supabase = createAdminClient();

  const [cohortsRes, sessionsRes, roundsRes] = await Promise.all([
    supabase
      .from('cohorts')
      .select(
        'id, name, application_start_at, application_end_at, decided_at, notified_at, orientation_date, started_at, ended_at, recruitment_round_id, delivery_method'
      ),
    supabase
      .from('sessions')
      .select('id, cohort_id, session_date, session_end_date, title, session_instructors(instructors(name))'),
    supabase
      .from('recruitment_rounds')
      .select('id, round_no, label, application_start_at, application_end_at, selection_at, announce_at')
      .order('round_no')
  ]);

  const cohorts = cohortsRes.data ?? [];
  const sessions = sessionsRes.data ?? [];
  const rounds = roundsRes.data ?? [];

  // 보조강사 필요 시간을 session 단위로 미리 계산
  const sessionsByCohort = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const arr = sessionsByCohort.get(s.cohort_id) ?? [];
    arr.push(s);
    sessionsByCohort.set(s.cohort_id, arr);
  }
  const assistantById = new Map<string, { needed: boolean; timeRange: string }>();
  for (const c of cohorts) {
    const cs = sessionsByCohort.get(c.id) ?? [];
    const map = computeAssistantSchedule(c.delivery_method, cs);
    for (const [id, v] of map) {
      assistantById.set(id, { needed: v.needed, timeRange: v.timeRange });
    }
  }

  return (
    <PageContainer pageTitle='캘린더' pageDescription='등록된 모든 일정을 한눈에'>
      <Calendar
        year={year}
        month={month}
        cohorts={cohorts.map((c) => ({
          id: c.id,
          name: c.name,
          application_start_at: c.application_start_at,
          application_end_at: c.application_end_at,
          decided_at: c.decided_at,
          notified_at: c.notified_at,
          orientation_date: c.orientation_date,
          started_at: c.started_at,
          ended_at: c.ended_at,
          recruitment_round_id: c.recruitment_round_id
        }))}
        sessions={sessions.map((s) => {
          const a = assistantById.get(s.id);
          return {
            id: s.id,
            cohort_id: s.cohort_id,
            session_date: s.session_date,
            session_end_date: s.session_end_date,
            title: s.title,
            instructors: (s.session_instructors ?? [])
              .map((si) => si.instructors?.name)
              .filter((n): n is string => !!n),
            assistant_needed: a?.needed ?? false,
            assistant_time_range: a?.timeRange ?? '—'
          };
        })}
        rounds={rounds.map((r) => ({
          id: r.id,
          round_no: r.round_no,
          label: r.label,
          application_start_at: r.application_start_at,
          application_end_at: r.application_end_at,
          selection_at: r.selection_at,
          announce_at: r.announce_at
        }))}
      />
    </PageContainer>
  );
}

import PageContainer from '@/components/layout/page-container';
import { createAdminClient } from '@/lib/supabase/server';
import { computeAssistantSchedule } from '@/lib/assistant-schedule';
import { Calendar } from './_components/calendar';
import { CalendarEventManager } from './_components/event-manager';
import { Timeline } from './_components/timeline';

type Props = {
  searchParams: Promise<{ ym?: string; view?: string }>;
};

export default async function CalendarPage({ searchParams }: Props) {
  const { ym, view } = await searchParams;
  const today = new Date();
  const [yStr, mStr] = (ym ?? '').split('-');
  const year = Number.parseInt(yStr ?? '', 10) || today.getFullYear();
  const month = Number.parseInt(mStr ?? '', 10) || today.getMonth() + 1; // 1-12
  const isTimeline = view === 'timeline';

  const supabase = createAdminClient();

  const [cohortsRes, sessionsRes, roundsRes, calendarEventsRes] = await Promise.all([
    supabase
      .from('cohorts')
      .select(
        'id, name, application_start_at, application_end_at, decided_at, notified_at, orientation_date, pre_online_start_at, pre_online_end_at, certification_start_at, certification_end_at, self_study_start_at, self_study_end_at, intensive_start_at, intensive_end_at, started_at, ended_at, recruitment_round_id, delivery_method'
      ),
    supabase
      .from('sessions')
      .select(
        'id, cohort_id, session_date, session_end_date, title, session_instructors(role, instructors(name, kind))'
      ),
    supabase
      .from('recruitment_rounds')
      .select(
        'id, round_no, label, application_start_at, application_end_at, selection_at, announce_at'
      )
      .order('round_no'),
    supabase
      .from('calendar_events')
      .select('id, title, event_date, event_time, category, capacity, notes')
      .order('event_date')
      .order('title')
  ]);

  const cohorts = cohortsRes.data ?? [];
  const sessions = sessionsRes.data ?? [];
  const rounds = roundsRes.data ?? [];
  const calendarEvents = calendarEventsRes.data ?? [];

  // 보조강사 필요 시간을 session 단위로 미리 계산
  const sessionsByCohort = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const arr = sessionsByCohort.get(s.cohort_id) ?? [];
    arr.push(s);
    sessionsByCohort.set(s.cohort_id, arr);
  }
  const assistantById = new Map<string, { needed: boolean }>();
  for (const c of cohorts) {
    const cs = sessionsByCohort.get(c.id) ?? [];
    const map = computeAssistantSchedule(c.delivery_method, cs);
    for (const [id, v] of map) {
      assistantById.set(id, { needed: v.needed });
    }
  }

  const cohortSlim = cohorts.map((c) => ({
    id: c.id,
    name: c.name,
    application_start_at: c.application_start_at,
    application_end_at: c.application_end_at,
    decided_at: c.decided_at,
    notified_at: c.notified_at,
    orientation_date: c.orientation_date,
    pre_online_start_at: c.pre_online_start_at,
    pre_online_end_at: c.pre_online_end_at,
    certification_start_at: c.certification_start_at,
    certification_end_at: c.certification_end_at,
    self_study_start_at: c.self_study_start_at,
    self_study_end_at: c.self_study_end_at,
    intensive_start_at: c.intensive_start_at,
    intensive_end_at: c.intensive_end_at,
    started_at: c.started_at,
    ended_at: c.ended_at,
    recruitment_round_id: c.recruitment_round_id
  }));
  const roundSlim = rounds.map((r) => ({
    id: r.id,
    round_no: r.round_no,
    label: r.label,
    application_start_at: r.application_start_at,
    application_end_at: r.application_end_at,
    selection_at: r.selection_at,
    announce_at: r.announce_at
  }));

  const eventManager = <CalendarEventManager events={calendarEvents} />;

  if (isTimeline) {
    return (
      <PageContainer
        pageTitle='캘린더'
        pageDescription='등록된 모든 일정을 한눈에'
        pageHeaderAction={eventManager}
      >
        <Timeline year={year} month={month} cohorts={cohortSlim} rounds={roundSlim} />
      </PageContainer>
    );
  }

  return (
    <PageContainer
      pageTitle='캘린더'
      pageDescription='등록된 모든 일정을 한눈에'
      pageHeaderAction={eventManager}
    >
      <Calendar
        year={year}
        month={month}
        cohorts={cohortSlim}
        sessions={sessions.map((s) => {
          const a = assistantById.get(s.id);
          const si = (s.session_instructors ?? []) as unknown as {
            role: string | null;
            instructors: { name: string; kind: string } | null;
          }[];
          const mains = si
            .filter((x) => x.instructors && (x.role ?? 'main') === 'main')
            .map((x) => x.instructors!.name);
          const subs = si
            .filter((x) => x.instructors && x.role === 'sub')
            .map((x) => x.instructors!.name);
          return {
            id: s.id,
            cohort_id: s.cohort_id,
            session_date: s.session_date,
            session_end_date: s.session_end_date,
            title: s.title,
            instructors: mains,
            assistants: subs,
            assistant_needed: a?.needed ?? false
          };
        })}
        rounds={roundSlim}
        calendarEvents={calendarEvents.map((e) => ({
          id: e.id,
          title: e.title,
          event_date: e.event_date,
          event_time: e.event_time,
          category: e.category,
          capacity: e.capacity
        }))}
      />
    </PageContainer>
  );
}

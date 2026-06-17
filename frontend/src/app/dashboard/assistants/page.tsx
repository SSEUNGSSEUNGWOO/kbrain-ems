import PageContainer from '@/components/layout/page-container';
import { createAdminClient } from '@/lib/supabase/server';
import { AssistantsMatrix } from './_components/assistants-matrix';

type Props = {
  searchParams: Promise<{ ym?: string }>;
};

export const dynamic = 'force-dynamic';

function ymFromSearch(ym: string | undefined): { year: number; month: number } {
  const now = new Date();
  if (ym) {
    const m = ym.match(/^(\d{4})-(\d{1,2})$/);
    if (m) {
      const y = Number(m[1]);
      const mo = Number(m[2]);
      if (mo >= 1 && mo <= 12) return { year: y, month: mo };
    }
  }
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function monthRange(year: number, month: number): { start: string; end: string } {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  return { start, end: next };
}

function eachWeekday(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${endIso}T00:00:00`);
  while (cur <= end) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) {
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, '0');
      const d = String(cur.getDate()).padStart(2, '0');
      out.push(`${y}-${m}-${d}`);
    }
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function withinMonth(iso: string, start: string, end: string): boolean {
  return iso >= start && iso < end;
}

export default async function AssistantsPage({ searchParams }: Props) {
  const { ym } = await searchParams;
  const { year, month } = ymFromSearch(ym);
  const { start, end } = monthRange(year, month);

  const supabase = createAdminClient();

  const [assistantsRes, sessionsRes, cohortsRes, externalEventsRes, selfStudyAsgRes] =
    await Promise.all([
      supabase.from('instructors').select('id, name').eq('kind', 'sub').order('name'),
      supabase
        .from('sessions')
        .select(
          'id, session_date, title, cohort_id, assistant_not_required, cohorts(name), session_instructors(instructor_id, role)'
        )
        .gte('session_date', start)
        .lt('session_date', end),
      supabase
        .from('cohorts')
        .select('id, name, self_study_start_at, self_study_end_at')
        .not('self_study_start_at', 'is', null)
        .not('self_study_end_at', 'is', null),
      supabase
        .from('assistant_external_events')
        .select(
          'id, on_date, title, organization, required_count, assistant_external_assignments(instructor_id)'
        )
        .gte('on_date', start)
        .lt('on_date', end),
      supabase
        .from('cohort_self_study_assignments')
        .select('cohort_id, on_date, instructor_id')
        .gte('on_date', start)
        .lt('on_date', end)
    ]);

  const assistants = assistantsRes.data ?? [];

  type RowSession = {
    id: string;
    session_date: string;
    title: string | null;
    cohort_id: string;
    assistant_not_required: boolean;
    cohorts: { name: string } | null;
    session_instructors: { instructor_id: string; role: string | null }[];
  };

  type RowExternal = {
    id: string;
    on_date: string;
    title: string;
    organization: string | null;
    required_count: number;
    assistant_external_assignments: { instructor_id: string }[];
  };

  type SelfAsg = { cohort_id: string; on_date: string; instructor_id: string };

  // 셀프스터디 배정 매핑 (cohort_id, on_date) → [instructor_id]
  const selfAsgMap = new Map<string, string[]>();
  for (const a of ((selfStudyAsgRes.data ?? []) as unknown as SelfAsg[])) {
    const k = `${a.cohort_id}::${a.on_date}`;
    const arr = selfAsgMap.get(k) ?? [];
    arr.push(a.instructor_id);
    selfAsgMap.set(k, arr);
  }

  // 통합 row
  type Row = {
    id: string;
    realSessionId: string | null;
    externalEventId: string | null;
    selfStudy: { cohortId: string; onDate: string } | null;
    date: string;
    title: string;
    cohortId: string;
    cohortName: string;
    assignedAssistantIds: string[];
    kind: 'lesson' | 'selfstudy' | 'external';
    notRequired: boolean;
  };
  const rows: Row[] = [];

  // 1) sessions — OT 는 자동 스킵
  for (const s of ((sessionsRes.data ?? []) as unknown as RowSession[])) {
    const title = s.title ?? '';
    if (/OT|오리엔테이션/i.test(title)) continue;
    const subIds = s.session_instructors
      .filter((si) => si.role === 'sub')
      .map((si) => si.instructor_id);
    rows.push({
      id: s.id,
      realSessionId: s.id,
      externalEventId: null,
      selfStudy: null,
      date: s.session_date,
      title,
      cohortId: s.cohort_id,
      cohortName: s.cohorts?.name ?? '',
      assignedAssistantIds: subIds,
      kind: 'lesson',
      notRequired: s.assistant_not_required
    });
  }

  // 2) 셀프스터디 — cohorts.self_study_* 평일 펼침, 매일별 배정
  for (const c of ((cohortsRes.data ?? []) as any[])) {
    const days = eachWeekday(c.self_study_start_at, c.self_study_end_at);
    for (const d of days) {
      if (!withinMonth(d, start, end)) continue;
      const assigned = selfAsgMap.get(`${c.id}::${d}`) ?? [];
      rows.push({
        id: `selfstudy::${c.id}::${d}`,
        realSessionId: null,
        externalEventId: null,
        selfStudy: { cohortId: c.id, onDate: d },
        date: d,
        title: '셀프스터디',
        cohortId: c.id,
        cohortName: c.name,
        assignedAssistantIds: assigned,
        kind: 'selfstudy',
        notRequired: false
      });
    }
  }

  // 3) 외부 일정
  for (const e of ((externalEventsRes.data ?? []) as unknown as RowExternal[])) {
    const assigned = (e.assistant_external_assignments ?? []).map((x) => x.instructor_id);
    rows.push({
      id: `external::${e.id}`,
      realSessionId: null,
      externalEventId: e.id,
      selfStudy: null,
      date: e.on_date,
      title: e.title,
      cohortId: `external::${e.id}`,
      cohortName: e.organization ?? e.title,
      assignedAssistantIds: assigned,
      kind: 'external',
      notRequired: false
    });
  }

  // 정렬: 날짜 → 종류(lesson > external > selfstudy) → 이름
  const KIND_ORDER: Record<string, number> = { lesson: 0, external: 1, selfstudy: 2 };
  rows.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.kind !== b.kind) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    return a.cohortName.localeCompare(b.cohortName, 'ko');
  });

  // 인원별 배정 건수 — 모든 소스 합산 (실제 배정만, notRequired 제외)
  const countById = new Map<string, number>();
  for (const r of rows) {
    if (r.notRequired) continue;
    for (const id of r.assignedAssistantIds) {
      countById.set(id, (countById.get(id) ?? 0) + 1);
    }
  }
  const assistantsWithCount = assistants.map((a) => ({
    id: a.id,
    name: a.name,
    count: countById.get(a.id) ?? 0
  }));

  return (
    <PageContainer
      pageTitle='보조강사 배정'
      pageDescription='EMS sessions · 셀프스터디 · 외부 일정 통합. 매일 1 row 정규화, 클릭 즉시 저장.'
    >
      <AssistantsMatrix
        year={year}
        month={month}
        assistants={assistantsWithCount}
        rows={rows}
      />
    </PageContainer>
  );
}

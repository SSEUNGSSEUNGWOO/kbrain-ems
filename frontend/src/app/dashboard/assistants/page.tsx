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

// inclusive 양 끝 날짜 사이의 평일(월~금) 만 yyyy-MM-dd 로 반환.
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

  const [assistantsRes, sessionsRes, cohortsRes] = await Promise.all([
    supabase.from('instructors').select('id, name').eq('kind', 'sub').order('name'),
    // 다일 회차는 매일 row 로 정규화 (split-multiday 일회성 적용 + 향후 정책 동일)
    supabase
      .from('sessions')
      .select(
        'id, session_date, title, cohort_id, cohorts(name), session_instructors(instructor_id, role)'
      )
      .gte('session_date', start)
      .lt('session_date', end),
    // 셀프스터디 가상 row 용: 이 달과 겹치는 self_study_* 기간
    supabase
      .from('cohorts')
      .select('id, name, self_study_start_at, self_study_end_at')
      .not('self_study_start_at', 'is', null)
      .not('self_study_end_at', 'is', null)
  ]);

  const assistants = assistantsRes.data ?? [];

  type SessionRow = {
    id: string;
    session_date: string;
    title: string | null;
    cohort_id: string;
    cohorts: { name: string } | null;
    session_instructors: { instructor_id: string; role: string | null }[];
  };

  type VirtualRow = {
    // 가상 row 는 실제 sessions row 가 없으므로 id 가 prefixed.
    id: string;
    realSessionId: string | null; // 실제 session id (배정 토글 가능 여부 판정)
    date: string;
    title: string;
    cohortId: string;
    cohortName: string;
    assignedAssistantIds: string[];
    availableNote: string;
    kind: 'lesson' | 'ot' | 'selfstudy';
    isVirtual: boolean; // true 면 보조강사 토글 비활성 (셀프스터디 가상 row 등)
  };

  const rows: VirtualRow[] = [];

  // 1) 실제 sessions — 매일 row 1개. OT 는 보조강사 배정 대상이 아니라 스킵.
  for (const s of ((sessionsRes.data ?? []) as unknown as SessionRow[])) {
    const title = s.title ?? '';
    if (/OT|오리엔테이션/i.test(title)) continue;
    const subIds = s.session_instructors
      .filter((si) => si.role === 'sub')
      .map((si) => si.instructor_id);
    rows.push({
      id: s.id,
      realSessionId: s.id,
      date: s.session_date,
      title,
      cohortId: s.cohort_id,
      cohortName: s.cohorts?.name ?? '',
      assignedAssistantIds: subIds,
      availableNote: '',
      kind: 'lesson',
      isVirtual: false
    });
  }

  // 2) 셀프스터디 가상 row — cohorts.self_study_start_at ~ end_at 의 평일
  for (const c of ((cohortsRes.data ?? []) as any[])) {
    const days = eachWeekday(c.self_study_start_at, c.self_study_end_at);
    for (const d of days) {
      if (!withinMonth(d, start, end)) continue;
      rows.push({
        id: `selfstudy::${c.id}::${d}`,
        realSessionId: null,
        date: d,
        title: '셀프스터디',
        cohortId: c.id,
        cohortName: c.name,
        assignedAssistantIds: [],
        availableNote: '',
        kind: 'selfstudy',
        isVirtual: true
      });
    }
  }

  // 정렬: 날짜 → 종류(lesson > selfstudy) → cohort 이름
  const KIND_ORDER: Record<string, number> = { lesson: 0, ot: 1, selfstudy: 2 };
  rows.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.kind !== b.kind) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    return a.cohortName.localeCompare(b.cohortName, 'ko');
  });

  // 인원별 이달 배정 건수 — 실제 session_instructors 만 카운트
  const countById = new Map<string, number>();
  for (const r of rows) {
    if (r.isVirtual) continue;
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
      pageDescription='EMS sessions 매일 1 row 정규화 · 클릭으로 즉시 저장. OT 는 배정 대상 X, 셀프스터디는 cohorts.self_study_*에서 가상 표시.'
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

'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { Icons } from '@/components/icons';

type Cohort = {
  id: string;
  name: string;
  application_start_at: string | null;
  application_end_at: string | null;
  decided_at: string | null;
  notified_at: string | null;
  orientation_date: string | null;
  started_at: string | null;
  ended_at: string | null;
};

type SessionRow = {
  id: string;
  cohort_id: string;
  session_date: string;
  session_end_date: string | null;
  title: string | null;
  instructors: string[];
};

type Props = {
  year: number;
  month: number; // 1-12
  cohorts: Cohort[];
  sessions: SessionRow[];
};

type EventKind = 'recruit' | 'decided' | 'notified' | 'orientation' | 'session';


const KIND_DOT: Record<EventKind, string> = {
  recruit: 'bg-orange-500',
  decided: 'bg-amber-500',
  notified: 'bg-yellow-400',
  orientation: 'bg-violet-500',
  session: 'bg-blue-500'
};
const KIND_STRIP: Record<EventKind, string> = {
  recruit: 'bg-orange-200/80 text-orange-900 dark:bg-orange-900/40 dark:text-orange-100',
  decided: 'bg-amber-300/80 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100',
  notified: 'bg-yellow-300/80 text-yellow-900 dark:bg-yellow-900/50 dark:text-yellow-100',
  orientation: 'bg-violet-300/80 text-violet-900 dark:bg-violet-900/50 dark:text-violet-100',
  session: 'bg-blue-300/80 text-blue-900 dark:bg-blue-900/50 dark:text-blue-100'
};
const KIND_LABEL: Record<EventKind, string> = {
  recruit: '모집',
  decided: '선발',
  notified: '통보',
  orientation: 'OT',
  session: '수업'
};

const DOW = ['일', '월', '화', '수', '목', '금', '토'] as const;
const DOW_COLOR = ['text-red-500', '', '', '', '', '', 'text-blue-500'];

// 한국 공휴일 (수업 없는 날). 필요 시 여기에 추가.
const HOLIDAYS: Record<string, string> = {
  '2026-06-03': '지방선거'
};

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function* daysInRange(start: string, end: string): Generator<string> {
  const a = new Date(start + 'T00:00:00Z');
  const b = new Date(end + 'T00:00:00Z');
  while (a <= b) {
    yield ymd(a);
    a.setUTCDate(a.getUTCDate() + 1);
  }
}

export function Calendar({ year, month, cohorts, sessions }: Props) {
  // 월 그리드 (일요일 시작, 6주)
  const grid = useMemo(() => {
    const first = new Date(Date.UTC(year, month - 1, 1));
    const startOfGrid = new Date(first);
    startOfGrid.setUTCDate(1 - first.getUTCDay()); // 일요일까지 back
    const cells: string[] = [];
    const cur = new Date(startOfGrid);
    for (let i = 0; i < 42; i++) {
      cells.push(ymd(cur));
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return cells;
  }, [year, month]);

  // 이벤트 instance 빌드 (cohortId+kind+optional sessionId가 같은 이벤트는 하나의 instance)
  type Instance = {
    key: string;
    start: string;
    end: string;
    kind: EventKind;
    cohortId: string;
    cohortName: string;
    label: string;
    href: string;
  };
  const instances = useMemo<Instance[]>(() => {
    const out: Instance[] = [];
    for (const c of cohorts) {
      const cohortHref = `/dashboard/cohorts/${c.id}`;
      if (c.application_start_at && c.application_end_at) {
        out.push({
          key: `recruit::${c.id}`,
          start: c.application_start_at,
          end: c.application_end_at,
          kind: 'recruit',
          cohortId: c.id,
          cohortName: c.name,
          label: `${c.name} 모집`,
          href: cohortHref
        });
      }
      if (c.decided_at) {
        out.push({
          key: `decided::${c.id}`,
          start: c.decided_at,
          end: c.decided_at,
          kind: 'decided',
          cohortId: c.id,
          cohortName: c.name,
          label: `${c.name} 선발`,
          href: cohortHref
        });
      }
      if (c.notified_at) {
        out.push({
          key: `notified::${c.id}`,
          start: c.notified_at,
          end: c.notified_at,
          kind: 'notified',
          cohortId: c.id,
          cohortName: c.name,
          label: `${c.name} 통보`,
          href: cohortHref
        });
      }
      if (c.orientation_date) {
        out.push({
          key: `orient::${c.id}`,
          start: c.orientation_date,
          end: c.orientation_date,
          kind: 'orientation',
          cohortId: c.id,
          cohortName: c.name,
          label: `${c.name} OT`,
          href: cohortHref
        });
      }
    }
    const cohortNameById = new Map(cohorts.map((c) => [c.id, c.name]));
    for (const s of sessions) {
      const cohortName = cohortNameById.get(s.cohort_id) ?? '';
      const lab = [s.title ?? '수업', s.instructors.join('·')].filter(Boolean).join(' · ');
      out.push({
        key: `session::${s.id}`,
        start: s.session_date,
        end: s.session_end_date ?? s.session_date,
        kind: 'session',
        cohortId: s.cohort_id,
        cohortName,
        label: `${cohortName} · ${lab}`,
        href: `/dashboard/cohorts/${s.cohort_id}/lessons/${s.id}`
      });
    }
    return out;
  }, [cohorts, sessions]);

  // 주 단위 lane 할당: cell → lane[] (각 lane에 event 또는 null)
  type CellEvent = {
    instance: Instance;
    isStart: boolean;
    isEnd: boolean;
  };
  const { laneGrid, maxLanesPerWeek } = useMemo(() => {
    // grid를 7씩 6 주로 분할
    const weeks: string[][] = [];
    for (let w = 0; w < 6; w++) weeks.push(grid.slice(w * 7, w * 7 + 7));

    const cellLanes = new Map<string, (CellEvent | null)[]>();
    const perWeekMax: number[] = [];

    for (const week of weeks) {
      const weekStart = week[0];
      const weekEnd = week[6];
      // 이 주와 겹치는 instance만
      const inWeek = instances
        .filter((it) => it.start <= weekEnd && it.end >= weekStart)
        .sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end));

      // greedy lane assignment within week
      const laneEnd: string[] = []; // lane → 마지막 점유 date
      const laneOfInstance = new Map<string, number>();
      for (const it of inWeek) {
        const segStart = it.start < weekStart ? weekStart : it.start;
        let lane = laneEnd.findIndex((e) => e < segStart);
        if (lane === -1) {
          lane = laneEnd.length;
          laneEnd.push('');
        }
        laneEnd[lane] = it.end < weekEnd ? it.end : weekEnd;
        laneOfInstance.set(it.key, lane);
      }
      perWeekMax.push(laneEnd.length);

      // 각 cell의 lanes 채움
      for (const date of week) {
        const lanes: (CellEvent | null)[] = new Array(laneEnd.length).fill(null);
        for (const it of inWeek) {
          if (date < it.start || date > it.end) continue;
          const lane = laneOfInstance.get(it.key)!;
          lanes[lane] = {
            instance: it,
            isStart: date === it.start,
            isEnd: date === it.end
          };
        }
        cellLanes.set(date, lanes);
      }
    }
    return { laneGrid: cellLanes, maxLanesPerWeek: perWeekMax };
  }, [grid, instances]);

  const today = ymd(new Date());
  const monthLabel = `${year}년 ${String(month).padStart(2, '0')}월`;

  // 월 이동 링크
  const prevYm = ((): string => {
    const m = month - 1;
    return m < 1 ? `${year - 1}-12` : `${year}-${String(m).padStart(2, '0')}`;
  })();
  const nextYm = ((): string => {
    const m = month + 1;
    return m > 12 ? `${year + 1}-01` : `${year}-${String(m).padStart(2, '0')}`;
  })();
  const thisYm = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

  return (
    <div className='space-y-4'>
      {/* 헤더 — 월 이동 + 범례 */}
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='flex items-center gap-2'>
          <Link
            href={`/dashboard/calendar?ym=${prevYm}`}
            className='rounded-md border bg-background p-1.5 hover:bg-muted'
            aria-label='이전 달'
          >
            <Icons.chevronLeft className='h-4 w-4' />
          </Link>
          <div className='min-w-[7rem] text-center text-base font-bold'>{monthLabel}</div>
          <Link
            href={`/dashboard/calendar?ym=${nextYm}`}
            className='rounded-md border bg-background p-1.5 hover:bg-muted'
            aria-label='다음 달'
          >
            <Icons.chevronRight className='h-4 w-4' />
          </Link>
          <Link
            href={`/dashboard/calendar?ym=${thisYm}`}
            className='ml-1 rounded-md border bg-background px-2.5 py-1 text-xs font-semibold hover:bg-muted'
          >
            오늘
          </Link>
        </div>
        <div className='flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground'>
          {(Object.keys(KIND_LABEL) as EventKind[]).map((k) => (
            <span key={k} className='inline-flex items-center gap-1'>
              <span className={`h-2.5 w-2.5 rounded-full ${KIND_DOT[k]}`} />
              {KIND_LABEL[k]}
            </span>
          ))}
        </div>
      </div>

      {/* 요일 헤더 */}
      <div className='grid grid-cols-7 overflow-hidden rounded-xl border bg-card [&>*]:border-b [&>*]:border-l [&>*:nth-child(7n+1)]:border-l-0'>
        {DOW.map((d, i) => (
          <div
            key={d}
            className={`bg-card py-2 text-center text-xs font-semibold ${DOW_COLOR[i]}`}
          >
            {d}
          </div>
        ))}

        {/* 날짜 셀 */}
        {grid.map((date, idx) => {
          const [, m, day] = date.split('-').map(Number);
          const inMonth = m === month;
          const isToday = date === today;
          const holiday = HOLIDAYS[date];
          const weekIdx = Math.floor(idx / 7);
          const lanes = laneGrid.get(date) ?? [];
          const weekMaxLanes = maxLanesPerWeek[weekIdx] ?? 0;

          return (
            <div
              key={date}
              className={`min-h-[110px] p-1.5 text-xs ${
                holiday ? 'bg-red-50 dark:bg-red-950/30' : 'bg-card'
              } ${inMonth ? '' : 'opacity-40'}`}
            >
              <div className='mb-1 flex items-center gap-1.5'>
                <div
                  className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold tabular-nums ${
                    isToday
                      ? 'bg-blue-600 text-white'
                      : holiday
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-foreground'
                  }`}
                >
                  {day}
                </div>
                {holiday && (
                  <span className='text-[10px] font-semibold text-red-600 dark:text-red-400'>
                    {holiday}
                  </span>
                )}
              </div>
              <div className='-mx-[7px] space-y-0.5'>
                {Array.from({ length: weekMaxLanes }).map((_, laneIdx) => {
                  const ce = lanes[laneIdx];
                  if (!ce) {
                    // 빈 lane → placeholder로 높이만 차지 (옆 셀의 같은 lane이 이어지게)
                    return <div key={laneIdx} className='h-4' />;
                  }
                  const e = ce.instance;
                  let radius = '';
                  if (ce.isStart && ce.isEnd) radius = 'rounded mx-0.5';
                  else if (ce.isStart) radius = 'rounded-l ml-0.5';
                  else if (ce.isEnd) radius = 'rounded-r mr-0.5';
                  return (
                    <Link
                      key={laneIdx}
                      href={e.href}
                      title={`[${KIND_LABEL[e.kind]}] ${e.label}`}
                      className={`flex h-4 items-center px-1 text-[10px] leading-none ${KIND_STRIP[e.kind]} ${radius}`}
                    >
                      {ce.isStart && <span className='mr-0.5 shrink-0'>←</span>}
                      <span className='flex-1 truncate'>{ce.isStart ? e.label : ''}</span>
                      {ce.isEnd && <span className='ml-0.5 shrink-0'>→</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { Icons } from '@/components/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

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
  recruitment_round_id: string | null;
};

type SessionRow = {
  id: string;
  cohort_id: string;
  session_date: string;
  session_end_date: string | null;
  title: string | null;
  instructors: string[];
};

type Round = {
  id: string;
  round_no: number;
  label: string | null;
  application_start_at: string | null;
  application_end_at: string | null;
  selection_at: string | null;
  announce_at: string | null;
};

type Props = {
  year: number;
  month: number; // 1-12
  cohorts: Cohort[];
  sessions: SessionRow[];
  rounds: Round[];
};

type EventKind = 'recruit' | 'decided' | 'notified' | 'orientation' | 'session';


// 정렬 룰: "오늘 할 일 우선" — 수업 → OT → 통보 → 선발 → 모집 순으로 위에 표시.
// 범례·lane 정렬·KIND_* 룩업 정의 순서를 일치시켜 운영자가 룰을 시각적으로 인식할 수 있게.
const KIND_DOT: Record<EventKind, string> = {
  session: 'bg-blue-500',
  orientation: 'bg-violet-500',
  notified: 'bg-emerald-500',
  decided: 'bg-amber-500',
  recruit: 'bg-orange-500'
};
const KIND_STRIP: Record<EventKind, string> = {
  session: 'bg-blue-100 text-blue-900 border-l-2 border-blue-500 dark:bg-blue-950/50 dark:text-blue-100',
  orientation: 'bg-violet-100 text-violet-900 border-l-2 border-violet-500 dark:bg-violet-950/50 dark:text-violet-100',
  notified: 'bg-emerald-100 text-emerald-900 border-l-2 border-emerald-500 dark:bg-emerald-950/50 dark:text-emerald-100',
  decided: 'bg-amber-100 text-amber-900 border-l-2 border-amber-500 dark:bg-amber-950/50 dark:text-amber-100',
  recruit: 'bg-orange-100 text-orange-900 border-l-2 border-orange-500 dark:bg-orange-950/50 dark:text-orange-100'
};
const KIND_LABEL: Record<EventKind, string> = {
  session: '수업',
  orientation: 'OT',
  notified: '통보',
  decided: '선발',
  recruit: '모집'
};
// "오늘 할 일 우선" — 같은 날 여러 이벤트가 있으면 임박한 종류(수업)를 위 lane에 배치.
const KIND_ORDER: Record<EventKind, number> = {
  session: 0,
  orientation: 1,
  notified: 2,
  decided: 3,
  recruit: 4
};

const DOW = ['일', '월', '화', '수', '목', '금', '토'] as const;
const DOW_COLOR = ['text-red-500', '', '', '', '', '', 'text-blue-500'];

// 한국 공휴일 (수업 없는 날). 음력 공휴일은 매년 양력 날짜가 달라지므로 연도별 갱신 필요.
// 대체공휴일: 어린이날 + 일요일 겹친 삼일절/광복절/개천절/한글날/부처님오신날/설/추석 → 다음 평일.
const HOLIDAYS: Record<string, string> = {
  '2026-01-01': '신정',
  '2026-02-16': '설 연휴',
  '2026-02-17': '설날',
  '2026-02-18': '설 연휴',
  '2026-03-01': '삼일절',
  '2026-03-02': '대체공휴일',
  '2026-05-05': '어린이날',
  '2026-05-24': '부처님오신날',
  '2026-05-25': '대체공휴일',
  '2026-06-03': '지방선거',
  '2026-06-06': '현충일',
  '2026-08-15': '광복절',
  '2026-09-24': '추석 연휴',
  '2026-09-25': '추석',
  '2026-09-26': '추석 연휴',
  '2026-10-03': '개천절',
  '2026-10-09': '한글날',
  '2026-12-25': '크리스마스'
};

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatDateLabel(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${m}.${d}.(${DOW[date.getDay()]})`;
}

function* daysInRange(start: string, end: string): Generator<string> {
  const a = new Date(start + 'T00:00:00Z');
  const b = new Date(end + 'T00:00:00Z');
  while (a <= b) {
    yield ymd(a);
    a.setUTCDate(a.getUTCDate() + 1);
  }
}

export function Calendar({ year, month, cohorts, sessions, rounds }: Props) {
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
    label: string; // 셀에 표시할 짧은 라벨
    tooltip: string; // hover시 전체 정보
    href: string;
    /** 라운드 이벤트일 때만 채워짐 — 매핑된 cohort 목록 (popover에 표시) */
    roundDetail?: {
      roundLabel: string;
      kind: 'recruit' | 'decided' | 'notified';
      dateLabel: string; // "05.15.(목) ~ 05.22.(목)" or "05.25.(일)"
      cohorts: { id: string; name: string }[];
    };
  };
  const instances = useMemo<Instance[]>(() => {
    const out: Instance[] = [];

    // 라운드별로 매핑된 cohort 목록 미리 계산
    const cohortsByRound = new Map<string, Cohort[]>();
    for (const c of cohorts) {
      if (!c.recruitment_round_id) continue;
      const list = cohortsByRound.get(c.recruitment_round_id) ?? [];
      list.push(c);
      cohortsByRound.set(c.recruitment_round_id, list);
    }

    // 라운드 이벤트 — 모집/선발/통보 (라운드 매핑된 모든 cohort 그룹화)
    for (const r of rounds) {
      const mapped = cohortsByRound.get(r.id) ?? [];
      const count = mapped.length;
      const mappedList = mapped.map((c) => ({ id: c.id, name: c.name }));
      const tooltipBase = mapped.length > 0 ? mapped.map((c) => c.name).join(', ') : '매핑된 과정 없음';
      const firstCohortId = mapped[0]?.id;
      const href = firstCohortId ? `/dashboard/cohorts/${firstCohortId}` : '#';
      const roundLabel = r.label ?? `${r.round_no}차 모집`;

      if (r.application_start_at && r.application_end_at) {
        const dateLabel = `${formatDateLabel(r.application_start_at)} ~ ${formatDateLabel(r.application_end_at)}`;
        out.push({
          key: `round-recruit::${r.id}`,
          start: r.application_start_at,
          end: r.application_end_at,
          kind: 'recruit',
          cohortId: `round-${r.id}`,
          cohortName: roundLabel,
          label: `${r.round_no}차 모집${count > 0 ? ` · ${count}개` : ''}`,
          tooltip: `[${roundLabel}] ${tooltipBase}`,
          href,
          roundDetail: { roundLabel, kind: 'recruit', dateLabel, cohorts: mappedList }
        });
      }
      if (r.selection_at) {
        out.push({
          key: `round-decided::${r.id}`,
          start: r.selection_at,
          end: r.selection_at,
          kind: 'decided',
          cohortId: `round-${r.id}`,
          cohortName: roundLabel,
          label: `${r.round_no}차 선발${count > 0 ? ` · ${count}개` : ''}`,
          tooltip: `[${roundLabel} 선발일] ${tooltipBase}`,
          href,
          roundDetail: { roundLabel, kind: 'decided', dateLabel: formatDateLabel(r.selection_at), cohorts: mappedList }
        });
      }
      if (r.announce_at) {
        out.push({
          key: `round-notified::${r.id}`,
          start: r.announce_at,
          end: r.announce_at,
          kind: 'notified',
          cohortId: `round-${r.id}`,
          cohortName: roundLabel,
          label: `${r.round_no}차 통보${count > 0 ? ` · ${count}개` : ''}`,
          tooltip: `[${roundLabel} 통보일] ${tooltipBase}`,
          href,
          roundDetail: { roundLabel, kind: 'notified', dateLabel: formatDateLabel(r.announce_at), cohorts: mappedList }
        });
      }
    }

    // cohort 자체 이벤트 — 라운드 미매핑 cohort만 (매핑된 건 라운드 이벤트로 통합)
    for (const c of cohorts) {
      const cohortHref = `/dashboard/cohorts/${c.id}`;
      const hasRound = !!c.recruitment_round_id;

      if (!hasRound && c.application_start_at && c.application_end_at) {
        out.push({
          key: `recruit::${c.id}`,
          start: c.application_start_at,
          end: c.application_end_at,
          kind: 'recruit',
          cohortId: c.id,
          cohortName: c.name,
          label: c.name,
          tooltip: `[모집] ${c.name}`,
          href: cohortHref
        });
      }
      if (!hasRound && c.decided_at) {
        out.push({
          key: `decided::${c.id}`,
          start: c.decided_at,
          end: c.decided_at,
          kind: 'decided',
          cohortId: c.id,
          cohortName: c.name,
          label: c.name,
          tooltip: `[선발] ${c.name}`,
          href: cohortHref
        });
      }
      if (!hasRound && c.notified_at) {
        out.push({
          key: `notified::${c.id}`,
          start: c.notified_at,
          end: c.notified_at,
          kind: 'notified',
          cohortId: c.id,
          cohortName: c.name,
          label: c.name,
          tooltip: `[통보] ${c.name}`,
          href: cohortHref
        });
      }
      // OT는 cohort 단위라 라운드 매핑과 무관하게 항상 표시
      if (c.orientation_date) {
        out.push({
          key: `orient::${c.id}`,
          start: c.orientation_date,
          end: c.orientation_date,
          kind: 'orientation',
          cohortId: c.id,
          cohortName: c.name,
          label: `OT · ${c.name}`,
          tooltip: `[OT] ${c.name}`,
          href: cohortHref
        });
      }
    }
    const cohortNameById = new Map(cohorts.map((c) => [c.id, c.name]));
    for (const s of sessions) {
      const cohortName = cohortNameById.get(s.cohort_id) ?? '';
      const instr = s.instructors.join('·');
      out.push({
        key: `session::${s.id}`,
        start: s.session_date,
        end: s.session_end_date ?? s.session_date,
        kind: 'session',
        cohortId: s.cohort_id,
        cohortName,
        label: cohortName,
        tooltip: [
          `[수업] ${cohortName}`,
          s.title ?? '',
          instr
        ].filter(Boolean).join(' · '),
        href: `/dashboard/cohorts/${s.cohort_id}/lessons/${s.id}`
      });
    }
    out.sort((a, b) => {
      if (a.kind !== b.kind) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
      if (a.start !== b.start) return a.start.localeCompare(b.start);
      return a.cohortName.localeCompare(b.cohortName, 'ko');
    });
    return out;
  }, [cohorts, sessions, rounds]);

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
      // 이 주와 겹치는 instance만 — KIND_ORDER 우선, 같은 종류면 시작일 → 이름(라운드 라벨) → 긴 것.
      const inWeek = instances
        .filter((it) => it.start <= weekEnd && it.end >= weekStart)
        .sort((a, b) => {
          if (a.kind !== b.kind) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
          if (a.start !== b.start) return a.start.localeCompare(b.start);
          if (a.cohortName !== b.cohortName)
            return a.cohortName.localeCompare(b.cohortName, 'ko');
          return b.end.localeCompare(a.end);
        });

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
          <span className='text-muted-foreground/70 font-medium'>위쪽일수록 우선</span>
          {(Object.keys(KIND_LABEL) as EventKind[]).map((k, i) => (
            <span key={k} className='inline-flex items-center gap-1'>
              {i > 0 && <span className='text-muted-foreground/40'>›</span>}
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
              className={`min-h-[128px] p-1.5 text-xs ${
                holiday ? 'bg-red-50 dark:bg-red-950/30' : 'bg-card'
              } ${inMonth ? '' : 'opacity-40'}`}
            >
              <div className='mb-1 flex items-center gap-1.5'>
                <div
                  className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold tabular-nums ${
                    isToday
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
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
              <div className='-mx-[7px] space-y-[3px]'>
                {Array.from({ length: weekMaxLanes }).map((_, laneIdx) => {
                  const ce = lanes[laneIdx];
                  if (!ce) {
                    return <div key={laneIdx} className='h-[18px]' />;
                  }
                  const e = ce.instance;
                  let radius = 'mx-0';
                  if (ce.isStart && ce.isEnd) radius = 'rounded mx-0.5';
                  else if (ce.isStart) radius = 'rounded-l ml-0.5';
                  else if (ce.isEnd) radius = 'rounded-r mr-0.5';
                  const cls = `flex h-[18px] w-full items-center px-1.5 text-[11px] font-medium leading-none transition-opacity hover:opacity-80 ${KIND_STRIP[e.kind]} ${radius}`;

                  if (e.roundDetail) {
                    return (
                      <Popover key={laneIdx}>
                        <PopoverTrigger asChild>
                          <button type='button' title={e.tooltip} className={cls}>
                            <span className='flex-1 truncate text-left'>{e.label}</span>
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align='start' className='w-72 p-0'>
                          <RoundDetailPanel detail={e.roundDetail} />
                        </PopoverContent>
                      </Popover>
                    );
                  }

                  return (
                    <Link
                      key={laneIdx}
                      href={e.href}
                      title={e.tooltip}
                      className={cls}
                    >
                      <span className='flex-1 truncate'>{e.label}</span>
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

const ROUND_KIND_LABEL: Record<'recruit' | 'decided' | 'notified', string> = {
  recruit: '신청기간',
  decided: '선발일',
  notified: '통보일'
};

function RoundDetailPanel({
  detail
}: {
  detail: {
    roundLabel: string;
    kind: 'recruit' | 'decided' | 'notified';
    dateLabel: string;
    cohorts: { id: string; name: string }[];
  };
}) {
  return (
    <div className='flex flex-col'>
      <div className='border-b px-4 py-3'>
        <div className='flex items-center gap-2'>
          <span className={`h-2.5 w-2.5 rounded-full ${KIND_DOT[detail.kind]}`} />
          <span className='text-sm font-semibold'>{detail.roundLabel}</span>
          <span className='text-muted-foreground text-xs'>{ROUND_KIND_LABEL[detail.kind]}</span>
        </div>
        <div className='text-muted-foreground mt-1 font-mono text-xs tabular-nums'>
          {detail.dateLabel}
        </div>
      </div>
      <div className='px-2 py-2'>
        <div className='text-muted-foreground mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider'>
          매핑된 과정 {detail.cohorts.length}개
        </div>
        {detail.cohorts.length === 0 ? (
          <div className='text-muted-foreground px-2 py-2 text-xs'>매핑된 과정이 없습니다.</div>
        ) : (
          <ul className='flex flex-col'>
            {detail.cohorts.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/dashboard/cohorts/${c.id}`}
                  className='hover:bg-muted flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition-colors'
                >
                  <span className='truncate'>{c.name}</span>
                  <Icons.chevronRight className='text-muted-foreground h-3.5 w-3.5 shrink-0' />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

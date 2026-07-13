'use client';

import Link from 'next/link';
import { useMemo, useRef } from 'react';
import { Icons } from '@/components/icons';
import { detectCohortType } from '@/lib/cohort-type';

// 타입은 Calendar 컴포넌트와 동일하지만, 이 파일도 독립적으로 읽히도록 재선언.
type Cohort = {
  id: string;
  name: string;
  application_start_at: string | null;
  application_end_at: string | null;
  decided_at: string | null;
  notified_at: string | null;
  orientation_date: string | null;
  pre_online_start_at: string | null;
  pre_online_end_at: string | null;
  certification_start_at: string | null;
  certification_end_at: string | null;
  self_study_start_at: string | null;
  self_study_end_at: string | null;
  intensive_start_at: string | null;
  intensive_end_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  recruitment_round_id: string | null;
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
  rounds: Round[];
};

type BarKind =
  | 'recruit'
  | 'notified'
  | 'orientation'
  | 'preonline'
  | 'intensive'
  | 'selfstudy'
  | 'certification';

// 월 캘린더와 색 체계 동일하게 맞춤 (KIND_DOT/KIND_STRIP과 대응).
const BAR_STYLE: Record<BarKind, string> = {
  recruit:
    'bg-orange-100 text-orange-900 border border-orange-400 dark:bg-orange-950/50 dark:text-orange-100 dark:border-orange-600',
  notified:
    'bg-fuchsia-100 text-fuchsia-900 border border-fuchsia-400 dark:bg-fuchsia-950/50 dark:text-fuchsia-100 dark:border-fuchsia-600',
  orientation:
    'bg-violet-100 text-violet-900 border border-violet-400 dark:bg-violet-950/50 dark:text-violet-100 dark:border-violet-600',
  preonline:
    'bg-teal-100 text-teal-900 border border-teal-400 dark:bg-teal-950/50 dark:text-teal-100 dark:border-teal-600',
  intensive:
    'bg-emerald-100 text-emerald-900 border border-emerald-400 dark:bg-emerald-950/50 dark:text-emerald-100 dark:border-emerald-600',
  selfstudy:
    'bg-slate-100 text-slate-900 border border-slate-400 dark:bg-slate-900/60 dark:text-slate-100 dark:border-slate-500',
  certification:
    'bg-rose-100 text-rose-900 border border-rose-400 dark:bg-rose-950/50 dark:text-rose-100 dark:border-rose-600'
};

const BAR_DOT: Record<BarKind, string> = {
  recruit: 'bg-orange-500',
  notified: 'bg-fuchsia-500',
  orientation: 'bg-violet-500',
  preonline: 'bg-teal-500',
  intensive: 'bg-emerald-500',
  selfstudy: 'bg-slate-500',
  certification: 'bg-rose-500'
};

const BAR_LABEL: Record<BarKind, string> = {
  recruit: '접수',
  notified: '통보',
  orientation: 'OT',
  preonline: '사전온라인',
  intensive: '집중교육',
  selfstudy: '셀프스터디',
  certification: '인증평가'
};

const BAR_ICON: Record<BarKind, string> = {
  recruit: '📝',
  notified: '📢',
  orientation: '🎬',
  preonline: '💻',
  intensive: '🎯',
  selfstudy: '📚',
  certification: '🏆'
};

const DOW = ['일', '월', '화', '수', '목', '금', '토'] as const;

// 월 캘린더와 동일 (2026 공휴일).
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
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toUTCDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

function dayDiff(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

function fmtMd(iso: string): string {
  return `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))}`;
}

// (start, end)이 [winStart, winEnd] 창과 겹치는지.
function overlaps(startIso: string, endIso: string, winStart: string, winEnd: string): boolean {
  return startIso <= winEnd && endIso >= winStart;
}

type Bar = {
  kind: BarKind;
  start: string;
  end: string;
  label: string; // 바 안에 표시할 짧은 라벨
  tooltip: string; // hover 시 전체 정보
};

type Row = {
  cohortId: string;
  cohortName: string;
  earliestStart: string; // 정렬용 (창 안에서 가장 이른 이벤트 시작일)
  bars: Bar[];
  isRoundHeader?: boolean; // 라운드 그룹 헤더
  isChildOfRound?: boolean; // 라운드 하위 cohort (들여쓰기)
  href?: string; // 클릭 시 이동할 URL. 라운드 헤더는 undefined
  subLine?: string; // 라운드 헤더의 부가정보 (접수 기간 등)
};

const NAME_W = 220;

export function Timeline({ year, month, cohorts, rounds }: Props) {
  const { winStart, winEnd, days, weekStarts, monthLabel, prevYm, nextYm, thisYm, today } = useMemo(() => {
    // 창: 해당 월 1일에서 요일에 상관없이 -7일 ~ 말일 +7일. 총 일수 계산.
    const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
    const start = new Date(firstOfMonth);
    start.setUTCDate(start.getUTCDate() - 7);
    const lastOfMonth = new Date(Date.UTC(year, month, 0));
    const end = new Date(lastOfMonth);
    end.setUTCDate(end.getUTCDate() + 7);

    const totalDays = dayDiff(end, start) + 1;
    const daysArr: Date[] = [];
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + i);
      daysArr.push(d);
    }

    // 주 시작 인덱스 (월요일마다 새 주)
    const wStarts: number[] = [];
    for (let i = 0; i < daysArr.length; i++) {
      const dow = daysArr[i].getUTCDay();
      if (i === 0 || dow === 1) wStarts.push(i);
    }

    // 이전/다음 월 파라미터
    const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
    const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
    const now = new Date();

    return {
      winStart: ymd(start),
      winEnd: ymd(end),
      days: daysArr,
      weekStarts: wStarts,
      monthLabel: `${year}년 ${String(month).padStart(2, '0')}월`,
      prevYm: `${prev.y}-${String(prev.m).padStart(2, '0')}`,
      nextYm: `${next.y}-${String(next.m).padStart(2, '0')}`,
      thisYm: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      today: ymd(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())))
    };
  }, [year, month]);

  const rows = useMemo<Row[]>(() => {
    const roundById = new Map(rounds.map((r) => [r.id, r]));

    // cohort의 개별 스케줄 바 (OT/온라인/집중/셀프/평가) — 접수/통보 제외.
    // includeApplication=true면 자체 컬럼의 접수/통보도 포함 (라운드 미매핑 cohort용).
    const buildCohortBars = (c: Cohort, includeApplication: boolean): Bar[] => {
      const bars: Bar[] = [];

      if (includeApplication) {
        if (c.application_start_at && c.application_end_at && overlaps(c.application_start_at, c.application_end_at, winStart, winEnd)) {
          bars.push({
            kind: 'recruit',
            start: c.application_start_at,
            end: c.application_end_at,
            label: `${BAR_ICON.recruit} 접수`,
            tooltip: `[접수] ${c.application_start_at} ~ ${c.application_end_at}`
          });
        }
        if (c.notified_at && overlaps(c.notified_at, c.notified_at, winStart, winEnd)) {
          bars.push({
            kind: 'notified',
            start: c.notified_at,
            end: c.notified_at,
            label: `${BAR_ICON.notified} 통보`,
            tooltip: `[통보] ${c.notified_at}`
          });
        }
      }

      if (c.orientation_date && overlaps(c.orientation_date, c.orientation_date, winStart, winEnd)) {
        bars.push({
          kind: 'orientation',
          start: c.orientation_date,
          end: c.orientation_date,
          label: `${BAR_ICON.orientation} OT`,
          tooltip: `[OT] ${c.orientation_date}`
        });
      }
      if (c.pre_online_start_at || c.pre_online_end_at) {
        const s = c.pre_online_start_at ?? c.pre_online_end_at!;
        const e = c.pre_online_end_at ?? c.pre_online_start_at!;
        if (overlaps(s, e, winStart, winEnd)) {
          bars.push({
            kind: 'preonline',
            start: s,
            end: e,
            label: `${BAR_ICON.preonline} 사전온라인`,
            tooltip: `[사전온라인] ${s}${s !== e ? ` ~ ${e}` : ''}`
          });
        }
      }
      if (c.intensive_start_at || c.intensive_end_at) {
        const s = c.intensive_start_at ?? c.intensive_end_at!;
        const e = c.intensive_end_at ?? c.intensive_start_at!;
        if (overlaps(s, e, winStart, winEnd)) {
          bars.push({
            kind: 'intensive',
            start: s,
            end: e,
            label: `${BAR_ICON.intensive} 집중교육`,
            tooltip: `[집중교육] ${s}${s !== e ? ` ~ ${e}` : ''}`
          });
        }
      }
      if (c.self_study_start_at || c.self_study_end_at) {
        const s = c.self_study_start_at ?? c.self_study_end_at!;
        const e = c.self_study_end_at ?? c.self_study_start_at!;
        if (overlaps(s, e, winStart, winEnd)) {
          bars.push({
            kind: 'selfstudy',
            start: s,
            end: e,
            label: `${BAR_ICON.selfstudy} 셀프`,
            tooltip: `[셀프스터디] ${s}${s !== e ? ` ~ ${e}` : ''}`
          });
        }
      }
      if (c.certification_start_at || c.certification_end_at) {
        const s = c.certification_start_at ?? c.certification_end_at!;
        const e = c.certification_end_at ?? c.certification_start_at!;
        if (overlaps(s, e, winStart, winEnd)) {
          bars.push({
            kind: 'certification',
            start: s,
            end: e,
            label: `${BAR_ICON.certification} 인증평가`,
            tooltip: `[인증평가] ${s}${s !== e ? ` ~ ${e}` : ''}`
          });
        }
      }

      bars.sort((a, b) => a.start.localeCompare(b.start));
      return bars;
    };

    // 라운드별 그룹핑 (라운드 없는 cohort는 unrounded로 분리)
    const cohortsByRound = new Map<string, Cohort[]>();
    const unrounded: Cohort[] = [];
    for (const c of cohorts) {
      if (c.recruitment_round_id && roundById.has(c.recruitment_round_id)) {
        const arr = cohortsByRound.get(c.recruitment_round_id) ?? [];
        arr.push(c);
        cohortsByRound.set(c.recruitment_round_id, arr);
      } else {
        unrounded.push(c);
      }
    }

    type RoundGroup = { round: Round; cohorts: Cohort[]; sortKey: string };
    const roundGroups: RoundGroup[] = [];
    for (const [rid, cs] of cohortsByRound) {
      const round = roundById.get(rid)!;
      // 라운드 자체 접수 기간 OR 하위 cohort의 이벤트 하나라도 창 안에 있는지
      const roundInWindow =
        (round.application_start_at && round.application_end_at &&
          overlaps(round.application_start_at, round.application_end_at, winStart, winEnd)) ||
        (round.announce_at && overlaps(round.announce_at, round.announce_at, winStart, winEnd));
      const hasChildInWindow = cs.some((c) => buildCohortBars(c, false).length > 0);
      if (!roundInWindow && !hasChildInWindow) continue;
      roundGroups.push({
        round,
        cohorts: cs,
        sortKey: round.application_start_at ?? winStart
      });
    }
    roundGroups.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

    const out: Row[] = [];
    for (const g of roundGroups) {
      const { round, cohorts: cs } = g;
      const roundLabel = round.label ?? `${round.round_no}차 모집`;

      // 라운드 헤더 row — 접수·통보 바만
      const headerBars: Bar[] = [];
      if (round.application_start_at && round.application_end_at &&
        overlaps(round.application_start_at, round.application_end_at, winStart, winEnd)) {
        headerBars.push({
          kind: 'recruit',
          start: round.application_start_at,
          end: round.application_end_at,
          label: `${BAR_ICON.recruit} 접수`,
          tooltip: `[${roundLabel} · 접수] ${round.application_start_at} ~ ${round.application_end_at}\n${cs.map((c) => '· ' + c.name).join('\n')}`
        });
      }
      if (round.announce_at && overlaps(round.announce_at, round.announce_at, winStart, winEnd)) {
        headerBars.push({
          kind: 'notified',
          start: round.announce_at,
          end: round.announce_at,
          label: `${BAR_ICON.notified} 통보`,
          tooltip: `[${roundLabel} · 통보] ${round.announce_at}\n${cs.map((c) => '· ' + c.name).join('\n')}`
        });
      }

      // 헤더 이름 셀 아래에 표시할 부가정보 (접수 기간 · 통보일).
      // 창 밖이라 바가 안 보일 때도 정보를 잃지 않도록 텍스트로 상시 노출.
      const subParts: string[] = [];
      if (round.application_start_at && round.application_end_at) {
        subParts.push(`접수 ${fmtMd(round.application_start_at)}~${fmtMd(round.application_end_at)}`);
      }
      if (round.announce_at) {
        subParts.push(`통보 ${fmtMd(round.announce_at)}`);
      }

      out.push({
        cohortId: `round-${round.id}`,
        cohortName: `${roundLabel} · ${cs.length}개 과정`,
        earliestStart: round.application_start_at ?? winStart,
        bars: headerBars,
        isRoundHeader: true,
        subLine: subParts.join(' · ') || undefined
      });

      // 하위 cohort — 접수/통보 제외한 나머지만
      const childRows: Row[] = [];
      for (const c of cs) {
        const bars = buildCohortBars(c, false);
        if (bars.length === 0) continue;
        childRows.push({
          cohortId: c.id,
          cohortName: c.name,
          earliestStart: bars[0].start,
          bars,
          isChildOfRound: true,
          href: `/dashboard/cohorts/${c.id}`
        });
      }
      childRows.sort((a, b) => a.cohortName.localeCompare(b.cohortName, 'ko'));
      out.push(...childRows);
    }

    // 라운드 없는 cohort — 접수/통보 자체 컬럼 포함해서 전체 바 표시
    const unroundedRows: Row[] = [];
    for (const c of unrounded) {
      const bars = buildCohortBars(c, true);
      if (bars.length === 0) continue;
      unroundedRows.push({
        cohortId: c.id,
        cohortName: c.name,
        earliestStart: bars[0].start,
        bars,
        href: `/dashboard/cohorts/${c.id}`
      });
    }
    unroundedRows.sort((a, b) => {
      if (a.earliestStart !== b.earliestStart) return a.earliestStart.localeCompare(b.earliestStart);
      return a.cohortName.localeCompare(b.cohortName, 'ko');
    });
    out.push(...unroundedRows);

    return out;
  }, [cohorts, rounds, winStart, winEnd]);

  const totalDays = days.length;
  const winStartDate = toUTCDate(winStart);
  const todayIdx = today >= winStart && today <= winEnd ? dayDiff(toUTCDate(today), winStartDate) : -1;

  function pct(iso: string): number {
    const idx = dayDiff(toUTCDate(iso), winStartDate);
    return Math.max(0, Math.min(100, (idx / totalDays) * 100));
  }
  function wPct(startIso: string, endIso: string): number {
    const si = Math.max(0, dayDiff(toUTCDate(startIso), winStartDate));
    const ei = Math.min(totalDays, dayDiff(toUTCDate(endIso), winStartDate) + 1);
    return Math.max(0.5, ((ei - si) / totalDays) * 100);
  }

  // 드래그로 가로 스크롤. 링크(각 바) 클릭과 구분: 5px 이상 이동했으면 이후 발생하는 클릭 취소.
  const scrollRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ down: false, startX: 0, startScrollLeft: 0, moved: false });

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el || e.button !== 0) return;
    drag.current = {
      down: true,
      startX: e.pageX,
      startScrollLeft: el.scrollLeft,
      moved: false
    };
    el.style.cursor = 'grabbing';
    el.style.userSelect = 'none';
  };
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!drag.current.down || !el) return;
    const walk = e.pageX - drag.current.startX;
    if (Math.abs(walk) > 5) drag.current.moved = true;
    el.scrollLeft = drag.current.startScrollLeft - walk;
  };
  const endDrag = () => {
    const el = scrollRef.current;
    if (!el) return;
    drag.current.down = false;
    el.style.cursor = 'grab';
    el.style.userSelect = '';
  };
  const handleClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (drag.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      drag.current.moved = false;
    }
  };

  return (
    <div className='space-y-4'>
      {/* 헤더 — 월 이동 + 뷰 토글 + 범례 */}
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='flex items-center gap-2'>
          <Link
            href={`/dashboard/calendar?ym=${prevYm}&view=timeline`}
            className='rounded-md border bg-background p-1.5 hover:bg-muted'
            aria-label='이전 달'
          >
            <Icons.chevronLeft className='h-4 w-4' />
          </Link>
          <div className='min-w-[7rem] text-center text-base font-bold'>{monthLabel}</div>
          <Link
            href={`/dashboard/calendar?ym=${nextYm}&view=timeline`}
            className='rounded-md border bg-background p-1.5 hover:bg-muted'
            aria-label='다음 달'
          >
            <Icons.chevronRight className='h-4 w-4' />
          </Link>
          <Link
            href={`/dashboard/calendar?ym=${thisYm}&view=timeline`}
            className='ml-1 rounded-md border bg-background px-2.5 py-1 text-xs font-semibold hover:bg-muted'
          >
            오늘
          </Link>
          {/* 뷰 토글 */}
          <div className='ml-2 inline-flex overflow-hidden rounded-md border bg-background text-xs font-semibold'>
            <Link
              href={`/dashboard/calendar?ym=${year}-${String(month).padStart(2, '0')}`}
              className='px-3 py-1 hover:bg-muted'
            >
              월
            </Link>
            <Link
              href={`/dashboard/calendar?ym=${year}-${String(month).padStart(2, '0')}&view=timeline`}
              className='bg-primary text-primary-foreground px-3 py-1'
            >
              타임라인
            </Link>
          </div>
        </div>
        <div className='flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground'>
          {(Object.keys(BAR_LABEL) as BarKind[]).map((k) => (
            <span key={k} className='inline-flex items-center gap-1'>
              <span className={`h-2.5 w-2.5 rounded-full ${BAR_DOT[k]}`} />
              {BAR_LABEL[k]}
            </span>
          ))}
        </div>
      </div>

      {/* 간트 본체 — 드래그로 좌우 스크롤 */}
      <div
        ref={scrollRef}
        role='region'
        aria-label='타임라인 간트'
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
        onClickCapture={handleClickCapture}
        style={{ cursor: 'grab' }}
        className='overflow-x-auto rounded-xl border bg-card'
      >
        <div style={{ minWidth: `${NAME_W + totalDays * 26}px` }}>
          {/* 주 헤더 */}
          <div className='flex border-b bg-muted/40'>
            <div
              style={{ width: NAME_W, flexShrink: 0 }}
              className='border-r py-1.5 pl-3 text-[11px] font-semibold text-muted-foreground'
            >
              과정
            </div>
            <div className='relative flex flex-1'>
              {weekStarts.map((startIdx, i) => {
                const nextStart = weekStarts[i + 1] ?? totalDays;
                const width = ((nextStart - startIdx) / totalDays) * 100;
                const ws = days[startIdx];
                const we = days[Math.min(nextStart - 1, totalDays - 1)];
                const isCurrent = today >= ymd(ws) && today <= ymd(we);
                return (
                  <div
                    key={i}
                    style={{ width: `${width}%`, flexShrink: 0 }}
                    className={`overflow-hidden border-r border-border/50 py-1 text-center text-[10px] font-semibold ${
                      isCurrent
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {ws.getUTCMonth() + 1}/{ws.getUTCDate()} ~ {we.getUTCMonth() + 1}/
                    {we.getUTCDate()}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 요일+날짜 헤더 */}
          <div className='flex border-b bg-muted/20'>
            <div
              style={{ width: NAME_W, flexShrink: 0 }}
              className='border-r'
              aria-hidden='true'
            />
            <div className='flex flex-1'>
              {days.map((d) => {
                const dow = d.getUTCDay();
                const iso = ymd(d);
                const isToday = iso === today;
                const isSun = dow === 0;
                const isSat = dow === 6;
                const isMon = dow === 1;
                const holiday = HOLIDAYS[iso];
                return (
                  <div
                    key={iso}
                    style={{ width: `${100 / totalDays}%`, flexShrink: 0 }}
                    className={`overflow-hidden border-border/40 py-1 text-center text-[10px] leading-tight tabular-nums ${
                      isMon ? 'border-l' : 'border-l border-border/20'
                    } ${
                      isToday
                        ? 'bg-amber-500 font-bold text-white'
                        : holiday
                          ? 'text-red-600 dark:text-red-400'
                          : isSun
                            ? 'text-red-500'
                            : isSat
                              ? 'text-blue-500'
                              : 'text-muted-foreground'
                    }`}
                  >
                    <div>{DOW[dow]}</div>
                    <div>{d.getUTCDate()}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 데이터 행 */}
          {rows.length === 0 ? (
            <div className='px-4 py-6 text-center text-sm text-muted-foreground'>
              이 창에 표시할 일정이 없습니다.
            </div>
          ) : (
            rows.map((row) => {
              const rowBg = row.isRoundHeader
                ? 'bg-muted/50 border-b border-border/60'
                : 'border-b border-border/40 hover:bg-muted/30';
              const nameCls = row.isRoundHeader
                ? 'text-[12px] font-bold uppercase tracking-wide text-foreground'
                : row.isChildOfRound
                  ? 'truncate text-[13px] font-medium text-foreground'
                  : 'truncate text-[13px] font-semibold';
              const minH = row.bars.length === 0
                ? 36
                : Math.max(row.isRoundHeader ? 36 : 52, row.bars.length * 24 + 14);
              const typeMeta = row.isRoundHeader ? null : detectCohortType(row.cohortName);
              return (
                <div key={row.cohortId} className={`flex ${rowBg}`}>
                  <div
                    style={{ width: NAME_W, flexShrink: 0 }}
                    className='border-r px-3 py-2 text-xs'
                  >
                    <div className={`flex items-center gap-1.5 ${row.isChildOfRound ? 'pl-3' : ''}`}>
                      {typeMeta && (
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${typeMeta.dot}`}
                          title={typeMeta.label}
                        />
                      )}
                      {row.href ? (
                        <Link
                          href={row.href}
                          className={`${nameCls} hover:text-primary hover:underline`}
                          title={row.cohortName}
                        >
                          {row.cohortName}
                        </Link>
                      ) : (
                        <div className={nameCls} title={row.cohortName}>
                          {row.cohortName}
                        </div>
                      )}
                    </div>
                    {row.subLine && (
                      <div className='mt-1 text-[11px] font-normal text-muted-foreground tabular-nums'>
                        {row.subLine}
                      </div>
                    )}
                  </div>
                  <div
                    className='relative flex-1'
                    style={{ minHeight: `${minH}px` }}
                  >
                    {/* 배경 격자 (일별 세로선) */}
                    <div className='pointer-events-none absolute inset-0 flex'>
                      {days.map((d, i) => {
                        const dow = d.getUTCDay();
                        const isToday = ymd(d) === today;
                        const holiday = HOLIDAYS[ymd(d)];
                        const isMon = dow === 1;
                        return (
                          <div
                            key={i}
                            style={{ width: `${100 / totalDays}%`, flexShrink: 0 }}
                            className={`${
                              isMon ? 'border-l border-border/40' : 'border-l border-border/10'
                            } ${
                              isToday
                                ? 'bg-amber-100/60 dark:bg-amber-500/15'
                                : holiday
                                  ? 'bg-red-50/40 dark:bg-red-950/20'
                                  : ''
                            }`}
                          />
                        );
                      })}
                    </div>

                    {/* 오늘 세로선 (양 옆 dashed 라인으로 강조) */}
                    {todayIdx >= 0 && (
                      <>
                        <div
                          className='pointer-events-none absolute top-0 bottom-0 z-10 w-[2px] bg-amber-500'
                          style={{ left: `${((todayIdx + 0.5) / totalDays) * 100}%` }}
                        />
                      </>
                    )}

                    {/* 단계 바 (각 kind마다 세로로 쌓아서 표시) */}
                    <div className='relative flex flex-col gap-1 px-1 py-1.5'>
                      {row.bars.map((bar, i) => {
                        // 3일 이하면 아이콘만 (텍스트 잘리는 것 방지). label 형식: "🎯 접수"
                        const spanDays = dayDiff(toUTCDate(bar.end), toUTCDate(bar.start)) + 1;
                        const iconOnly = spanDays <= 2;
                        const iconPart = bar.label.slice(0, 2); // "🎯 " → 이모지만
                        const displayLabel = iconOnly ? iconPart.trim() : bar.label;
                        const barCls = `relative flex h-5 items-center overflow-hidden rounded px-1.5 text-[11px] font-semibold leading-none whitespace-nowrap ${BAR_STYLE[bar.kind]}`;
                        const style = {
                          marginLeft: `${pct(bar.start)}%`,
                          width: `${wPct(bar.start, bar.end)}%`
                        };
                        return row.href ? (
                          <Link
                            key={i}
                            href={row.href}
                            title={bar.tooltip}
                            className={`${barCls} hover:opacity-90`}
                            style={style}
                          >
                            <span className='truncate'>{displayLabel}</span>
                          </Link>
                        ) : (
                          <div
                            key={i}
                            title={bar.tooltip}
                            className={barCls}
                            style={style}
                          >
                            <span className='truncate'>{displayLabel}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

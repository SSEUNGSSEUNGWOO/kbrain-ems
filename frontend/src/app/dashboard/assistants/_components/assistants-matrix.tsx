'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toggleAssistantAssignment } from '../_actions';
import { colorForCohort } from './cohort-color';

type Assistant = { id: string; name: string; count: number };

type Session = {
  id: string;
  session_date: string;
  title: string;
  cohortId: string;
  cohortName: string;
  assignedAssistantIds: string[];
  kind: 'lesson' | 'ot' | 'selfstudy';
};

type Props = {
  year: number;
  month: number;
  assistants: Assistant[];
  sessions: Session[];
};

const DOW = ['일', '월', '화', '수', '목', '금', '토'] as const;

function prevMonth(year: number, month: number) {
  return month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
}
function nextMonth(year: number, month: number) {
  return month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
}

// 해당 월의 캘린더 그리드(7×N)를 만들기 위해, 첫 날의 요일까지 비우고 마지막 날 이후도 채움.
function buildCells(year: number, month: number): { date: string | null; key: string }[] {
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const startWeekday = first.getDay(); // 0=일
  const totalDays = last.getDate();
  const cells: { date: string | null; key: string }[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push({ date: null, key: `pre-${i}` });
  for (let d = 1; d <= totalDays; d++) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ date: iso, key: iso });
  }
  while (cells.length % 7 !== 0) cells.push({ date: null, key: `post-${cells.length}` });
  return cells;
}

export function AssistantsMatrix({ year, month, assistants, sessions }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [filterCohort, setFilterCohort] = useState<string>('all');
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);
  // 클릭 직후 낙관적 표시 — 토글된 (sessionId, assistantId) 의 새 상태(boolean) 저장
  const [optimistic, setOptimistic] = useState<Map<string, boolean>>(new Map());

  const cohortOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sessions) if (s.cohortId) m.set(s.cohortId, s.cohortName);
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1], 'ko'));
  }, [sessions]);

  const filteredSessions =
    filterCohort === 'all' ? sessions : sessions.filter((s) => s.cohortId === filterCohort);

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, Session[]>();
    for (const s of filteredSessions) {
      const arr = map.get(s.session_date) ?? [];
      arr.push(s);
      map.set(s.session_date, arr);
    }
    return map;
  }, [filteredSessions]);

  // 같은 날 모든 회차 (필터와 무관 — 전체 데이터) 의 보조강사 배정 현황.
  // 충돌 감지용: (date, assistantId) → 그 날 그 사람이 이미 배정된 회차들.
  // optimistic 상태도 반영한다.
  const allSessionsByDate = useMemo(() => {
    const map = new Map<string, Session[]>();
    for (const s of sessions) {
      const arr = map.get(s.session_date) ?? [];
      arr.push(s);
      map.set(s.session_date, arr);
    }
    return map;
  }, [sessions]);

  const optimisticKey = (sid: string, aid: string) => `${sid}::${aid}`;

  const isAssigned = (sessionId: string, assistantId: string): boolean => {
    const o = optimistic.get(optimisticKey(sessionId, assistantId));
    if (o !== undefined) return o;
    const s = sessions.find((x) => x.id === sessionId);
    return !!s && s.assignedAssistantIds.includes(assistantId);
  };

  const handleToggle = (sessionId: string, assistantId: string) => {
    const next = !isAssigned(sessionId, assistantId);
    setError(null);
    setOptimistic((prev) => {
      const m = new Map(prev);
      m.set(optimisticKey(sessionId, assistantId), next);
      return m;
    });
    startTransition(async () => {
      const r = await toggleAssistantAssignment(sessionId, assistantId, next);
      if (r.error) setError(r.error);
      router.refresh();
    });
  };

  const prev = prevMonth(year, month);
  const nx = nextMonth(year, month);
  const cells = useMemo(() => buildCells(year, month), [year, month]);

  const onCsv = () => {
    const lines: string[] = ['날짜,요일,기수,회차,' + assistants.map((a) => a.name).join(',')];
    const sorted = [...filteredSessions].sort((a, b) =>
      a.session_date.localeCompare(b.session_date)
    );
    for (const s of sorted) {
      const date = new Date(`${s.session_date}T00:00:00`);
      const row = [
        s.session_date,
        DOW[date.getDay()],
        `"${s.cohortName.replace(/"/g, '""')}"`,
        `"${(s.title ?? '').replace(/"/g, '""')}"`,
        ...assistants.map((a) => (isAssigned(s.id, a.id) ? 'O' : ''))
      ];
      lines.push(row.join(','));
    }
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `보조강사_배정_${year}-${String(month).padStart(2, '0')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const todayIso = new Date().toISOString().slice(0, 10);
  const openSession = openSessionId ? sessions.find((s) => s.id === openSessionId) : null;

  return (
    <div className='space-y-4'>
      {/* 상단 컨트롤 */}
      <div className='flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3'>
        <Link
          href={`?ym=${prev.y}-${String(prev.m).padStart(2, '0')}`}
          className='rounded-md border bg-background px-3 py-1.5 text-sm hover:bg-muted'
        >
          ← 이전 달
        </Link>
        <div className='min-w-[6rem] text-center text-base font-bold tabular-nums'>
          {year}년 {month}월
        </div>
        <Link
          href={`?ym=${nx.y}-${String(nx.m).padStart(2, '0')}`}
          className='rounded-md border bg-background px-3 py-1.5 text-sm hover:bg-muted'
        >
          다음 달 →
        </Link>

        <select
          value={filterCohort}
          onChange={(e) => setFilterCohort(e.target.value)}
          className='ml-auto h-9 rounded-md border bg-background px-3 text-sm'
        >
          <option value='all'>전체 기수 ({sessions.length}회차)</option>
          {cohortOptions.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <button
          type='button'
          onClick={onCsv}
          className='rounded-md border bg-background px-3 py-1.5 text-sm font-semibold hover:bg-muted'
        >
          CSV 다운로드
        </button>
      </div>

      {/* 인원별 배정 건수 */}
      <div className='rounded-xl border bg-card p-4'>
        <div className='mb-3 text-xs font-bold text-muted-foreground'>이달 배정 건수</div>
        <div className='flex flex-wrap gap-2'>
          {assistants.map((a) => (
            <div
              key={a.id}
              className='inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-sm'
            >
              <span className='font-semibold'>{a.name}</span>
              <span className='font-bold tabular-nums text-blue-600 dark:text-blue-400'>
                {a.count}건
              </span>
            </div>
          ))}
          {assistants.length === 0 && (
            <div className='text-muted-foreground text-sm'>
              등록된 보조강사가 없습니다 (instructors.kind = &apos;sub&apos;).
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className='rounded-md bg-red-50 px-4 py-2 text-sm text-red-700'>{error}</div>
      )}

      {/* 캘린더 */}
      <div className='overflow-hidden rounded-xl border bg-card'>
        <div className='grid grid-cols-7 border-b bg-muted/30'>
          {DOW.map((d, i) => (
            <div
              key={d}
              className={`px-2 py-2 text-center text-xs font-bold ${
                i === 0 ? 'text-red-600' : i === 6 ? 'text-blue-600' : 'text-muted-foreground'
              }`}
            >
              {d}
            </div>
          ))}
        </div>
        <div className='grid grid-cols-7'>
          {cells.map(({ date, key }) => {
            if (!date) {
              return (
                <div
                  key={key}
                  className='min-h-[120px] border-b border-r border-muted/30 bg-muted/10 last:border-r-0'
                />
              );
            }
            const d = new Date(`${date}T00:00:00`);
            const dow = d.getDay();
            const day = d.getDate();
            const list = sessionsByDate.get(date) ?? [];
            const isToday = date === todayIso;
            return (
              <div
                key={key}
                className={`flex min-h-[120px] flex-col gap-1 border-b border-r border-muted/30 p-1.5 last:border-r-0 ${
                  dow === 0 ? 'bg-rose-50/40' : dow === 6 ? 'bg-blue-50/30' : ''
                }`}
              >
                <div className='flex items-center justify-between'>
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                      isToday
                        ? 'bg-blue-600 text-white'
                        : dow === 0
                          ? 'text-red-600'
                          : dow === 6
                            ? 'text-blue-600'
                            : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {day}
                  </span>
                </div>
                <div className='flex flex-col gap-1'>
                  {list.map((s) => {
                    const color = colorForCohort(s.cohortName);
                    const assignedNames = assistants
                      .filter((a) => isAssigned(s.id, a.id))
                      .map((a) => a.name);
                    const isSelf = s.kind === 'selfstudy';
                    return (
                      <button
                        key={s.id}
                        type='button'
                        onClick={() => setOpenSessionId(s.id)}
                        className={`group rounded-md border-l-[3px] px-2 py-1.5 text-left transition-colors hover:bg-muted ${
                          isSelf
                            ? 'border-dashed bg-slate-50/60 dark:bg-slate-900/30'
                            : 'bg-background'
                        }`}
                        style={{ borderLeftColor: color }}
                        title={`${s.cohortName} · ${s.title}`}
                      >
                        <div className='flex items-center gap-1'>
                          <span
                            className={`truncate text-[11px] font-semibold ${
                              isSelf
                                ? 'text-slate-600 dark:text-slate-400'
                                : 'text-slate-900 dark:text-slate-100'
                            }`}
                          >
                            {s.cohortName}
                          </span>
                          {isSelf && (
                            <span className='shrink-0 rounded-sm bg-slate-200 px-1 text-[9px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300'>
                              셀프
                            </span>
                          )}
                        </div>
                        {s.title && !isSelf && (
                          <div className='truncate text-[10px] text-muted-foreground'>
                            {s.title}
                          </div>
                        )}
                        <div className='mt-1 flex flex-wrap gap-0.5'>
                          {assignedNames.length === 0 ? (
                            <span
                              className={`inline-block rounded-sm px-1 text-[10px] font-semibold ${
                                isSelf
                                  ? 'bg-slate-100 text-slate-500 dark:bg-slate-800/60 dark:text-slate-500'
                                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                              }`}
                            >
                              미배정
                            </span>
                          ) : (
                            assignedNames.map((n) => (
                              <span
                                key={n}
                                className='inline-block rounded-sm bg-emerald-100 px-1 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                              >
                                {n}
                              </span>
                            ))
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 모달: 보조강사 토글 */}
      {openSession && (
        <div
          className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4'
          onClick={() => setOpenSessionId(null)}
        >
          <div
            className='w-full max-w-md rounded-2xl bg-background p-6 shadow-2xl'
            onClick={(e) => e.stopPropagation()}
          >
            <div className='mb-4'>
              <div className='text-xs font-semibold text-muted-foreground'>
                {openSession.session_date} ·{' '}
                {DOW[new Date(`${openSession.session_date}T00:00:00`).getDay()]}요일
              </div>
              <div className='mt-1 flex items-center gap-2'>
                <span
                  className='inline-block h-3 w-3 rounded-full'
                  style={{ backgroundColor: colorForCohort(openSession.cohortName) }}
                />
                <h2 className='text-base font-bold'>{openSession.cohortName}</h2>
              </div>
              {openSession.title && (
                <div className='mt-0.5 text-sm text-muted-foreground'>{openSession.title}</div>
              )}
            </div>
            <div className='mb-4 text-xs font-semibold text-muted-foreground'>
              보조강사 선택 — 같은 날 다른 회차에 이미 배정된 인원은 선택 불가
            </div>
            <div className='grid grid-cols-2 gap-2'>
              {assistants.map((a) => {
                const on = isAssigned(openSession.id, a.id);
                // 같은 날 다른 회차에 이미 배정됐는지 확인
                const sameDay = allSessionsByDate.get(openSession.session_date) ?? [];
                const conflictWith = sameDay.find(
                  (other) => other.id !== openSession.id && isAssigned(other.id, a.id)
                );
                const blocked = !!conflictWith && !on;
                return (
                  <button
                    key={a.id}
                    type='button'
                    onClick={() => handleToggle(openSession.id, a.id)}
                    disabled={pending || blocked}
                    title={
                      blocked && conflictWith
                        ? `${conflictWith.cohortName} 에 이미 배정됨`
                        : undefined
                    }
                    className={`flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                      on
                        ? 'border-blue-500 bg-blue-50 text-blue-900 dark:bg-blue-950/40 dark:text-blue-100'
                        : blocked
                          ? 'cursor-not-allowed border-rose-200 bg-rose-50/60 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300'
                          : 'bg-background text-muted-foreground hover:bg-muted'
                    } disabled:opacity-50`}
                  >
                    <div className='flex w-full items-center justify-between'>
                      <span>{a.name}</span>
                      {on && <span className='text-base font-bold'>✓</span>}
                      {blocked && <span className='text-[10px] font-bold'>충돌</span>}
                    </div>
                    {blocked && conflictWith && (
                      <div className='text-[10px] leading-tight text-rose-600/80 dark:text-rose-300/80'>
                        {conflictWith.cohortName}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            <div className='mt-5 flex justify-end'>
              <button
                type='button'
                onClick={() => setOpenSessionId(null)}
                className='rounded-md border bg-background px-4 py-2 text-sm font-semibold hover:bg-muted'
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

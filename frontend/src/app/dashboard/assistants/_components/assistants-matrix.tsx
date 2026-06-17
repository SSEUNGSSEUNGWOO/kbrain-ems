'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  createExternalEvent,
  deleteExternalEvent,
  toggleAssistantAssignment,
  toggleDailyAvailability,
  toggleExternalAssistant,
  toggleSelfStudyAssistant,
  toggleSessionNotRequired
} from '../_actions';
import { colorForCohort } from './cohort-color';

type Assistant = { id: string; name: string; count: number };

type Row = {
  id: string;
  realSessionId: string | null;
  externalEventId: string | null;
  selfStudy: { cohortId: string; onDate: string } | null;
  date: string;
  title: string;
  cohortId: string;
  cohortName: string;
  category: string;
  assignedAssistantIds: string[];
  markedAssistantIds: string[];
  kind: 'lesson' | 'selfstudy' | 'external';
  notRequired: boolean;
};

const CATEGORY_OPTIONS: { value: string; label: string; color: string }[] = [
  { value: 'general', label: '일반과정', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  { value: 'champion', label: 'AI 챔피언', color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300' },
  { value: 'experts', label: '전문인재', color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300' },
  { value: 'special', label: '특화교육', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  { value: 'external', label: '외부 일정', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' }
];

type Props = {
  year: number;
  month: number;
  assistants: Assistant[];
  rows: Row[];
};

const DOW = ['일', '월', '화', '수', '목', '금', '토'] as const;

function prevMonth(year: number, month: number) {
  return month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
}
function nextMonth(year: number, month: number) {
  return month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
}

function buildCells(year: number, month: number): { date: string | null; key: string }[] {
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const startWeekday = first.getDay();
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

export function AssistantsMatrix({ year, month, assistants, rows }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [filterCategories, setFilterCategories] = useState<Set<string>>(
    new Set(CATEGORY_OPTIONS.map((c) => c.value))
  );
  const toggleCategory = (v: string) =>
    setFilterCategories((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const [showExternalForm, setShowExternalForm] = useState(false);
  // 낙관적 표시
  const [optimistic, setOptimistic] = useState<Map<string, boolean>>(new Map());
  const [optimisticNotReq, setOptimisticNotReq] = useState<Map<string, boolean>>(new Map());
  const [optimisticMark, setOptimisticMark] = useState<Map<string, boolean>>(new Map());

  const filteredRows = useMemo(
    () => rows.filter((r) => filterCategories.has(r.category)),
    [rows, filterCategories]
  );

  const rowsByDate = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of filteredRows) {
      const arr = m.get(r.date) ?? [];
      arr.push(r);
      m.set(r.date, arr);
    }
    return m;
  }, [filteredRows]);

  const allRowsByDate = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows) {
      const arr = m.get(r.date) ?? [];
      arr.push(r);
      m.set(r.date, arr);
    }
    return m;
  }, [rows]);

  const optimisticKey = (rid: string, aid: string) => `${rid}::${aid}`;

  const isAssigned = (row: Row, assistantId: string): boolean => {
    const o = optimistic.get(optimisticKey(row.id, assistantId));
    if (o !== undefined) return o;
    return row.assignedAssistantIds.includes(assistantId);
  };

  const isNotRequired = (row: Row): boolean => {
    const o = optimisticNotReq.get(row.id);
    if (o !== undefined) return o;
    return row.notRequired;
  };

  // 가용 마크는 (date, assistant) 단위라 row.id 가 아닌 date 로 key 구성.
  const markKey = (date: string, aid: string) => `${date}::${aid}`;

  const isMarked = (row: Row, assistantId: string): boolean => {
    const o = optimisticMark.get(markKey(row.date, assistantId));
    if (o !== undefined) return o;
    return row.markedAssistantIds.includes(assistantId);
  };

  const handleToggleMark = (row: Row, assistantId: string) => {
    const next = !isMarked(row, assistantId);
    setError(null);
    setOptimisticMark((prev) => {
      const m = new Map(prev);
      m.set(markKey(row.date, assistantId), next);
      return m;
    });
    startTransition(async () => {
      const r = await toggleDailyAvailability(row.date, assistantId, next);
      if (r.error) {
        setError(r.error);
        setOptimisticMark((prev) => {
          const m = new Map(prev);
          m.delete(markKey(row.date, assistantId));
          return m;
        });
      }
      router.refresh();
    });
  };

  const handleToggle = (row: Row, assistantId: string) => {
    if (row.kind === 'lesson' && isNotRequired(row)) return;
    const next = !isAssigned(row, assistantId);
    setError(null);
    setOptimistic((prev) => {
      const m = new Map(prev);
      m.set(optimisticKey(row.id, assistantId), next);
      return m;
    });
    startTransition(async () => {
      let r: { error?: string } = {};
      if (row.kind === 'lesson' && row.realSessionId) {
        r = await toggleAssistantAssignment(row.realSessionId, assistantId, next);
      } else if (row.kind === 'external' && row.externalEventId) {
        r = await toggleExternalAssistant(row.externalEventId, assistantId, next);
      } else if (row.kind === 'selfstudy' && row.selfStudy) {
        r = await toggleSelfStudyAssistant(
          row.selfStudy.cohortId,
          row.selfStudy.onDate,
          assistantId,
          next
        );
      }
      if (r.error) {
        setError(r.error);
        // 실패 시 낙관적 표시 롤백
        setOptimistic((prev) => {
          const m = new Map(prev);
          m.delete(optimisticKey(row.id, assistantId));
          return m;
        });
      }
      router.refresh();
    });
  };

  const handleToggleNotRequired = (row: Row) => {
    if (!row.realSessionId) return;
    const next = !isNotRequired(row);
    setError(null);
    setOptimisticNotReq((prev) => {
      const m = new Map(prev);
      m.set(row.id, next);
      return m;
    });
    startTransition(async () => {
      const r = await toggleSessionNotRequired(row.realSessionId!, next);
      if (r.error) {
        setError(r.error);
        setOptimisticNotReq((prev) => {
          const m = new Map(prev);
          m.delete(row.id);
          return m;
        });
      }
      router.refresh();
    });
  };

  const handleDeleteExternal = (row: Row) => {
    if (!row.externalEventId) return;
    if (!confirm('이 외부 일정 카드를 삭제하시겠습니까?')) return;
    startTransition(async () => {
      const r = await deleteExternalEvent(row.externalEventId!);
      if (r.error) setError(r.error);
      setOpenRowId(null);
      router.refresh();
    });
  };

  const prev = prevMonth(year, month);
  const nx = nextMonth(year, month);
  const cells = useMemo(() => buildCells(year, month), [year, month]);

  const onCsv = () => {
    const lines: string[] = ['날짜,요일,기수/기관,일정,종류,' + assistants.map((a) => a.name).join(',')];
    const sorted = [...filteredRows].sort((a, b) => a.date.localeCompare(b.date));
    for (const r of sorted) {
      const date = new Date(`${r.date}T00:00:00`);
      const kindLabel =
        r.kind === 'selfstudy' ? '셀프스터디' : r.kind === 'external' ? '외부일정' : '수업';
      const row = [
        r.date,
        DOW[date.getDay()],
        `"${r.cohortName.replace(/"/g, '""')}"`,
        `"${(r.title ?? '').replace(/"/g, '""')}"`,
        kindLabel,
        ...assistants.map((a) => (isAssigned(r, a.id) ? 'O' : ''))
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
  const openRow = openRowId ? rows.find((r) => r.id === openRowId) : null;

  // 모달용 — 이 날 가용 보조강사 (다른 곳에 배정 안 됨)
  const availableAssistantsForDate = (date: string, selfRowId: string) => {
    const dayRows = allRowsByDate.get(date) ?? [];
    return assistants.filter((a) => {
      // 자기 자신은 가용 list 에서 제외 (배정/미배정 상관 없이 다른 곳 기준)
      const conflict = dayRows.find((r) => r.id !== selfRowId && isAssigned(r, a.id));
      return !conflict;
    });
  };

  return (
    <div className='space-y-4'>
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

        <button
          type='button'
          onClick={() => setShowExternalForm(true)}
          className='ml-auto rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700'
        >
          + 외부 일정
        </button>
        <button
          type='button'
          onClick={onCsv}
          className='rounded-md border bg-background px-3 py-1.5 text-sm font-semibold hover:bg-muted'
        >
          CSV 다운로드
        </button>
      </div>

      {/* 카테고리 체크박스 필터 */}
      <div className='flex flex-wrap items-center gap-2 rounded-xl border bg-card px-4 py-3'>
        <span className='text-xs font-bold text-muted-foreground'>카테고리</span>
        {CATEGORY_OPTIONS.map((c) => {
          const count = rows.filter((r) => r.category === c.value).length;
          const on = filterCategories.has(c.value);
          return (
            <label
              key={c.value}
              className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                on ? c.color + ' border-current' : 'bg-background text-muted-foreground hover:bg-muted'
              }`}
            >
              <input
                type='checkbox'
                checked={on}
                onChange={() => toggleCategory(c.value)}
                className='h-3.5 w-3.5'
              />
              <span>{c.label}</span>
              <span className='tabular-nums opacity-70'>({count})</span>
            </label>
          );
        })}
        <button
          type='button'
          onClick={() =>
            setFilterCategories(new Set(CATEGORY_OPTIONS.map((c) => c.value)))
          }
          className='ml-auto text-xs text-muted-foreground hover:underline'
        >
          전체 선택
        </button>
        <button
          type='button'
          onClick={() => setFilterCategories(new Set())}
          className='text-xs text-muted-foreground hover:underline'
        >
          전체 해제
        </button>
      </div>

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
            const list = rowsByDate.get(date) ?? [];
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
                  {list.map((r) => {
                    const color = colorForCohort(r.cohortName);
                    const assignedNames = assistants
                      .filter((a) => isAssigned(r, a.id))
                      .map((a) => a.name);
                    const isSelf = r.kind === 'selfstudy';
                    const isExt = r.kind === 'external';
                    const notReq = isNotRequired(r);
                    return (
                      <button
                        key={r.id}
                        type='button'
                        onClick={() => setOpenRowId(r.id)}
                        className={`group rounded-md border-l-[3px] px-2 py-1.5 text-left transition-colors hover:bg-muted ${
                          isSelf
                            ? 'border-dashed bg-slate-50/60 dark:bg-slate-900/30'
                            : isExt
                              ? 'bg-indigo-50/40 dark:bg-indigo-950/20'
                              : 'bg-background'
                        } ${notReq ? 'opacity-50' : ''}`}
                        style={{ borderLeftColor: color }}
                        title={`${r.cohortName} · ${r.title}`}
                      >
                        <div className='flex items-center gap-1'>
                          <span
                            className={`truncate text-[11px] font-semibold ${
                              isSelf
                                ? 'text-slate-600 dark:text-slate-400'
                                : 'text-slate-900 dark:text-slate-100'
                            }`}
                          >
                            {r.cohortName}
                          </span>
                          {isSelf && (
                            <span className='shrink-0 rounded-sm bg-slate-200 px-1 text-[9px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300'>
                              셀프
                            </span>
                          )}
                          {isExt && (
                            <span className='shrink-0 rounded-sm bg-indigo-200 px-1 text-[9px] font-semibold text-indigo-700 dark:bg-indigo-800 dark:text-indigo-200'>
                              외부
                            </span>
                          )}
                        </div>
                        {r.title && !isSelf && (
                          <div className='truncate text-[10px] text-muted-foreground'>
                            {r.title}
                          </div>
                        )}
                        <div className='mt-1 flex flex-wrap gap-0.5'>
                          {notReq ? (
                            <span className='inline-block rounded-sm bg-slate-200 px-1 text-[10px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300'>
                              불필요
                            </span>
                          ) : assignedNames.length === 0 ? (
                            <span className='inline-block rounded-sm bg-amber-100 px-1 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'>
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
                          {!notReq && r.markedAssistantIds.length > 0 && (
                            <span
                              className='inline-block rounded-sm bg-amber-50 px-1 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                              title={`가능 표시 ${r.markedAssistantIds.length}명`}
                            >
                              ★{r.markedAssistantIds.length}
                            </span>
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

      {/* 외부 일정 추가 모달 */}
      {showExternalForm && (
        <ExternalEventForm
          onClose={() => setShowExternalForm(false)}
          onError={setError}
        />
      )}

      {/* 배정 모달 */}
      {openRow && (
        <AssignmentModal
          row={openRow}
          assistants={assistants}
          available={availableAssistantsForDate(openRow.date, openRow.id)}
          isAssigned={(aid) => isAssigned(openRow, aid)}
          isMarked={(aid) => isMarked(openRow, aid)}
          isNotRequired={isNotRequired(openRow)}
          pending={pending}
          onToggle={(aid) => handleToggle(openRow, aid)}
          onToggleMark={(aid) => handleToggleMark(openRow, aid)}
          onToggleNotRequired={() => handleToggleNotRequired(openRow)}
          onDeleteExternal={() => handleDeleteExternal(openRow)}
          onClose={() => setOpenRowId(null)}
        />
      )}
    </div>
  );
}

function AssignmentModal({
  row,
  assistants,
  available,
  isAssigned,
  isMarked,
  isNotRequired,
  pending,
  onToggle,
  onToggleMark,
  onToggleNotRequired,
  onDeleteExternal,
  onClose
}: {
  row: Row;
  assistants: Assistant[];
  available: Assistant[];
  isAssigned: (aid: string) => boolean;
  isMarked: (aid: string) => boolean;
  isNotRequired: boolean;
  pending: boolean;
  onToggle: (aid: string) => void;
  onToggleMark: (aid: string) => void;
  onToggleNotRequired: () => void;
  onDeleteExternal: () => void;
  onClose: () => void;
}) {
  const kindLabel =
    row.kind === 'selfstudy' ? '셀프스터디' : row.kind === 'external' ? '외부 일정' : '수업';

  return (
    <div
      className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4'
      onClick={onClose}
    >
      <div
        className='w-full max-w-md rounded-2xl bg-background p-6 shadow-2xl'
        onClick={(e) => e.stopPropagation()}
      >
        <div className='mb-4'>
          <div className='flex items-center justify-between text-xs font-semibold text-muted-foreground'>
            <span>
              {row.date} · {DOW[new Date(`${row.date}T00:00:00`).getDay()]}요일 · {kindLabel}
            </span>
            {row.kind === 'external' && (
              <button
                type='button'
                onClick={onDeleteExternal}
                className='text-rose-500 hover:underline'
              >
                삭제
              </button>
            )}
          </div>
          <div className='mt-1 flex items-center gap-2'>
            <span
              className='inline-block h-3 w-3 rounded-full'
              style={{ backgroundColor: colorForCohort(row.cohortName) }}
            />
            <h2 className='text-base font-bold'>{row.cohortName}</h2>
          </div>
          {row.title && row.kind !== 'selfstudy' && (
            <div className='mt-0.5 text-sm text-muted-foreground'>{row.title}</div>
          )}
        </div>

        {/* 배정 대상 아님 토글 (lesson 만) */}
        {row.kind === 'lesson' && (
          <label className='mb-4 flex cursor-pointer items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm'>
            <input
              type='checkbox'
              checked={isNotRequired}
              onChange={onToggleNotRequired}
              disabled={pending}
              className='h-4 w-4'
            />
            <span>이 회차는 보조강사 배정 대상 아님</span>
          </label>
        )}

        {/* 가용 인원 요약 */}
        {!isNotRequired && (
          <div className='mb-4 rounded-md border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-xs dark:border-emerald-900/40 dark:bg-emerald-950/30'>
            <div className='mb-1 font-semibold text-emerald-800 dark:text-emerald-300'>
              이 날 가용 보조강사 ({available.length}명)
            </div>
            {available.length === 0 ? (
              <div className='text-emerald-700/80 dark:text-emerald-400/80'>
                모두 다른 일정에 배정돼 있습니다.
              </div>
            ) : (
              <div className='text-emerald-700 dark:text-emerald-300'>
                {available.map((a) => a.name).join(', ')}
              </div>
            )}
          </div>
        )}

        {/* 가용 인원 마크 */}
        {!isNotRequired && (
          <div className='mb-4'>
            <div className='mb-1.5 text-xs font-semibold text-muted-foreground'>
              ★ 이 날 가능한 보조강사 (날짜 단위, 모든 회차 공유)
            </div>
            <div className='flex flex-wrap gap-1.5'>
              {assistants.map((a) => {
                const m = isMarked(a.id);
                return (
                  <button
                    key={a.id}
                    type='button'
                    onClick={() => onToggleMark(a.id)}
                    disabled={pending}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                      m
                        ? 'border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200'
                        : 'border-muted bg-background text-muted-foreground hover:bg-muted'
                    } disabled:opacity-50`}
                  >
                    <span>{m ? '★' : '☆'}</span>
                    <span>{a.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 보조강사 토글 */}
        {!isNotRequired && (
          <>
            <div className='mb-2 text-xs font-semibold text-muted-foreground'>
              보조강사 선택 — 같은 날 다른 일정에 이미 있는 인원은 선택 불가
            </div>
            <div className='grid grid-cols-2 gap-2'>
              {assistants.map((a) => {
                const on = isAssigned(a.id);
                const isAvail = available.some((x) => x.id === a.id);
                const blocked = !on && !isAvail;
                const marked = isMarked(a.id);
                return (
                  <button
                    key={a.id}
                    type='button'
                    onClick={() => onToggle(a.id)}
                    disabled={pending || blocked}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                      on
                        ? 'border-blue-500 bg-blue-50 text-blue-900 dark:bg-blue-950/40 dark:text-blue-100'
                        : blocked
                          ? 'cursor-not-allowed border-rose-200 bg-rose-50/60 text-rose-600 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300'
                          : marked
                            ? 'border-amber-300 bg-amber-50/50 text-amber-900 dark:bg-amber-950/20 dark:text-amber-200'
                            : 'bg-background text-muted-foreground hover:bg-muted'
                    } disabled:opacity-60`}
                  >
                    <span className='flex items-center gap-1'>
                      {marked && <span className='text-amber-500'>★</span>}
                      {a.name}
                    </span>
                    {on && <span className='text-base font-bold'>✓</span>}
                    {blocked && <span className='text-[10px] font-bold'>충돌</span>}
                  </button>
                );
              })}
            </div>
          </>
        )}

        <div className='mt-5 flex justify-end'>
          <button
            type='button'
            onClick={onClose}
            className='rounded-md border bg-background px-4 py-2 text-sm font-semibold hover:bg-muted'
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

function ExternalEventForm({
  onClose,
  onError
}: {
  onClose: () => void;
  onError: (s: string | null) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState('');
  const [organization, setOrganization] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [requiredCount, setRequiredCount] = useState(1);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onError(null);
    startTransition(async () => {
      const r = await createExternalEvent({
        title,
        organization,
        startDate,
        endDate,
        requiredCount
      });
      if (r.error) {
        onError(r.error);
        return;
      }
      onClose();
      router.refresh();
    });
  };

  return (
    <div
      className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4'
      onClick={onClose}
    >
      <form
        onSubmit={onSubmit}
        onClick={(e) => e.stopPropagation()}
        className='w-full max-w-md space-y-4 rounded-2xl bg-background p-6 shadow-2xl'
      >
        <h2 className='text-base font-bold'>외부 일정 추가</h2>
        <p className='text-xs text-muted-foreground'>
          cohort 가 아닌 일정 (출장, 기관 행사 등). 시작~종료일 매일 1 row 가 만들어집니다.
        </p>

        <div className='grid gap-3'>
          <label className='block'>
            <span className='mb-1 block text-xs font-semibold text-muted-foreground'>
              제목 *
            </span>
            <input
              type='text'
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder='예: 신입 직원 교육'
              className='w-full rounded-md border bg-background px-3 py-2 text-sm'
            />
          </label>
          <label className='block'>
            <span className='mb-1 block text-xs font-semibold text-muted-foreground'>
              기관·소속
            </span>
            <input
              type='text'
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              placeholder='예: 서울교통공사'
              className='w-full rounded-md border bg-background px-3 py-2 text-sm'
            />
          </label>
          <div className='grid grid-cols-2 gap-3'>
            <label className='block'>
              <span className='mb-1 block text-xs font-semibold text-muted-foreground'>
                시작일 *
              </span>
              <input
                type='date'
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                className='w-full rounded-md border bg-background px-3 py-2 text-sm'
              />
            </label>
            <label className='block'>
              <span className='mb-1 block text-xs font-semibold text-muted-foreground'>
                종료일 *
              </span>
              <input
                type='date'
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
                className='w-full rounded-md border bg-background px-3 py-2 text-sm'
              />
            </label>
          </div>
          <label className='block'>
            <span className='mb-1 block text-xs font-semibold text-muted-foreground'>
              필요 보조강사 수
            </span>
            <input
              type='number'
              min={1}
              max={10}
              value={requiredCount}
              onChange={(e) => setRequiredCount(Number(e.target.value))}
              className='w-24 rounded-md border bg-background px-3 py-2 text-sm'
            />
          </label>
        </div>

        <div className='flex justify-end gap-2'>
          <button
            type='button'
            onClick={onClose}
            className='rounded-md border px-4 py-2 text-sm font-semibold hover:bg-muted'
          >
            취소
          </button>
          <button
            type='submit'
            disabled={pending}
            className='rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50'
          >
            {pending ? '추가 중...' : '추가'}
          </button>
        </div>
      </form>
    </div>
  );
}

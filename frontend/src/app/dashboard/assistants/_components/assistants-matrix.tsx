'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toggleAssistantAssignment } from '../_actions';

type Assistant = { id: string; name: string; count: number };

type Session = {
  id: string;
  session_date: string;
  title: string;
  cohortId: string;
  cohortName: string;
  assignedAssistantIds: string[];
};

type Props = {
  year: number;
  month: number;
  assistants: Assistant[];
  sessions: Session[];
};

const DOW = ['일', '월', '화', '수', '목', '금', '토'] as const;

function formatKoreanDate(d: string): string {
  const date = new Date(`${d}T00:00:00`);
  return `${d.slice(5).replace('-', '/')} (${DOW[date.getDay()]})`;
}

function prevMonth(year: number, month: number) {
  return month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
}
function nextMonth(year: number, month: number) {
  return month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
}

export function AssistantsMatrix({ year, month, assistants, sessions }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [filterCohort, setFilterCohort] = useState<string>('all');
  // 클릭 직후 낙관적 표시용 — 서버 round-trip 끝나면 router.refresh 가 데이터 갱신
  const [optimistic, setOptimistic] = useState<Map<string, Set<string>>>(new Map());

  const cohortOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of sessions) {
      if (s.cohortId) map.set(s.cohortId, s.cohortName);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], 'ko'));
  }, [sessions]);

  const filteredSessions =
    filterCohort === 'all' ? sessions : sessions.filter((s) => s.cohortId === filterCohort);

  const isAssigned = (sessionId: string, assistantId: string): boolean => {
    const overlay = optimistic.get(sessionId);
    if (overlay && overlay.has(assistantId)) {
      // overlay 가 마지막 클릭 상태를 표시 (toggle 의도 반영)
      return overlay.has(`${assistantId}::on`);
    }
    const s = sessions.find((x) => x.id === sessionId);
    return !!s && s.assignedAssistantIds.includes(assistantId);
  };

  const handleToggle = (sessionId: string, assistantId: string) => {
    const currently = isAssigned(sessionId, assistantId);
    const next = !currently;
    setError(null);
    setOptimistic((prev) => {
      const m = new Map(prev);
      const set = new Set(m.get(sessionId) ?? []);
      // 모든 이전 상태 클리어 후 새 상태 표시
      set.delete(assistantId);
      set.delete(`${assistantId}::on`);
      set.add(assistantId);
      if (next) set.add(`${assistantId}::on`);
      m.set(sessionId, set);
      return m;
    });
    startTransition(async () => {
      const r = await toggleAssistantAssignment(sessionId, assistantId, next);
      if (r.error) {
        setError(r.error);
      }
      router.refresh();
    });
  };

  const prev = prevMonth(year, month);
  const nx = nextMonth(year, month);

  const onCsv = () => {
    const lines: string[] = ['날짜,요일,기수,회차,' + assistants.map((a) => a.name).join(',')];
    for (const s of filteredSessions) {
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
              <span className='text-blue-600 dark:text-blue-400 font-bold tabular-nums'>
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

      {/* 매트릭스 */}
      <div className='rounded-xl border bg-card overflow-x-auto'>
        {filteredSessions.length === 0 ? (
          <div className='text-muted-foreground px-6 py-12 text-center text-sm'>
            이 달에 등록된 회차가 없습니다.
          </div>
        ) : (
          <table className='w-full text-sm'>
            <thead>
              <tr className='border-b bg-muted/40'>
                <th className='whitespace-nowrap px-3 py-2 text-left font-semibold'>날짜</th>
                <th className='whitespace-nowrap px-3 py-2 text-left font-semibold'>기수 · 회차</th>
                {assistants.map((a) => (
                  <th
                    key={a.id}
                    className='whitespace-nowrap px-2 py-2 text-center font-semibold'
                    title={a.name}
                  >
                    {a.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredSessions.map((s) => (
                <tr key={s.id} className='border-b last:border-0 hover:bg-muted/20'>
                  <td className='whitespace-nowrap px-3 py-2 font-mono text-xs'>
                    {formatKoreanDate(s.session_date)}
                  </td>
                  <td className='px-3 py-2'>
                    <div className='font-medium'>{s.cohortName}</div>
                    {s.title && (
                      <div className='text-xs text-muted-foreground'>{s.title}</div>
                    )}
                  </td>
                  {assistants.map((a) => {
                    const on = isAssigned(s.id, a.id);
                    return (
                      <td key={a.id} className='px-2 py-2 text-center'>
                        <button
                          type='button'
                          onClick={() => handleToggle(s.id, a.id)}
                          disabled={pending}
                          aria-pressed={on}
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-md border text-sm font-bold transition-colors ${
                            on
                              ? 'border-blue-500 bg-blue-500 text-white shadow-sm'
                              : 'border-muted-foreground/20 bg-background text-muted-foreground/40 hover:bg-muted'
                          } disabled:opacity-50`}
                          title={`${a.name} ${on ? '배정 해제' : '배정'}`}
                        >
                          {on ? '✓' : ''}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

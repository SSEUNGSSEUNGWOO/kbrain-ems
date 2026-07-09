'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

// 응시자 목록 정렬 · 검색 지원 클라이언트 테이블.
// 서버에서 이미 집계된 rows를 받아 표시만 담당 — 재조회 없이 URL 변경도 없음.

export type SessionRow = {
  id: string;
  name: string;
  email: string | null;
  status: 'in_progress' | 'submitted' | 'graded' | string;
  startedAtIso: string | null;
  submittedAtIso: string | null;
  progressCurrent: number; // 응답 수 or current_order_no
  progressTotal: number;
  mcScore: number | null;
  stScore: number | null;
  taskScore: number | null;
  totalScore: number;
  exitCount: number;
  exitTotalMs: number;
};

type Props = {
  examId: string;
  rows: SessionRow[];
  sectionMax: { mc: number; st: number; task: number };
  statusLabel: Record<string, string>;
  statusTone: Record<string, string>;
};

// Client Component에는 함수를 prop으로 넘길 수 없어 내부 정의.
function formatKst(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    dateStyle: 'short',
    timeStyle: 'short'
  });
}
function formatSecFromMs(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}초`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return rs === 0 ? `${m}분` : `${m}분 ${rs}초`;
}

type SortKey =
  | 'name'
  | 'status'
  | 'progress'
  | 'mc'
  | 'st'
  | 'task'
  | 'total'
  | 'exit'
  | 'startedAt'
  | 'submittedAt';
type SortDir = 'asc' | 'desc';

// 서버 안에서 실행돼도 안전한 컴포넌트 — Date 변환 등은 props로 받은 함수 사용
export function SessionsTable(props: Props) {
  const { examId, rows, sectionMax, statusLabel, statusTone } = props;
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [query, setQuery] = useState('');

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      return (
        r.name.toLowerCase().includes(q) ||
        (r.email ?? '').toLowerCase().includes(q) ||
        (statusLabel[r.status] ?? r.status).toLowerCase().includes(q)
      );
    });
  }, [rows, query, statusLabel]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === 'asc' ? 1 : -1;
    const getVal = (r: SessionRow): number | string => {
      switch (sortKey) {
        case 'name':
          return r.name;
        case 'status':
          return statusLabel[r.status] ?? r.status;
        case 'progress':
          return r.progressCurrent / (r.progressTotal || 1);
        case 'mc':
          return r.mcScore ?? -1;
        case 'st':
          return r.stScore ?? -1;
        case 'task':
          return r.taskScore ?? -1;
        case 'total':
          return r.totalScore;
        case 'exit':
          return r.exitCount * 1000 + r.exitTotalMs / 1000;
        case 'startedAt':
          return r.startedAtIso ? new Date(r.startedAtIso).getTime() : 0;
        case 'submittedAt':
          return r.submittedAtIso ? new Date(r.submittedAtIso).getTime() : 0;
      }
    };
    arr.sort((a, b) => {
      const va = getVal(a);
      const vb = getVal(b);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb), 'ko') * dir;
    });
    return arr;
  }, [filtered, sortKey, sortDir, statusLabel]);

  const arrow = (key: SortKey) => {
    if (sortKey !== key) return <span className='opacity-30'>↕</span>;
    return <span className='text-blue-600'>{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  const SortHeader = ({ k, children, align = 'left' }: { k: SortKey; children: React.ReactNode; align?: 'left' | 'right' }) => (
    <button
      type='button'
      onClick={() => toggleSort(k)}
      className={`flex items-center gap-1 w-full ${
        align === 'right' ? 'justify-end' : 'justify-start'
      } hover:text-blue-600 transition-colors cursor-pointer`}
    >
      <span>{children}</span>
      <span className='text-xs'>{arrow(k)}</span>
    </button>
  );

  return (
    <div className='space-y-3'>
      <div className='flex items-center gap-3'>
        <input
          type='search'
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='이름·이메일·상태 검색'
          className='w-64 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
        />
        <div className='text-xs text-muted-foreground'>
          {sorted.length}명 / 전체 {rows.length}명
        </div>
      </div>

      <div className='rounded-lg border overflow-x-auto'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <SortHeader k='name'>응시자</SortHeader>
              </TableHead>
              <TableHead>
                <SortHeader k='status'>상태</SortHeader>
              </TableHead>
              <TableHead className='text-right'>
                <SortHeader k='progress' align='right'>진행</SortHeader>
              </TableHead>
              <TableHead className='text-right' title={`객관식 만점 ${sectionMax.mc}점`}>
                <SortHeader k='mc' align='right'>객관식</SortHeader>
              </TableHead>
              <TableHead className='text-right' title={`단답형 만점 ${sectionMax.st}점`}>
                <SortHeader k='st' align='right'>단답형</SortHeader>
              </TableHead>
              <TableHead className='text-right' title={`작업형 만점 ${sectionMax.task}점`}>
                <SortHeader k='task' align='right'>작업형</SortHeader>
              </TableHead>
              <TableHead className='text-right'>
                <SortHeader k='total' align='right'>총점</SortHeader>
              </TableHead>
              <TableHead className='text-right'>
                <SortHeader k='exit' align='right'>이탈</SortHeader>
              </TableHead>
              <TableHead>
                <SortHeader k='startedAt'>시작</SortHeader>
              </TableHead>
              <TableHead>
                <SortHeader k='submittedAt'>제출</SortHeader>
              </TableHead>
              <TableHead className='w-12'></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} className='text-muted-foreground py-10 text-center text-sm'>
                  {rows.length === 0 ? '아직 발급된 응시자 세션이 없습니다.' : '검색 결과가 없습니다.'}
                </TableCell>
              </TableRow>
            )}
            {sorted.map((r) => {
              const isSubmitted = !!r.submittedAtIso;
              const totalMax = sectionMax.mc + sectionMax.st + sectionMax.task;
              const mcCell = isSubmitted && r.mcScore != null ? `${r.mcScore}/${sectionMax.mc}` : '-';
              const stCell = isSubmitted && r.stScore != null ? `${r.stScore}/${sectionMax.st}` : '-';
              const taskCell = !isSubmitted
                ? '-'
                : r.taskScore != null
                  ? `${r.taskScore}/${sectionMax.task}`
                  : '대기';
              const totalCell = !isSubmitted ? '-' : `${r.totalScore}/${totalMax}`;
              const progress = r.submittedAtIso
                ? `${r.progressTotal}/${r.progressTotal}`
                : r.progressCurrent > 0
                  ? `${r.progressCurrent}/${r.progressTotal}`
                  : '-';
              return (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className='font-medium'>{r.name}</div>
                    {r.email && <div className='text-muted-foreground text-xs'>{r.email}</div>}
                  </TableCell>
                  <TableCell>
                    <Badge variant='outline' className={statusTone[r.status] ?? ''}>
                      {statusLabel[r.status] ?? r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>{progress}</TableCell>
                  <TableCell className='text-right tabular-nums'>{mcCell}</TableCell>
                  <TableCell className='text-right tabular-nums'>{stCell}</TableCell>
                  <TableCell className='text-right tabular-nums'>
                    {taskCell === '대기' ? (
                      <span className='text-amber-700 font-medium'>대기</span>
                    ) : (
                      taskCell
                    )}
                  </TableCell>
                  <TableCell className='text-right tabular-nums font-semibold'>{totalCell}</TableCell>
                  <TableCell className='text-right tabular-nums'>
                    {r.exitCount > 0 ? (
                      <span className='text-amber-700 font-medium'>
                        {r.exitCount}회
                        {r.exitTotalMs > 0 && (
                          <span className='ml-1 text-xs opacity-80'>· {formatSecFromMs(r.exitTotalMs)}</span>
                        )}
                      </span>
                    ) : (
                      <span className='text-muted-foreground'>-</span>
                    )}
                  </TableCell>
                  <TableCell className='text-xs text-muted-foreground'>
                    {r.startedAtIso ? formatKst(r.startedAtIso) : '-'}
                  </TableCell>
                  <TableCell className='text-xs text-muted-foreground'>
                    {r.submittedAtIso ? formatKst(r.submittedAtIso) : '-'}
                  </TableCell>
                  <TableCell className='text-right'>
                    <Link
                      href={`/dashboard/exams/${examId}/sessions/${r.id}`}
                      className='text-xs text-blue-600 hover:underline'
                    >
                      상세
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

import PageContainer from '@/components/layout/page-container';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { createAdminClient } from '@/lib/supabase/server';
import { compareOperators } from '@/lib/operator-rank';
import Link from 'next/link';
import { EditAuxSheet } from './_components/edit-aux-sheet';

type Props = {
  searchParams: Promise<{ month?: string; past?: string }>;
};

const DOW = ['일', '월', '화', '수', '목', '금', '토'] as const;

function formatDate(ymd: string): string {
  const date = new Date(`${ymd}T00:00:00`);
  return `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}.(${DOW[date.getDay()]})`;
}

export default async function OperationsPage({ searchParams }: Props) {
  const { month: monthRaw, past } = await searchParams;
  const monthFilter = monthRaw && /^\d{1,2}$/.test(monthRaw) ? Number(monthRaw) : null;
  const hidePast = past === 'hide';

  const supabase = createAdminClient();

  const [mainInsRes, subInsRes, operatorsRes] = await Promise.all([
    supabase
      .from('instructors')
      .select('id, name, affiliation')
      .eq('kind', 'main')
      .order('name'),
    supabase
      .from('instructors')
      .select('id, name, affiliation')
      .eq('kind', 'sub')
      .order('name'),
    supabase.from('operators').select('id, name, title')
  ]);
  const mainInstructorsList = mainInsRes.data ?? [];
  const subInstructorsList = subInsRes.data ?? [];
  const operatorsList = (operatorsRes.data ?? []).toSorted(compareOperators);

  const { data: rows } = await supabase
    .from('sessions')
    .select(
      `id, session_date, session_end_date, title, cohort_id,
       cohorts(id, name, delivery_method),
       session_instructors(role, instructors(id, name)),
       session_operators(operators(id, name, title))`
    )
    .order('session_date', { ascending: true });

  type Row = {
    id: string;
    session_date: string;
    session_end_date: string | null;
    title: string | null;
    cohort_id: string;
    cohorts: { id: string; name: string; delivery_method: string | null } | null;
    session_instructors: {
      role: string;
      instructors: { id: string; name: string } | null;
    }[];
    session_operators: {
      operators: { id: string; name: string; title: string | null } | null;
    }[];
  };
  const allData = (rows ?? []) as unknown as Row[];

  const today = new Date().toISOString().slice(0, 10);

  const data = allData.filter((s) => {
    const startMonth = Number(s.session_date.split('-')[1]);
    if (monthFilter !== null && startMonth !== monthFilter) return false;
    if (hidePast) {
      const endDate = s.session_end_date ?? s.session_date;
      if (endDate < today) return false;
    }
    return true;
  });

  const monthsInData = [
    ...new Set(allData.map((s) => Number(s.session_date.split('-')[1])))
  ].toSorted((a, b) => a - b);

  const buildHref = (m: number | 'all', p?: 'hide' | 'show') => {
    const params = new URLSearchParams();
    if (m !== 'all') params.set('month', String(m));
    if ((p ?? (hidePast ? 'hide' : 'show')) === 'hide') params.set('past', 'hide');
    const qs = params.toString();
    return `/dashboard/operations${qs ? `?${qs}` : ''}`;
  };

  return (
    <PageContainer
      pageTitle='운영관리'
      pageDescription={`표시 ${data.length}개 / 전체 ${allData.length}개 회차`}
    >
      <div className='mb-4 flex flex-wrap items-center gap-3'>
        <div className='inline-flex rounded-lg border bg-card p-1'>
          <Link
            href={buildHref('all')}
            className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
              monthFilter === null
                ? 'bg-blue-600 text-white'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            전체보기
          </Link>
          {monthsInData.map((m) => (
            <Link
              key={m}
              href={buildHref(m)}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                monthFilter === m
                  ? 'bg-blue-600 text-white'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {m}월
            </Link>
          ))}
        </div>

        <Link
          href={buildHref(monthFilter ?? 'all', hidePast ? 'show' : 'hide')}
          className='inline-flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted'
        >
          <span
            className={`inline-flex h-4 w-4 items-center justify-center rounded border ${
              hidePast
                ? 'border-muted-foreground'
                : 'border-blue-600 bg-blue-600 text-white'
            }`}
          >
            {!hidePast && '✓'}
          </span>
          지난 회차 표시
        </Link>
      </div>

      <div className='rounded-xl border bg-card'>
        <Table className='table-fixed'>
          <TableHeader>
            <TableRow>
              <TableHead className='w-[12%]'>과정명</TableHead>
              <TableHead className='w-[18%]'>회차</TableHead>
              <TableHead className='w-[6%] text-center'>방법</TableHead>
              <TableHead className='w-[18%]'>교육기간</TableHead>
              <TableHead className='w-[14%]'>강사</TableHead>
              <TableHead className='w-[12%]'>보조강사</TableHead>
              <TableHead className='w-[14%]'>운영자</TableHead>
              <TableHead className='w-[6%] text-center'>편집</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className='text-muted-foreground py-12 text-center'>
                  표시할 회차가 없습니다.
                </TableCell>
              </TableRow>
            )}
            {data.map((s) => {
              const endDate = s.session_end_date ?? s.session_date;
              const isPast = endDate < today;
              const isToday = s.session_date <= today && today <= endDate;

              const mainList = s.session_instructors
                .filter((si) => si.role === 'main' && si.instructors)
                .map((si) => si.instructors!);
              const subList = s.session_instructors
                .filter((si) => si.role !== 'main' && si.instructors)
                .map((si) => si.instructors!);
              const opList = s.session_operators
                .map((so) => so.operators)
                .filter((o): o is { id: string; name: string; title: string | null } => !!o)
                .toSorted(compareOperators);

              const mainInstructors = mainList.map((i) => i.name).join(', ');
              const subInstructors = subList.map((i) => i.name).join(', ');
              const operators = opList.map((o) => o.name).join(', ');

              const dateLabel =
                s.session_end_date && s.session_end_date !== s.session_date
                  ? `${formatDate(s.session_date)} ~ ${formatDate(s.session_end_date)}`
                  : formatDate(s.session_date);

              return (
                <TableRow
                  key={s.id}
                  className={`${isPast ? 'text-muted-foreground/70 bg-muted/30' : ''} ${
                    isToday ? 'bg-rose-50/50 dark:bg-rose-950/20' : ''
                  } hover:bg-muted/50`}
                >
                  <TableCell className='align-middle text-sm font-medium'>
                    <div className='flex flex-wrap items-center gap-1.5'>
                      {s.cohorts && (
                        <Link
                          href={`/dashboard/cohorts/${s.cohort_id}`}
                          className='hover:underline'
                        >
                          {s.cohorts.name}
                        </Link>
                      )}
                      {isPast && (
                        <span className='rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300'>
                          지난 회차
                        </span>
                      )}
                      {isToday && (
                        <span className='rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'>
                          진행 중
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className='align-middle text-sm'>
                    <Link
                      href={`/dashboard/cohorts/${s.cohort_id}/lessons/${s.id}`}
                      className='hover:underline'
                    >
                      {s.title ?? '—'}
                    </Link>
                  </TableCell>
                  <TableCell className='align-middle text-center text-sm'>
                    {s.cohorts?.delivery_method ?? '—'}
                  </TableCell>
                  <TableCell className='align-middle font-mono text-xs tabular-nums whitespace-nowrap'>
                    {dateLabel}
                  </TableCell>
                  <TableCell className='align-middle text-sm'>{mainInstructors || '—'}</TableCell>
                  <TableCell className='align-middle text-sm text-muted-foreground'>
                    {subInstructors || '—'}
                  </TableCell>
                  <TableCell className='align-middle text-sm text-muted-foreground'>
                    {operators || '—'}
                  </TableCell>
                  <TableCell className='align-middle text-center'>
                    <EditAuxSheet
                      sessionId={s.id}
                      sessionLabel={`${s.cohorts?.name ?? ''} · ${s.title ?? ''}`}
                      mainInstructors={mainInstructorsList}
                      subInstructors={subInstructorsList}
                      operators={operatorsList}
                      currentMainIds={mainList.map((i) => i.id)}
                      currentSubIds={subList.map((i) => i.id)}
                      currentOperatorIds={opList.map((o) => o.id)}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </PageContainer>
  );
}

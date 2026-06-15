import { redirect } from 'next/navigation';
import PageContainer from '@/components/layout/page-container';
import { isDeveloper } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/server';
import { ActivityLogList } from './_components/activity-log-list';
import { ACTIVITY_LOGS_PAGE_SIZE, activityLogsSearchParamsCache } from './_search-params';

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type LogRow = {
  id: string;
  operator_name: string | null;
  action_type: string;
  resource_type: string | null;
  summary: string | null;
  created_at: string;
  cohort_id: string | null;
  cohorts: { name: string } | null;
};

export default async function ActivityLogsPage({ searchParams }: Props) {
  const dev = await isDeveloper();
  if (!dev) redirect('/dashboard/overview');

  const { page, operator, action, cohort, from, to } =
    activityLogsSearchParamsCache.parse(await searchParams);
  const supabase = createAdminClient();
  const pageSize = ACTIVITY_LOGS_PAGE_SIZE;
  const fromIdx = (page - 1) * pageSize;
  const toIdx = fromIdx + pageSize - 1;

  let query = supabase
    .from('activity_logs')
    .select(
      'id, operator_name, action_type, resource_type, summary, created_at, cohort_id, cohorts(name)',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(fromIdx, toIdx);

  if (operator) query = query.eq('operator_name', operator);
  if (action) query = query.eq('action_type', action);
  if (cohort) query = query.eq('cohort_id', cohort);
  if (from) query = query.gte('created_at', `${from}T00:00:00`);
  if (to) query = query.lte('created_at', `${to}T23:59:59.999`);

  const { data, count } = await query.returns<LogRow[]>();
  const rows = data ?? [];
  const totalCount = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));

  // facet 목록: 드롭다운 채우기 (필터 영향 안 받음)
  const [operatorsRes, actionsRes, cohortsRes] = await Promise.all([
    supabase
      .from('activity_logs')
      .select('operator_name')
      .not('operator_name', 'is', null)
      .returns<{ operator_name: string }[]>(),
    supabase
      .from('activity_logs')
      .select('action_type')
      .returns<{ action_type: string }[]>(),
    supabase
      .from('cohorts')
      .select('id, name')
      .order('name', { ascending: true })
      .returns<{ id: string; name: string }[]>()
  ]);

  const operatorOptions = Array.from(
    new Set((operatorsRes.data ?? []).map((r) => r.operator_name))
  ).toSorted();
  const actionOptions = Array.from(
    new Set((actionsRes.data ?? []).map((r) => r.action_type))
  ).toSorted();
  const cohortOptions = cohortsRes.data ?? [];

  const hasFilter = Boolean(operator || action || cohort || from || to);

  return (
    <PageContainer
      pageTitle='활동 로그'
      pageDescription={
        hasFilter
          ? `필터 결과 ${totalCount.toLocaleString()}건`
          : `총 ${totalCount.toLocaleString()}건`
      }
    >
      <ActivityLogList
        rows={rows}
        page={page}
        pageSize={pageSize}
        pageCount={pageCount}
        totalCount={totalCount}
        operatorOptions={operatorOptions}
        actionOptions={actionOptions}
        cohortOptions={cohortOptions}
      />
    </PageContainer>
  );
}

import PageContainer from '@/components/layout/page-container';
import { createAdminClient } from '@/lib/supabase/server';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { notFound } from 'next/navigation';
import {
  computeDispatchStages,
  groupStagesByDate,
  STAGE_CATALOG,
  type NotificationLite
} from '@/lib/dispatch-stages';
import { StageRow } from '@/app/dashboard/notifications/_components/stage-row';
import { StageToggleList } from './_components/stage-toggle-list';

const STAGE_TEMPLATE_CODES = STAGE_CATALOG.map((t) => t.code);

const todayIso = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const formatDdayLabel = (dOffset: number | null): string => {
  if (dOffset === null) return '-';
  if (dOffset === 0) return 'D-day';
  if (dOffset < 0) return `D${dOffset}`;
  return `D+${dOffset}`;
};

type Props = {
  params: Promise<{ cohortId: string }>;
};

export default async function CohortNotificationsPage({ params }: Props) {
  const { cohortId } = await params;
  const supabase = createAdminClient();
  const today = todayIso();

  const { data: cohort } = await supabase
    .from('cohorts')
    .select('id, name, started_at, ended_at, decided_at, category')
    .eq('id', cohortId)
    .maybeSingle();
  if (!cohort) notFound();

  const [{ data: notifs }, { data: configRows }] = await Promise.all([
    supabase
      .from('notifications')
      .select(
        'id, cohort_id, template_code, status, channel, channels, subject, body, sent_at, sent_by_operator_id, created_at'
      )
      .eq('cohort_id', cohortId)
      .order('sent_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('cohort_dispatch_config')
      .select('template_code, enabled')
      .eq('cohort_id', cohortId)
  ]);

  const enabledMap = new Map<string, boolean>();
  for (const r of configRows ?? []) enabledMap.set(r.template_code, r.enabled);

  const stageNotifs: NotificationLite[] = (notifs ?? [])
    .filter(
      (n) =>
        n.template_code &&
        STAGE_TEMPLATE_CODES.includes(
          n.template_code as (typeof STAGE_TEMPLATE_CODES)[number]
        )
    )
    .map((n) => ({
      id: n.id,
      template_code: n.template_code,
      status: n.status,
      channels: n.channels,
      channel: n.channel,
      sent_at: n.sent_at,
      sent_by_operator_id: n.sent_by_operator_id
    }));

  const operatorIds = [
    ...new Set(
      (notifs ?? [])
        .map((n) => n.sent_by_operator_id)
        .filter((x): x is string => !!x)
    )
  ];
  const operatorNameById = new Map<string, string>();
  if (operatorIds.length > 0) {
    const { data: ops } = await supabase
      .from('operators')
      .select('id, name')
      .in('id', operatorIds);
    for (const o of ops ?? []) operatorNameById.set(o.id, o.name);
  }

  const allStages = computeDispatchStages(
    { decided_at: cohort.decided_at, started_at: cohort.started_at, ended_at: cohort.ended_at },
    today,
    stageNotifs,
    enabledMap
  );

  // 같은 ideal_send_date 단계 그룹화 → sent 그룹 제외 → 이른 날짜순
  const groups = groupStagesByDate(allStages)
    .filter((g) => g.state !== 'sent')
    .toSorted((a, b) => {
      const av = a.ideal_send_date ?? '9999-12-31';
      const bv = b.ideal_send_date ?? '9999-12-31';
      return av.localeCompare(bv);
    });

  const headDue = groups.find((g) => g.state === 'due' || g.state === 'overdue');
  const dOffset = headDue?.d_offset_from_today ?? null;

  return (
    <PageContainer
      pageTitle={`${cohort.name} — 알림 발송 (beta)`}
      pageDescription='단계별 발송 체크리스트 + 활성화 설정 + 전체 발송 로그'
    >
      <div className='space-y-6'>
        <Card>
          <CardHeader className='pb-3'>
            <CardTitle className='text-base'>활성화 단계</CardTitle>
          </CardHeader>
          <CardContent>
            <StageToggleList cohortId={cohort.id} enabledMap={Object.fromEntries(enabledMap)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between gap-2 pb-3'>
            <div className='flex items-center gap-3'>
              <CardTitle className='text-base'>발송 체크리스트</CardTitle>
              {dOffset !== null && (
                <Badge variant='outline'>{formatDdayLabel(dOffset)}</Badge>
              )}
              {cohort.started_at && (
                <span className='text-muted-foreground text-xs'>
                  개강 {cohort.started_at}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {groups.length === 0 && (
              <div className='border-muted bg-muted/30 text-muted-foreground rounded-md border p-4 text-center text-sm'>
                활성화된 단계가 없거나 모두 발송 완료 상태입니다.
              </div>
            )}
            {groups.length > 0 && (
              <div className='space-y-2'>
                {groups.map((g) => (
                  <StageRow
                    key={g.templates.join(',')}
                    cohortId={cohort.id}
                    group={g}
                    operatorNameById={operatorNameById}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='pb-3'>
            <CardTitle className='text-base'>전체 발송 로그</CardTitle>
          </CardHeader>
          <CardContent>
            {(notifs ?? []).length === 0 && (
              <div className='text-muted-foreground p-4 text-center text-sm'>
                발송 기록이 없습니다.
              </div>
            )}
            {(notifs ?? []).length > 0 && (
              <div className='overflow-x-auto'>
                <table className='w-full text-sm'>
                  <thead className='text-muted-foreground border-b'>
                    <tr className='text-left'>
                      <th className='py-2 pr-3'>일시</th>
                      <th className='py-2 pr-3'>템플릿</th>
                      <th className='py-2 pr-3'>채널</th>
                      <th className='py-2 pr-3'>상태</th>
                      <th className='py-2 pr-3'>운영자</th>
                      <th className='py-2'>비고</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(notifs ?? []).map((n) => (
                      <tr key={n.id} className='border-b last:border-b-0'>
                        <td className='py-2 pr-3 whitespace-nowrap'>
                          {n.sent_at
                            ? new Date(n.sent_at).toLocaleString('ko-KR', {
                                year: '2-digit',
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit'
                              })
                            : '-'}
                        </td>
                        <td className='py-2 pr-3'>{n.template_code ?? '-'}</td>
                        <td className='py-2 pr-3'>
                          {n.channels && n.channels.length > 0
                            ? n.channels.join(', ')
                            : n.channel}
                        </td>
                        <td className='py-2 pr-3'>{n.status}</td>
                        <td className='py-2 pr-3'>
                          {n.sent_by_operator_id
                            ? operatorNameById.get(n.sent_by_operator_id) ?? '-'
                            : '-'}
                        </td>
                        <td className='py-2 text-muted-foreground'>
                          {n.body ?? n.subject ?? ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}

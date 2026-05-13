import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Icons } from '@/components/icons';
import { createAdminClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { ApplicantsTable, type ApplicationRow } from './_components/applicants-table';

type Props = { params: Promise<{ cohortId: string }> };

export default async function CohortApplicationsPage({ params }: Props) {
  const { cohortId } = await params;
  const supabase = createAdminClient();

  type ApplicationQuery = {
    id: string;
    status: string;
    rejected_stage: string | null;
    applied_at: string | null;
    decided_at: string | null;
    knowledge_score: number | null;
    knowledge_correct_count: number | null;
    knowledge_total_count: number | null;
    self_diagnosis_avg: number | null;
    applicants: {
      id: string;
      name: string;
      department: string | null;
      job_role: string | null;
      organizations: { name: string } | null;
    } | null;
  };

  const [{ data: cohort }, { data: applications }, { count: questionCount }] = await Promise.all([
    supabase.from('cohorts').select('id, name').eq('id', cohortId).maybeSingle(),
    supabase
      .from('applications')
      .select(
        'id, status, rejected_stage, applied_at, decided_at, knowledge_score, knowledge_correct_count, knowledge_total_count, self_diagnosis_avg, applicants(id, name, department, job_role, organizations(name))'
      )
      .eq('cohort_id', cohortId)
      .order('applied_at', { ascending: false, nullsFirst: false })
      .returns<ApplicationQuery[]>(),
    supabase
      .from('application_questions')
      .select('id', { count: 'exact', head: true })
      .eq('cohort_id', cohortId)
  ]);

  const rows: ApplicationRow[] = (applications ?? []).map((a) => ({
    id: a.id,
    applicant_id: a.applicants?.id ?? '',
    name: a.applicants?.name ?? '(이름 없음)',
    organization: a.applicants?.organizations?.name ?? null,
    department: a.applicants?.department ?? null,
    job_role: a.applicants?.job_role ?? null,
    status: a.status,
    rejected_stage: a.rejected_stage,
    knowledge_score: a.knowledge_score,
    knowledge_correct_count: a.knowledge_correct_count,
    knowledge_total_count: a.knowledge_total_count,
    self_diagnosis_avg: a.self_diagnosis_avg,
    decided_at: a.decided_at,
    applied_at: a.applied_at
  }));

  const hasQuestions = (questionCount ?? 0) > 0;

  const stats = {
    total: rows.length,
    selected: rows.filter((r) => r.status === 'selected').length,
    rejected: rows.filter((r) => r.status === 'rejected').length,
    pending: rows.filter((r) => r.status === 'applied' || r.status === 'pending').length,
    avgKnowledge:
      rows.length > 0
        ? Math.round(
            (rows.reduce((s, r) => s + (r.knowledge_score ?? 0), 0) / rows.length) * 10
          ) / 10
        : null,
    avgSelfDiag:
      rows.length > 0
        ? Math.round(
            (rows.reduce((s, r) => s + (r.self_diagnosis_avg ?? 0), 0) / rows.length) * 10
          ) / 10
        : null
  };

  const headerAction = (
    <div className='flex items-center gap-2'>
      <Button variant='outline' size='sm' asChild disabled={!hasQuestions}>
        <Link href={`/dashboard/cohorts/${cohortId}/applications/questions`}>
          <Icons.forms className='mr-1.5' />
          사전문항 미리보기
        </Link>
      </Button>
      <Button size='sm' disabled title='다음 단계에서 구현 예정'>
        <Icons.upload className='mr-1.5' />
        응답 엑셀 업로드
      </Button>
    </div>
  );

  return (
    <PageContainer
      pageTitle='신청·응답'
      pageDescription={cohort?.name ?? ''}
      pageHeaderAction={headerAction}
    >
      <div className='flex flex-col gap-6'>
        <StatsRow stats={stats} questionCount={questionCount ?? 0} />
        {rows.length === 0 ? (
          <EmptyState hasQuestions={hasQuestions} />
        ) : (
          <ApplicantsTable rows={rows} cohortId={cohortId} />
        )}
      </div>
    </PageContainer>
  );
}

function StatsRow({
  stats,
  questionCount
}: {
  stats: {
    total: number;
    selected: number;
    rejected: number;
    pending: number;
    avgKnowledge: number | null;
    avgSelfDiag: number | null;
  };
  questionCount: number;
}) {
  return (
    <Card className='py-4'>
      <CardContent className='flex flex-wrap items-center gap-x-10 gap-y-3 px-6'>
        <Stat label='총 신청자' value={stats.total} accent />
        <Stat label='선발' value={stats.selected} tone='text-emerald-600' />
        <Stat label='탈락' value={stats.rejected} tone='text-rose-600' />
        <Stat label='미결정' value={stats.pending} tone='text-amber-600' />
        <Stat
          label='평균 지식점수'
          value={stats.avgKnowledge !== null ? `${stats.avgKnowledge}점` : '—'}
        />
        <Stat
          label='평균 자가진단'
          value={stats.avgSelfDiag !== null ? `${stats.avgSelfDiag} / 5` : '—'}
        />
        <Stat
          label='등록된 문항'
          value={`${questionCount}개`}
          tone='text-muted-foreground'
        />
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  accent,
  tone
}: {
  label: string;
  value: string | number;
  accent?: boolean;
  tone?: string;
}) {
  const valueClass = accent
    ? 'text-primary'
    : tone ?? 'text-foreground';
  return (
    <div className='flex flex-col'>
      <span className='text-muted-foreground text-xs'>{label}</span>
      <span className={`text-lg leading-tight font-semibold tabular-nums ${valueClass}`}>
        {value}
      </span>
    </div>
  );
}

function EmptyState({ hasQuestions }: { hasQuestions: boolean }) {
  return (
    <Card>
      <CardContent className='flex flex-col items-center gap-4 py-16 px-6 text-center'>
        <div className='bg-muted text-muted-foreground flex h-14 w-14 items-center justify-center rounded-full'>
          <Icons.teams className='size-7' />
        </div>
        <div>
          <p className='text-base font-medium'>아직 신청자가 없습니다</p>
          <p className='text-muted-foreground mt-1 text-sm'>
            {hasQuestions
              ? '외부 신청 시스템에서 받은 응답 엑셀을 업로드하면 여기에 표시됩니다.'
              : '먼저 사전문항을 시드한 후 응답을 업로드하세요.'}
          </p>
        </div>
        <div className='flex gap-2'>
          <Button variant='outline' size='sm' disabled title='다음 단계에서 구현 예정'>
            응답 엑셀 업로드
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

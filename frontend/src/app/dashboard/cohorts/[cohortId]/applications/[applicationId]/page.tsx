import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { createAdminClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/supabase/types';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ResponseViewer, type Answer, type Question } from './_components/response-viewer';

type Props = { params: Promise<{ cohortId: string; applicationId: string }> };

const STATUS_LABEL: Record<string, string> = {
  applied: '신청',
  pending: '심사중',
  selected: '선발',
  rejected: '탈락',
  withdrawn: '취하'
};

const STATUS_TONE: Record<string, string> = {
  applied: 'bg-slate-100 text-slate-700 border-slate-300',
  pending: 'bg-amber-50 text-amber-800 border-amber-200',
  selected: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  rejected: 'bg-rose-50 text-rose-800 border-rose-200',
  withdrawn: 'bg-slate-50 text-slate-500 border-slate-200'
};

function parseChoices(choices: Json | null): { key: string; text: string }[] {
  if (!Array.isArray(choices)) return [];
  return choices.filter(
    (c): c is { key: string; text: string } =>
      typeof c === 'object' &&
      c !== null &&
      !Array.isArray(c) &&
      typeof (c as { key?: unknown }).key === 'string' &&
      typeof (c as { text?: unknown }).text === 'string'
  ) as { key: string; text: string }[];
}

type AppQuery = {
  id: string;
  cohort_id: string;
  status: string;
  rejected_stage: string | null;
  applied_at: string | null;
  decided_at: string | null;
  note: string | null;
  knowledge_score: number | null;
  knowledge_correct_count: number | null;
  knowledge_total_count: number | null;
  self_diagnosis_avg: number | null;
  applicants: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    department: string | null;
    job_title: string | null;
    job_role: string | null;
    organizations: { name: string } | null;
  } | null;
};

export default async function ApplicationDetailPage({ params }: Props) {
  const { cohortId, applicationId } = await params;
  const supabase = createAdminClient();

  const { data: application } = await supabase
    .from('applications')
    .select(
      'id, cohort_id, status, rejected_stage, applied_at, decided_at, note, knowledge_score, knowledge_correct_count, knowledge_total_count, self_diagnosis_avg, applicants(id, name, email, phone, department, job_title, job_role, organizations(name))'
    )
    .eq('id', applicationId)
    .eq('cohort_id', cohortId)
    .maybeSingle<AppQuery>();

  if (!application) {
    notFound();
  }

  const [{ data: cohort }, { data: questions }, { data: answers }] = await Promise.all([
    supabase.from('cohorts').select('id, name').eq('id', cohortId).maybeSingle(),
    supabase
      .from('application_questions')
      .select(
        'id, section, question_no, difficulty, question_text, question_type, choices, correct_choice, weight, display_order'
      )
      .eq('cohort_id', cohortId)
      .order('display_order'),
    supabase
      .from('application_answers')
      .select('question_id, answer_value, is_correct, score')
      .eq('application_id', applicationId)
  ]);

  const questionRows: Question[] = (questions ?? []).map((q) => ({
    id: q.id,
    section: q.section,
    question_no: q.question_no,
    difficulty: q.difficulty,
    question_text: q.question_text,
    question_type: q.question_type,
    choices: parseChoices(q.choices),
    correct_choice: q.correct_choice,
    weight: q.weight
  }));

  const answerMap = new Map<string, Answer>();
  for (const a of answers ?? []) {
    answerMap.set(a.question_id, {
      answer_value: a.answer_value,
      is_correct: a.is_correct,
      score: a.score
    });
  }

  const knowledgeMax = questionRows
    .filter((q) => q.section === 'knowledge')
    .reduce((sum, q) => sum + (q.weight ?? 1), 0);

  const applicant = application.applicants;
  const backHref = `/dashboard/cohorts/${cohortId}/applications`;

  return (
    <PageContainer
      pageTitle={applicant?.name ?? '신청자'}
      pageDescription={cohort?.name ?? ''}
      pageHeaderAction={
        <Button variant='outline' size='sm' asChild>
          <Link href={backHref}>← 신청자 리스트</Link>
        </Button>
      }
    >
      <div className='flex flex-col gap-6'>
        <ApplicantHeader application={application} applicant={applicant} />
        <ScoreSummary
          knowledgeScore={application.knowledge_score}
          knowledgeMax={knowledgeMax}
          correct={application.knowledge_correct_count}
          totalKnowledge={application.knowledge_total_count}
          selfDiagAvg={application.self_diagnosis_avg}
          totalQuestions={questionRows.length}
          respondedCount={answerMap.size}
        />
        {questionRows.length === 0 ? (
          <Card>
            <CardContent className='text-muted-foreground py-12 text-center'>
              이 기수에 등록된 사전문항이 없습니다.
            </CardContent>
          </Card>
        ) : (
          <ResponseViewer questions={questionRows} answers={answerMap} />
        )}
      </div>
    </PageContainer>
  );
}

function ApplicantHeader({
  application,
  applicant
}: {
  application: AppQuery;
  applicant: AppQuery['applicants'];
}) {
  return (
    <Card>
      <CardContent className='flex flex-wrap items-start justify-between gap-4 px-6 py-5'>
        <div className='flex flex-col gap-1.5'>
          <div className='flex items-center gap-2'>
            <h2 className='text-xl font-semibold'>{applicant?.name ?? '(이름 없음)'}</h2>
            <Badge
              variant='outline'
              className={cn('font-normal', STATUS_TONE[application.status] ?? STATUS_TONE.applied)}
            >
              {STATUS_LABEL[application.status] ?? application.status}
              {application.status === 'rejected' && application.rejected_stage && (
                <span className='ml-1 opacity-70'>· {application.rejected_stage}</span>
              )}
            </Badge>
          </div>
          <div className='text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm'>
            {applicant?.organizations?.name && <span>{applicant.organizations.name}</span>}
            {applicant?.department && <span>{applicant.department}</span>}
            {applicant?.job_title && <span>{applicant.job_title}</span>}
            {applicant?.job_role && <span>{applicant.job_role}</span>}
          </div>
          {(applicant?.email || applicant?.phone) && (
            <div className='text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs'>
              {applicant?.email && <span>{applicant.email}</span>}
              {applicant?.phone && <span>{applicant.phone}</span>}
            </div>
          )}
        </div>
        <div className='text-muted-foreground flex flex-col items-end gap-0.5 text-xs'>
          {application.applied_at && <span>신청 {application.applied_at}</span>}
          {application.decided_at && <span>결정 {application.decided_at}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

function ScoreSummary({
  knowledgeScore,
  knowledgeMax,
  correct,
  totalKnowledge,
  selfDiagAvg,
  totalQuestions,
  respondedCount
}: {
  knowledgeScore: number | null;
  knowledgeMax: number;
  correct: number | null;
  totalKnowledge: number | null;
  selfDiagAvg: number | null;
  totalQuestions: number;
  respondedCount: number;
}) {
  const knowledgeRatio =
    knowledgeMax > 0 && knowledgeScore !== null ? (knowledgeScore / knowledgeMax) * 100 : null;
  const respondRatio = totalQuestions > 0 ? (respondedCount / totalQuestions) * 100 : 0;

  return (
    <Card className='py-4'>
      <CardContent className='grid grid-cols-2 gap-x-8 gap-y-4 px-6 md:grid-cols-4'>
        <div className='flex flex-col gap-1'>
          <span className='text-muted-foreground text-xs'>지식평가 점수</span>
          <span className='text-foreground text-2xl leading-tight font-semibold tabular-nums'>
            {knowledgeScore !== null ? knowledgeScore : '—'}
            <span className='text-muted-foreground ml-1 text-base font-normal'>
              / {knowledgeMax}점
            </span>
          </span>
          {knowledgeRatio !== null && (
            <span className='text-muted-foreground text-xs'>{knowledgeRatio.toFixed(1)}%</span>
          )}
        </div>
        <div className='flex flex-col gap-1'>
          <span className='text-muted-foreground text-xs'>정답 수</span>
          <span className='text-foreground text-2xl leading-tight font-semibold tabular-nums'>
            {correct !== null ? correct : '—'}
            <span className='text-muted-foreground ml-1 text-base font-normal'>
              / {totalKnowledge ?? 0}문항
            </span>
          </span>
        </div>
        <div className='flex flex-col gap-1'>
          <span className='text-muted-foreground text-xs'>자가진단 평균</span>
          <span className='text-foreground text-2xl leading-tight font-semibold tabular-nums'>
            {selfDiagAvg !== null ? selfDiagAvg.toFixed(1) : '—'}
            <span className='text-muted-foreground ml-1 text-base font-normal'>/ 5</span>
          </span>
        </div>
        <div className='flex flex-col gap-1'>
          <span className='text-muted-foreground text-xs'>응답 완성도</span>
          <span className='text-foreground text-2xl leading-tight font-semibold tabular-nums'>
            {respondedCount}
            <span className='text-muted-foreground ml-1 text-base font-normal'>
              / {totalQuestions}문항
            </span>
          </span>
          <span className='text-muted-foreground text-xs'>{respondRatio.toFixed(0)}%</span>
        </div>
      </CardContent>
    </Card>
  );
}

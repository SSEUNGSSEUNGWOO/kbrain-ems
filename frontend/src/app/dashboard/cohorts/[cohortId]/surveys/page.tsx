import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { createAdminClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { SurveyCard } from './_components/survey-card';

type Props = {
  params: Promise<{ cohortId: string }>;
};

export default async function SurveysPage({ params }: Props) {
  const { cohortId } = await params;
  const supabase = createAdminClient();

  // 설문 목록 — 이 cohort 가 primary 이거나 additional_cohort_ids 에 포함된 설문 모두
  const { data: surveys } = await supabase
    .from('surveys')
    .select(
      'id, title, share_code, opens_at, respondent_total, created_at, cohort_id, additional_cohort_ids'
    )
    .or(`cohort_id.eq.${cohortId},additional_cohort_ids.cs.{${cohortId}}`)
    .order('created_at', { ascending: false });

  // 각 설문 통계
  const cards = await Promise.all(
    (surveys ?? []).map(async (s) => {
      // 적용 cohort 학생 수 합 (테스트 학생 제외) — 통합 설문(여러 cohort 연결)
      // 시 분모 자동 합산. respondent_total 이 직접 설정돼 있으면 그걸 우선.
      const appliedCohortIds = Array.from(
        new Set([s.cohort_id, ...(s.additional_cohort_ids ?? [])])
      );
      const { count: appliedCount } = await supabase
        .from('students')
        .select('id', { count: 'exact', head: true })
        .in('cohort_id', appliedCohortIds)
        .not('name', 'ilike', '테스트%');
      const appliedTotal = appliedCount ?? 0;

      const [questionsRes, responsesRes] = await Promise.all([
        supabase
          .from('survey_questions')
          .select('id, type')
          .eq('survey_id', s.id),
        supabase
          .from('survey_responses')
          .select('submitted_at, responses')
          .eq('survey_id', s.id)
      ]);

      const questions = questionsRes.data ?? [];
      const responses = responsesRes.data ?? [];
      const submitted = responses.filter((r) => r.submitted_at);

      const scaleIds = new Set(
        questions.filter((q) => q.type === 'likert10').map((q) => q.id)
      );

      let sum = 0;
      let n = 0;
      for (const r of submitted) {
        const obj = (r.responses ?? {}) as Record<string, unknown>;
        for (const qid of scaleIds) {
          const v = obj[qid];
          if (typeof v === 'number') {
            sum += v;
            n++;
          }
        }
      }
      const avg = n > 0 ? sum / n : null;

      return {
        id: s.id,
        title: s.title,
        shareCode: s.share_code,
        published: s.opens_at !== null,
        publishedAt: s.opens_at,
        issuedCount: responses.length,
        submittedCount: submitted.length,
        totalStudents: s.respondent_total ?? appliedTotal,
        avgScore: avg,
        scaleQuestionCount: scaleIds.size,
        linkedCohortCount: appliedCohortIds.length
      };
    })
  );

  return (
    <PageContainer
      pageTitle='만족도 설문'
      pageDescription='설문지 운영 및 응답 집계'
      pageHeaderAction={
        <Link href={`/dashboard/cohorts/${cohortId}/surveys/new`}>
          <Button>+ 새 설문</Button>
        </Link>
      }
    >
      {cards.length === 0 ? (
        <div className='rounded-xl border bg-card px-6 py-12 text-center text-muted-foreground'>
          등록된 설문이 없습니다.
        </div>
      ) : (
        <div className='space-y-4'>
          {cards.map((c) => (
            <SurveyCard key={c.id} cohortId={cohortId} {...c} />
          ))}
        </div>
      )}
    </PageContainer>
  );
}

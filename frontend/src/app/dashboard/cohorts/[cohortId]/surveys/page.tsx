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

  // 학생 수
  const { count: studentCount } = await supabase
    .from('students')
    .select('id', { count: 'exact', head: true })
    .eq('cohort_id', cohortId);

  // 설문 목록
  const { data: surveys } = await supabase
    .from('surveys')
    .select('id, title, share_code, opens_at, created_at')
    .eq('cohort_id', cohortId)
    .order('created_at', { ascending: false });

  const totalStudents = studentCount ?? 0;

  // 각 설문 통계
  const cards = await Promise.all(
    (surveys ?? []).map(async (s) => {
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
        questions.filter((q) => q.type === 'likert5').map((q) => q.id)
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
        totalStudents,
        avgScore: avg,
        scaleQuestionCount: scaleIds.size
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

import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { createAdminClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SurveyBuilder } from './_components/survey-builder';
import type { SectionDraft } from './_actions';

type Props = {
  params: Promise<{ cohortId: string; surveyId: string }>;
};

export default async function SurveyEditPage({ params }: Props) {
  const { cohortId, surveyId } = await params;
  const supabase = createAdminClient();

  const [surveyRes, questionsRes, instructorsRes] = await Promise.all([
    supabase
      .from('surveys')
      .select('id, title, share_code, opens_at, cohort_id')
      .eq('id', surveyId)
      .maybeSingle(),
    supabase
      .from('survey_questions')
      .select(
        'id, question_no, type, text, required, section_no, section_title, instructor_id, options'
      )
      .eq('survey_id', surveyId)
      .order('question_no', { ascending: true }),
    supabase.from('instructors').select('id, name, affiliation').eq('kind', 'main').order('name')
  ]);

  if (!surveyRes.data) notFound();
  if (surveyRes.data.cohort_id !== cohortId) notFound();

  // 섹션별로 그룹핑
  const sectionMap = new Map<number, SectionDraft>();
  for (const q of questionsRes.data ?? []) {
    const sNo = q.section_no ?? 1;
    let section = sectionMap.get(sNo);
    if (!section) {
      section = {
        title: q.section_title ?? `섹션 ${sNo}`,
        instructor_id: q.instructor_id,
        questions: []
      };
      sectionMap.set(sNo, section);
    }
    // 같은 섹션의 instructor_id가 일관되지 않으면 첫 값을 신뢰
    section.questions.push({
      type: (q.type as 'likert10' | 'text' | 'choice') ?? 'text',
      text: q.text,
      required: q.required,
      options: q.options ?? null
    });
  }
  const initialSections = Array.from(sectionMap.entries())
    .toSorted((a, b) => a[0] - b[0])
    .map(([, v]) => v);

  const published = surveyRes.data.opens_at !== null;

  return (
    <PageContainer
      pageTitle='설문 편집'
      pageDescription={surveyRes.data.title}
      pageHeaderAction={
        <div className='flex gap-2'>
          <Link href={`/dashboard/cohorts/${cohortId}/surveys/${surveyId}/preview`}>
            <Button variant='outline'>미리보기</Button>
          </Link>
          <Link href={`/dashboard/cohorts/${cohortId}/surveys`}>
            <Button variant='outline'>← 목록</Button>
          </Link>
        </div>
      }
    >
      <SurveyBuilder
        cohortId={cohortId}
        surveyId={surveyId}
        initialSections={initialSections}
        instructors={instructorsRes.data ?? []}
        published={published}
        publishedAt={surveyRes.data.opens_at}
      />
    </PageContainer>
  );
}

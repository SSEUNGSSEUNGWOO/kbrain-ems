import { createAdminClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { SurveyForm } from './_components/survey-form';

type Props = {
  params: Promise<{ token: string }>;
};

export default async function SurveyResponsePage({ params }: Props) {
  const { token } = await params;
  const supabase = createAdminClient();

  // 1) 토큰으로 응답 row 조회
  const { data: response } = await supabase
    .from('survey_responses')
    .select('id, survey_id, student_id, submitted_at')
    .eq('token', token)
    .maybeSingle();

  if (!response) notFound();

  // 2) 이미 제출됨
  if (response.submitted_at) {
    return (
      <main className='mx-auto min-h-screen max-w-2xl bg-slate-50 px-4 py-12'>
        <div className='rounded-2xl border bg-white px-8 py-12 text-center shadow-sm'>
          <h2 className='text-xl font-bold text-slate-900'>이미 응답하신 설문입니다.</h2>
          <p className='mt-2 text-sm text-slate-500'>참여해 주셔서 감사합니다.</p>
        </div>
      </main>
    );
  }

  // 3) survey + questions + student 병렬 조회
  const [surveyRes, questionsRes, studentRes] = await Promise.all([
    supabase.from('surveys').select('id, title').eq('id', response.survey_id).single(),
    supabase
      .from('survey_questions')
      .select('id, question_no, type, text, required, section_no, section_title, instructor_id, options')
      .eq('survey_id', response.survey_id)
      .order('question_no', { ascending: true }),
    response.student_id
      ? supabase.from('students').select('name').eq('id', response.student_id).maybeSingle()
      : Promise.resolve({ data: null as { name: string } | null })
  ]);

  if (!surveyRes.data || !questionsRes.data) notFound();

  const questions = questionsRes.data.map((q) => ({
    ...q,
    options: q.options as Record<string, unknown> | null
  }));

  return (
    <main className='min-h-screen bg-slate-50 px-4 py-8 sm:py-12'>
      <div className='mx-auto max-w-2xl'>
        <SurveyForm
          token={token}
          surveyTitle={surveyRes.data.title}
          studentName={studentRes.data?.name ?? null}
          questions={questions}
        />
      </div>
    </main>
  );
}

import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/server';
import { DiagnosisForm } from './_components/diagnosis-form';

type Props = {
  params: Promise<{ token: string }>;
};

export const dynamic = 'force-dynamic';

export default async function DiagnosisResponsePage({ params }: Props) {
  const { token } = await params;
  const supabase = createAdminClient();

  // 토큰으로 응답 row + 진단 정보 조회
  const { data: response } = await supabase
    .from('diagnosis_responses')
    .select(
      'id, diagnosis_id, started_at, submitted_at, total_score, students(name, department, organizations(name)), diagnoses(title, type, opens_at, closes_at, duration_minutes)'
    )
    .eq('token', token)
    .maybeSingle();

  if (!response) notFound();

  const diag = response.diagnoses as unknown as {
    title: string;
    type: string;
    opens_at: string | null;
    closes_at: string | null;
    duration_minutes: number;
  } | null;
  const student = response.students as unknown as {
    name: string;
    department: string | null;
    organizations: { name: string } | null;
  } | null;

  if (!diag) notFound();

  const now = Date.now();
  if (diag.opens_at && new Date(diag.opens_at).getTime() > now) {
    return (
      <main className='flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 px-4'>
        <div className='w-full max-w-sm rounded-2xl border bg-white px-8 py-12 text-center shadow-lg'>
          <h2 className='text-lg font-bold text-slate-900'>아직 응답할 수 없습니다</h2>
          <p className='mt-2 text-sm text-slate-500'>응답 가능 시각이 되지 않았습니다.</p>
        </div>
      </main>
    );
  }
  if (diag.closes_at && new Date(diag.closes_at).getTime() < now) {
    return (
      <main className='flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 px-4'>
        <div className='w-full max-w-sm rounded-2xl border bg-white px-8 py-12 text-center shadow-lg'>
          <h2 className='text-lg font-bold text-slate-900'>마감된 평가입니다</h2>
          <p className='mt-2 text-sm text-slate-500'>응답 기간이 종료되었습니다.</p>
        </div>
      </main>
    );
  }

  // 이미 제출됨 (점수 비공개)
  if (response.submitted_at) {
    return (
      <main className='flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 px-4'>
        <div className='w-full max-w-sm rounded-2xl border bg-white px-8 py-12 text-center shadow-lg'>
          <div className='mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400'>
            {student?.name ?? ''}
          </div>
          <h2 className='text-xl font-bold text-slate-900'>제출 완료</h2>
          <p className='mt-2 text-sm text-slate-500'>응답해주셔서 감사합니다.</p>
        </div>
      </main>
    );
  }

  // 문항 조회 (정답·해설은 제외)
  type QuestionRow = {
    id: string;
    question_no: number;
    type: string;
    text: string;
    options: { choices?: { key: string; text: string }[] } | null;
  };
  const { data: questionsRaw } = await supabase
    .from('diagnosis_questions')
    .select('id, question_no, type, text, options')
    .eq('diagnosis_id', response.diagnosis_id)
    .order('question_no', { ascending: true })
    .returns<QuestionRow[]>();
  const questions = (questionsRaw ?? []).map((q) => ({
    id: q.id,
    question_no: q.question_no,
    type: q.type,
    text: q.text,
    // 정답 정보(correct, correct_keywords)는 클라이언트로 보내지 않음
    choices: q.options?.choices ?? null
  }));

  return (
    <main className='min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 px-4 py-8'>
      <div className='mx-auto max-w-2xl'>
        <DiagnosisForm
          token={token}
          studentName={student?.name ?? ''}
          studentOrg={student?.organizations?.name ?? ''}
          studentDepartment={student?.department ?? ''}
          diagnosisTitle={diag.title}
          diagnosisType={diag.type}
          durationMinutes={diag.duration_minutes}
          startedAt={response.started_at}
          questions={questions}
        />
      </div>
    </main>
  );
}

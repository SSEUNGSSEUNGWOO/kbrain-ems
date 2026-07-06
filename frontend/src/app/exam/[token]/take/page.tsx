import { redirect, notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/server';
import { ExamRunner } from './_components/exam-runner';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ token: string }> };

export default async function ExamTakePage({ params }: Props) {
  const { token } = await params;
  const s = createAdminClient();

  const { data: session } = await s
    .from('exam_sessions')
    .select(
      'id, exam_id, name, started_at, submitted_at, current_order_no, exams(name, time_limit_minutes, fullscreen_required)'
    )
    .eq('token', token)
    .maybeSingle<{
      id: string;
      exam_id: string;
      name: string | null;
      started_at: string | null;
      submitted_at: string | null;
      current_order_no: number | null;
      exams: { name: string; time_limit_minutes: number | null; fullscreen_required: boolean } | null;
    }>();

  if (!session || !session.exams) notFound();
  if (session.submitted_at) redirect(`/exam/${token}/done`);
  if (!session.started_at) redirect(`/exam/${token}`);

  const currentOrder = session.current_order_no ?? 1;

  const { data: qie } = await s
    .from('exam_questions_in_exam')
    .select(
      'order_no, question_id, exam_questions(id, type, text, score, choices, time_limit_seconds, allow_file_upload, attachment_url, category, difficulty)'
    )
    .eq('exam_id', session.exam_id)
    .order('order_no');

  if (!qie || qie.length === 0) {
    return <div className='p-6 text-white bg-neutral-950 min-h-screen'>문항이 없습니다.</div>;
  }

  const totalCount = qie.length;
  const current = qie.find((r) => r.order_no === currentOrder);
  if (!current) {
    return <div className='p-6 text-white bg-neutral-950 min-h-screen'>문항을 찾을 수 없습니다.</div>;
  }

  const q = (current as unknown as {
    exam_questions: {
      id: string;
      type: 'multiple_choice' | 'short_text' | 'task_based';
      text: string;
      score: number;
      choices: { key: string; text: string }[] | null;
      time_limit_seconds: number | null;
      allow_file_upload: boolean;
      attachment_url: string | null;
      category: string | null;
      difficulty: string | null;
    };
  }).exam_questions;

  // 저장된 응답 (있으면)
  const { data: existingResp } = await s
    .from('exam_responses')
    .select('answer_value, visited_at')
    .eq('session_id', session.id)
    .eq('question_id', q.id)
    .maybeSingle();

  return (
    <ExamRunner
      token={token}
      examName={session.exams.name}
      applicantName={session.name ?? ''}
      fullscreenRequired={session.exams.fullscreen_required}
      currentOrder={currentOrder}
      totalCount={totalCount}
      question={q}
      savedAnswer={(existingResp?.answer_value as Record<string, unknown> | null) ?? null}
      visitedAt={existingResp?.visited_at ?? null}
    />
  );
}

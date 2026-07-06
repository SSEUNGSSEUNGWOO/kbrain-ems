import { redirect, notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/server';
import { ExamRunner, type QuestionForRunner } from './_components/exam-runner';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ token: string }> };

export default async function ExamTakePage({ params }: Props) {
  const { token } = await params;
  const s = createAdminClient();

  const { data: session } = await s
    .from('exam_sessions')
    .select(
      'id, exam_id, name, started_at, submitted_at, current_order_no, exams(name, fullscreen_required)'
    )
    .eq('token', token)
    .maybeSingle<{
      id: string;
      exam_id: string;
      name: string | null;
      started_at: string | null;
      submitted_at: string | null;
      current_order_no: number | null;
      exams: { name: string; fullscreen_required: boolean } | null;
    }>();

  if (!session || !session.exams) notFound();
  if (session.submitted_at) redirect(`/exam/${token}/done`);
  if (!session.started_at) redirect(`/exam/${token}`);

  const [qieRes, respRes] = await Promise.all([
    s
      .from('exam_questions_in_exam')
      .select(
        'order_no, question_id, exam_questions(id, type, text, score, choices, time_limit_seconds, allow_file_upload, attachment_url, category, difficulty)'
      )
      .eq('exam_id', session.exam_id)
      .order('order_no'),
    s
      .from('exam_responses')
      .select('question_id, answer_value')
      .eq('session_id', session.id)
  ]);

  const qie = (qieRes.data ?? []) as unknown as {
    order_no: number;
    question_id: string;
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
  }[];
  if (qie.length === 0) {
    return <div className='min-h-screen bg-neutral-950 p-6 text-white'>문항이 없습니다.</div>;
  }

  const questions: QuestionForRunner[] = qie.map((r) => ({
    order_no: r.order_no,
    id: r.exam_questions.id,
    type: r.exam_questions.type,
    text: r.exam_questions.text,
    score: r.exam_questions.score,
    choices: r.exam_questions.choices,
    time_limit_seconds: r.exam_questions.time_limit_seconds,
    allow_file_upload: r.exam_questions.allow_file_upload,
    attachment_url: r.exam_questions.attachment_url,
    category: r.exam_questions.category,
    difficulty: r.exam_questions.difficulty
  }));

  const savedAnswers: Record<string, Record<string, unknown>> = {};
  for (const r of respRes.data ?? []) {
    if (r.answer_value && typeof r.answer_value === 'object') {
      savedAnswers[r.question_id] = r.answer_value as Record<string, unknown>;
    }
  }

  return (
    <ExamRunner
      token={token}
      examName={session.exams.name}
      applicantName={session.name ?? ''}
      fullscreenRequired={session.exams.fullscreen_required}
      startOrder={session.current_order_no ?? 1}
      questions={questions}
      savedAnswers={savedAnswers}
    />
  );
}

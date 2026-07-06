import { redirect, notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/server';
import { ExamRunner, type QuestionForRunner, type SectionKind } from './_components/exam-runner';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ token: string }> };

type SectionState = { started_at?: string | null; submitted_at?: string | null };
type SectionProgress = Partial<Record<SectionKind, SectionState>>;

const SECTION_ORDER: SectionKind[] = ['multiple_choice', 'short_text', 'task_based'];

function currentSection(sp: SectionProgress): SectionKind | 'done' {
  for (const k of SECTION_ORDER) {
    const st = sp[k];
    if (st?.started_at && !st.submitted_at) return k;
  }
  return 'done';
}

export default async function ExamTakePage({ params }: Props) {
  const { token } = await params;
  const s = createAdminClient();

  const { data: session } = await s
    .from('exam_sessions')
    .select(
      'id, exam_id, name, started_at, submitted_at, section_progress, flagged_question_ids, exams(name, fullscreen_required, time_limit_mc, time_limit_st, time_limit_task)'
    )
    .eq('token', token)
    .maybeSingle<{
      id: string;
      exam_id: string;
      name: string | null;
      started_at: string | null;
      submitted_at: string | null;
      section_progress: SectionProgress | null;
      flagged_question_ids: string[] | null;
      exams: {
        name: string;
        fullscreen_required: boolean;
        time_limit_mc: number | null;
        time_limit_st: number | null;
        time_limit_task: number | null;
      } | null;
    }>();

  if (!session || !session.exams) notFound();
  if (session.submitted_at) redirect(`/exam/${token}/done`);
  if (!session.started_at) redirect(`/exam/${token}`);

  const sp = session.section_progress ?? {};
  const cur = currentSection(sp);
  if (cur === 'done') {
    // 모든 섹션 완료 — 최종 제출 페이지로 (또는 자동 제출 후 done)
    redirect(`/exam/${token}/done`);
  }

  const [qieRes, respRes] = await Promise.all([
    s
      .from('exam_questions_in_exam')
      .select(
        'order_no, question_id, exam_questions(id, type, text, score, choices, allow_file_upload, attachment_url, category)'
      )
      .eq('exam_id', session.exam_id)
      .order('order_no'),
    s.from('exam_responses').select('question_id, answer_value').eq('session_id', session.id)
  ]);

  const qie = (qieRes.data ?? []) as unknown as {
    order_no: number;
    question_id: string;
    exam_questions: {
      id: string;
      type: SectionKind;
      text: string;
      score: number;
      choices: { key: string; text: string }[] | null;
      allow_file_upload: boolean;
      attachment_url: string | null;
      category: string | null;
    };
  }[];

  const questions: QuestionForRunner[] = qie.map((r) => ({
    order_no: r.order_no,
    id: r.exam_questions.id,
    type: r.exam_questions.type,
    text: r.exam_questions.text,
    score: r.exam_questions.score,
    choices: r.exam_questions.choices,
    allow_file_upload: r.exam_questions.allow_file_upload,
    attachment_url: r.exam_questions.attachment_url,
    category: r.exam_questions.category
  }));

  const savedAnswers: Record<string, Record<string, unknown>> = {};
  for (const r of respRes.data ?? []) {
    if (r.answer_value && typeof r.answer_value === 'object') {
      savedAnswers[r.question_id] = r.answer_value as Record<string, unknown>;
    }
  }

  const sectionLimits: Record<SectionKind, number> = {
    multiple_choice: session.exams.time_limit_mc ?? 1800,
    short_text: session.exams.time_limit_st ?? 600,
    task_based: session.exams.time_limit_task ?? 1200
  };

  const currentSectionStartedAt = sp[cur]?.started_at ?? null;

  return (
    <ExamRunner
      token={token}
      examName={session.exams.name}
      applicantName={session.name ?? ''}
      fullscreenRequired={session.exams.fullscreen_required}
      questions={questions}
      savedAnswers={savedAnswers}
      flaggedIds={session.flagged_question_ids ?? []}
      currentSection={cur}
      currentSectionStartedAt={currentSectionStartedAt!}
      sectionLimits={sectionLimits}
    />
  );
}

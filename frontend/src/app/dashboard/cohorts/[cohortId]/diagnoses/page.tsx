import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { createAdminClient } from '@/lib/supabase/server';
import { DiagnosisCard } from './_components/diagnosis-card';
import { PrePostComparison } from './_components/pre-post-comparison';
import { QuestionsPreviewButton } from './_components/questions-preview-button';

type Props = {
  params: Promise<{ cohortId: string }>;
};

export const dynamic = 'force-dynamic';

export default async function DiagnosesPage({ params }: Props) {
  const { cohortId } = await params;
  const supabase = createAdminClient();

  const { data: diagnoses } = await supabase
    .from('diagnoses')
    .select(
      'id, title, type, opens_at, closes_at, share_code, attendance_check_id, duration_minutes'
    )
    .eq('cohort_id', cohortId)
    .order('type', { ascending: true })
    .returns<
      {
        id: string;
        title: string;
        type: string;
        opens_at: string | null;
        closes_at: string | null;
        share_code: string | null;
        attendance_check_id: string | null;
        duration_minutes: number;
      }[]
    >();

  if (!diagnoses || diagnoses.length === 0) {
    return (
      <PageContainer pageTitle='사전·사후 진단' pageDescription='역량 진단 운영 및 향상도 분석'>
        <div className='rounded-2xl border bg-white px-8 py-12 text-center text-muted-foreground'>
          이 기수에 등록된 진단 평가가 없습니다.
        </div>
      </PageContainer>
    );
  }

  // 진단별 통계
  type Resp = {
    id: string;
    diagnosis_id: string;
    student_id: string | null;
    token: string;
    submitted_at: string | null;
    total_score: number | null;
    responses: Record<string, string> | null;
    students: { name: string } | null;
  };
  const { data: responses } = await supabase
    .from('diagnosis_responses')
    .select(
      'id, diagnosis_id, student_id, token, submitted_at, total_score, responses, students(name)'
    )
    .in(
      'diagnosis_id',
      diagnoses.map((d) => d.id)
    )
    .returns<Resp[]>();

  // 테스트 학생(이름 prefix '테스트')은 응답·분석에서 제외. student_id 가 없는 익명 응답은 유지.
  const isTestStudent = (name: string | null | undefined) =>
    (name ?? '').trim().startsWith('테스트');
  const filteredResponses = (responses ?? []).filter((r) => !isTestStudent(r.students?.name));

  const responsesByDiag = new Map<string, Resp[]>();
  for (const r of filteredResponses) {
    const arr = responsesByDiag.get(r.diagnosis_id) ?? [];
    arr.push(r);
    responsesByDiag.set(r.diagnosis_id, arr);
  }

  // 문항 — 사전·사후 동일 내용이라 첫 진단의 문항만 fetch
  type Question = {
    id: string;
    question_no: number;
    type: string;
    text: string;
    options: Record<string, unknown> | null;
    weight: string | null;
  };
  const { data: previewQuestions } = await supabase
    .from('diagnosis_questions')
    .select('id, question_no, type, text, options, weight')
    .eq('diagnosis_id', diagnoses[0].id)
    .order('question_no', { ascending: true })
    .returns<Question[]>();

  // cohort 의 student 수 (테스트 학생 제외) + cohort 이름 (인쇄용 헤더에 사용)
  const [{ count: studentCount }, { data: cohortRow }] = await Promise.all([
    supabase
      .from('students')
      .select('id', { count: 'exact', head: true })
      .eq('cohort_id', cohortId)
      .not('name', 'ilike', '테스트%'),
    supabase.from('cohorts').select('name').eq('id', cohortId).maybeSingle()
  ]);

  // cohort 의 세션들 + 그 안의 attendance_checks (출석 연동 옵션용)
  type AttnCheckOpt = {
    id: string;
    label: string;
    attendance_role: string | null;
    sessions: { session_date: string; title: string | null } | null;
  };
  const { data: sessionList } = await supabase
    .from('sessions')
    .select('id')
    .eq('cohort_id', cohortId);
  const sessionIds = (sessionList ?? []).map((s) => s.id);
  let attendanceCheckOptions: AttnCheckOpt[] = [];
  if (sessionIds.length > 0) {
    const { data: checks } = await supabase
      .from('attendance_checks')
      .select('id, label, attendance_role, sessions(session_date, title)')
      .in('session_id', sessionIds)
      .order('display_order', { ascending: true })
      .returns<AttnCheckOpt[]>();
    attendanceCheckOptions = checks ?? [];
  }

  return (
    <PageContainer
      pageTitle='사전·사후 진단'
      pageDescription={`학습 효과 측정용 역량 평가 · 학생 ${studentCount ?? 0}명`}
      pageHeaderAction={
        previewQuestions && previewQuestions.length > 0 ? (
          <div className='flex items-center gap-2'>
            <Button asChild size='sm' variant='outline'>
              <a href={`/api/cohorts/${cohortId}/diagnoses/answer-key`} download>
                <Icons.download className='mr-1.5' />
                정답지 엑셀
              </a>
            </Button>
            <QuestionsPreviewButton questions={previewQuestions} />
          </div>
        ) : null
      }
    >
      <div className='space-y-6'>
        <div className='space-y-6 print:hidden'>
          {diagnoses.map((d) => (
            <DiagnosisCard
              key={d.id}
              cohortId={cohortId}
              diagnosis={d}
              responses={responsesByDiag.get(d.id) ?? []}
              studentCount={studentCount ?? 0}
              attendanceCheckOptions={attendanceCheckOptions}
            />
          ))}
        </div>
        {(() => {
          const pre = diagnoses.find((d) => d.type === 'pre');
          const post = diagnoses.find((d) => d.type === 'post');
          if (!pre || !post) return null;
          return (
            <PrePostComparison
              cohortName={cohortRow?.name ?? ''}
              preResponses={responsesByDiag.get(pre.id) ?? []}
              postResponses={responsesByDiag.get(post.id) ?? []}
              questions={previewQuestions ?? []}
            />
          );
        })()}
      </div>
    </PageContainer>
  );
}

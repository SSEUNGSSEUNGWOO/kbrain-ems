import PageContainer from '@/components/layout/page-container';
import { createAdminClient } from '@/lib/supabase/server';
import { DiagnosisCard } from './_components/diagnosis-card';

type Props = {
  params: Promise<{ cohortId: string }>;
};

export const dynamic = 'force-dynamic';

export default async function DiagnosesPage({ params }: Props) {
  const { cohortId } = await params;
  const supabase = createAdminClient();

  const { data: diagnoses } = await supabase
    .from('diagnoses')
    .select('id, title, type, opens_at, closes_at, share_code')
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
    students: { name: string } | null;
  };
  const { data: responses } = await supabase
    .from('diagnosis_responses')
    .select(
      'id, diagnosis_id, student_id, token, submitted_at, total_score, students(name)'
    )
    .in(
      'diagnosis_id',
      diagnoses.map((d) => d.id)
    )
    .returns<Resp[]>();

  const responsesByDiag = new Map<string, Resp[]>();
  for (const r of responses ?? []) {
    const arr = responsesByDiag.get(r.diagnosis_id) ?? [];
    arr.push(r);
    responsesByDiag.set(r.diagnosis_id, arr);
  }

  // cohort 의 student 수
  const { count: studentCount } = await supabase
    .from('students')
    .select('id', { count: 'exact', head: true })
    .eq('cohort_id', cohortId);

  return (
    <PageContainer
      pageTitle='사전·사후 진단'
      pageDescription={`학습 효과 측정용 역량 평가 · 학생 ${studentCount ?? 0}명`}
    >
      <div className='space-y-6'>
        {diagnoses.map((d) => (
          <DiagnosisCard
            key={d.id}
            cohortId={cohortId}
            diagnosis={d}
            responses={responsesByDiag.get(d.id) ?? []}
            studentCount={studentCount ?? 0}
          />
        ))}
      </div>
    </PageContainer>
  );
}

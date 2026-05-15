import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { createAdminClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { InstructorSheet } from './_components/instructor-sheet';
import { InstructorTable } from './_components/instructor-table';

type Props = {
  searchParams: Promise<{ tab?: string }>;
};

export default async function InstructorPoolPage({ searchParams }: Props) {
  const { tab } = await searchParams;
  const activeKind: 'main' | 'sub' = tab === 'sub' ? 'sub' : 'main';
  const supabase = createAdminClient();

  const [{ data: instructors }, { data: scoreQuestions }] = await Promise.all([
    supabase
      .from('instructors')
      .select('id, name, affiliation, specialty, email, phone, notes, kind')
      .order('name'),
    supabase
      .from('survey_questions')
      .select('id, instructor_id, survey_id')
      .not('instructor_id', 'is', null)
      .eq('type', 'likert10')
  ]);

  // 강사별 만족도 평균 — survey_questions(instructor_id) × survey_responses 응답 집계
  const surveyIds = Array.from(
    new Set((scoreQuestions ?? []).map((q) => q.survey_id))
  );
  const { data: scoreResponses } =
    surveyIds.length > 0
      ? await supabase
          .from('survey_responses')
          .select('survey_id, responses')
          .in('survey_id', surveyIds)
          .not('submitted_at', 'is', null)
      : { data: [] };

  const qIdsByInstructor = new Map<string, Set<string>>();
  for (const q of scoreQuestions ?? []) {
    if (!q.instructor_id) continue;
    const set = qIdsByInstructor.get(q.instructor_id) ?? new Set<string>();
    set.add(q.id);
    qIdsByInstructor.set(q.instructor_id, set);
  }

  const statByInstructor = new Map<string, { sum: number; count: number }>();
  for (const r of scoreResponses ?? []) {
    const obj = (r.responses ?? {}) as Record<string, unknown>;
    for (const [instId, qIds] of qIdsByInstructor) {
      for (const qid of qIds) {
        const v = obj[qid];
        if (typeof v !== 'number' || v < 1 || v > 5) continue;
        const entry = statByInstructor.get(instId) ?? { sum: 0, count: 0 };
        entry.sum += v;
        entry.count += 1;
        statByInstructor.set(instId, entry);
      }
    }
  }

  const withScores = (instructors ?? []).map((i) => {
    const stat = statByInstructor.get(i.id);
    return {
      ...i,
      avgScore: stat ? stat.sum / stat.count : null,
      responseCount: stat?.count ?? 0
    };
  });

  const all = withScores;
  const main = all.filter((i) => (i.kind ?? 'main') === 'main');
  const sub = all.filter((i) => i.kind === 'sub');
  const rows = activeKind === 'sub' ? sub : main;
  const label = activeKind === 'sub' ? '보조강사' : '강사';

  return (
    <PageContainer
      pageTitle='강사풀'
      pageDescription={`강사 ${main.length}명 · 보조강사 ${sub.length}명. 기수 무관 공통 마스터.`}
      pageHeaderAction={
        <InstructorSheet kind={activeKind} trigger={<Button>{`+ 새 ${label}`}</Button>} />
      }
    >
      {/* 탭 */}
      <div className='mb-5 inline-flex rounded-lg border bg-card p-1'>
        <Link
          href='/dashboard/instructors?tab=main'
          className={`rounded-md px-4 py-1.5 text-sm font-semibold transition ${
            activeKind === 'main' ? 'bg-blue-600 text-white' : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          강사 ({main.length})
        </Link>
        <Link
          href='/dashboard/instructors?tab=sub'
          className={`rounded-md px-4 py-1.5 text-sm font-semibold transition ${
            activeKind === 'sub' ? 'bg-emerald-600 text-white' : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          보조강사 ({sub.length})
        </Link>
      </div>

      <InstructorTable instructors={rows} />
    </PageContainer>
  );
}

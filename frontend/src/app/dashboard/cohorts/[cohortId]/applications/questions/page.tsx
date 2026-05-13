import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { createAdminClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/supabase/types';
import Link from 'next/link';
import { ApplicationsViewer, type Question } from '../_components/applications-viewer';

type Props = { params: Promise<{ cohortId: string }> };

function parseChoices(choices: Json | null): { key: string; text: string }[] {
  if (!Array.isArray(choices)) return [];
  return choices.filter(
    (c): c is { key: string; text: string } =>
      typeof c === 'object' &&
      c !== null &&
      !Array.isArray(c) &&
      typeof (c as { key?: unknown }).key === 'string' &&
      typeof (c as { text?: unknown }).text === 'string'
  ) as { key: string; text: string }[];
}

export default async function CohortApplicationsQuestionsPage({ params }: Props) {
  const { cohortId } = await params;
  const supabase = createAdminClient();

  const [{ data: cohort }, { data: questions }] = await Promise.all([
    supabase.from('cohorts').select('id, name').eq('id', cohortId).maybeSingle(),
    supabase
      .from('application_questions')
      .select(
        'id, section, question_no, difficulty, question_text, question_type, choices, correct_choice, weight, display_order'
      )
      .eq('cohort_id', cohortId)
      .order('display_order')
  ]);

  const rows: Question[] = (questions ?? []).map((q) => ({
    id: q.id,
    section: q.section,
    question_no: q.question_no,
    difficulty: q.difficulty,
    question_text: q.question_text,
    question_type: q.question_type,
    choices: parseChoices(q.choices),
    correct_choice: q.correct_choice,
    weight: q.weight
  }));

  const backHref = `/dashboard/cohorts/${cohortId}/applications`;

  if (rows.length === 0) {
    return (
      <PageContainer
        pageTitle='사전문항 미리보기'
        pageDescription={cohort?.name ?? ''}
        pageHeaderAction={
          <Button variant='outline' asChild>
            <Link href={backHref}>← 신청자 리스트</Link>
          </Button>
        }
      >
        <div className='text-muted-foreground rounded-lg border border-dashed p-12 text-center'>
          이 기수에는 아직 사전문항이 등록되지 않았습니다.
          <br />
          <code className='mt-2 inline-block text-xs'>
            bun run scripts/seed-application-questions.ts
          </code>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      pageTitle='사전문항 미리보기'
      pageDescription={`${cohort?.name ?? ''} — 운영자 검수용`}
      pageHeaderAction={
        <Button variant='outline' asChild>
          <Link href={backHref}>← 신청자 리스트</Link>
        </Button>
      }
    >
      <ApplicationsViewer questions={rows} />
    </PageContainer>
  );
}

import PageContainer from '@/components/layout/page-container';
import { createClient } from '@/lib/supabase/server';
import { CreateCohortSheet } from './_components/create-cohort-sheet';
import { CohortCard } from './_components/cohort-card';

export default async function CohortsPage() {
  const supabase = await createClient();
  const { data: cohorts, error } = await supabase
    .from('cohorts')
    .select('id, name, started_at, ended_at, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    return (
      <PageContainer pageTitle='교육과정'>
        <div className='text-destructive'>
          기수 목록을 불러오지 못했습니다: {error.message}
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      pageTitle='교육과정'
      pageDescription='교육 기수를 선택해 인원·출결·과제·수료 등을 관리합니다.'
      pageHeaderAction={<CreateCohortSheet />}
    >
      {!cohorts || cohorts.length === 0 ? (
        <div className='text-muted-foreground rounded-md border p-8 text-center'>
          등록된 기수가 없습니다. 우측 상단 [+ 기수 추가]로 등록해주세요.
        </div>
      ) : (
        <ul className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
          {cohorts.map((c) => (
            <li key={c.id}>
              <CohortCard cohort={c} />
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}

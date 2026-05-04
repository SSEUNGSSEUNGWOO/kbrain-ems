import PageContainer from '@/components/layout/page-container';
import { db } from '@/lib/db';
import { cohorts } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';
import { CreateCohortSheet } from './_components/create-cohort-sheet';
import { CohortCard } from './_components/cohort-card';

export default async function CohortsPage() {
  try {
    const data = await db
      .select({
        id: cohorts.id,
        name: cohorts.name,
        started_at: cohorts.startedAt,
        ended_at: cohorts.endedAt,
        created_at: cohorts.createdAt
      })
      .from(cohorts)
      .orderBy(desc(cohorts.createdAt));

    return (
      <PageContainer
        pageTitle='교육과정'
        pageDescription='교육 기수를 선택해 인원·출결·과제·수료 등을 관리합니다.'
        pageHeaderAction={<CreateCohortSheet />}
      >
        {!data || data.length === 0 ? (
          <div className='text-muted-foreground rounded-md border p-8 text-center'>
            등록된 기수가 없습니다. 우측 상단 [+ 기수 추가]로 등록해주세요.
          </div>
        ) : (
          <ul className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
            {data.map((c) => (
              <li key={c.id}>
                <CohortCard cohort={c} />
              </li>
            ))}
          </ul>
        )}
      </PageContainer>
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : '알 수 없는 오류';
    return (
      <PageContainer pageTitle='교육과정'>
        <div className='text-destructive'>
          기수 목록을 불러오지 못했습니다: {message}
        </div>
      </PageContainer>
    );
  }
}

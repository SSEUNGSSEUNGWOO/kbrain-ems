import PageContainer from '@/components/layout/page-container';
import { createAdminClient } from '@/lib/supabase/server';
import { Icons } from '@/components/icons';
import { getOperator, isDeveloper } from '@/lib/auth';
import { sortCohortsByPreference } from '@/lib/cohort-sort';
import { CreateCohortSheet } from './_components/create-cohort-sheet';
import { SortableCohortList } from './_components/sortable-cohort-list';

export default async function CohortsPage() {
  try {
    const supabase = createAdminClient();
    const operator = await getOperator();

    const { data: cohortRows, error: cohortError } = await supabase
      .from('cohorts')
      .select(
        'id, name, category, started_at, ended_at, recruiting_slug, application_start_at, application_end_at, max_capacity, created_at'
      )
      .order('created_at', { ascending: true });
    if (cohortError) throw new Error(cohortError.message);

    const cohorts = sortCohortsByPreference(cohortRows ?? [], operator?.cohort_order ?? []);

    // Per-cohort student & session counts (group by 미지원 → JS reduce)
    const { data: studentRows } = await supabase
      .from('students')
      .select('cohort_id');
    const { data: sessionRows } = await supabase
      .from('sessions')
      .select('cohort_id');

    const studentCountMap = new Map<string, number>();
    for (const r of studentRows ?? []) {
      studentCountMap.set(r.cohort_id, (studentCountMap.get(r.cohort_id) ?? 0) + 1);
    }
    const sessionCountMap = new Map<string, number>();
    for (const r of sessionRows ?? []) {
      sessionCountMap.set(r.cohort_id, (sessionCountMap.get(r.cohort_id) ?? 0) + 1);
    }

    const data = cohorts.map((c) => ({
      id: c.id,
      name: c.name,
      category: c.category,
      started_at: c.started_at,
      ended_at: c.ended_at,
      recruiting_slug: c.recruiting_slug,
      application_start_at: c.application_start_at,
      application_end_at: c.application_end_at,
      max_capacity: c.max_capacity,
      created_at: c.created_at,
      student_count: studentCountMap.get(c.id) ?? 0,
      session_count: sessionCountMap.get(c.id) ?? 0
    }));

    const dev = await isDeveloper();

    type Item = (typeof data)[number];
    const CATEGORIES: { key: string; label: string; tone: string }[] = [
      { key: 'champion', label: '1. AI 챔피언', tone: 'border-blue-300 text-blue-700' },
      { key: 'general', label: '2. 일반교육', tone: 'border-emerald-300 text-emerald-700' },
      { key: 'special', label: '3. 특화교육', tone: 'border-amber-300 text-amber-700' },
      { key: 'experts', label: '4. 전문인재', tone: 'border-violet-300 text-violet-700' }
    ];
    const byCategory = new Map<string, Item[]>();
    for (const c of CATEGORIES) byCategory.set(c.key, []);
    const uncategorized: Item[] = [];
    for (const item of data) {
      if (item.category && byCategory.has(item.category)) {
        byCategory.get(item.category)!.push(item);
      } else {
        uncategorized.push(item);
      }
    }

    return (
      <PageContainer
        pageTitle='교육과정'
        pageDescription='교육 기수를 선택해 인원·출결·과제·수료 등을 관리합니다.'
        pageHeaderAction={dev ? <CreateCohortSheet /> : undefined}
      >
        {!data || data.length === 0 ? (
          <div className='flex flex-col items-center justify-center rounded-xl border border-dashed py-16'>
            <div className='mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/40'>
              <Icons.galleryVerticalEnd className='h-6 w-6 text-violet-500' />
            </div>
            <p className='text-foreground mb-1 font-medium'>등록된 기수가 없습니다</p>
            <p className='text-muted-foreground mb-4 text-sm'>우측 상단 [+ 기수 추가]로 첫 교육과정을 등록해주세요.</p>
          </div>
        ) : (
          <div className='space-y-6'>
            {CATEGORIES.map((cat) => {
              const items = byCategory.get(cat.key) ?? [];
              if (items.length === 0) return null;
              return (
                <section key={cat.key}>
                  <div className='mb-2 flex items-center gap-2'>
                    <span className={`inline-flex items-center rounded-md border bg-card px-2.5 py-1 text-xs font-bold ${cat.tone}`}>
                      {cat.label}
                    </span>
                    <span className='text-muted-foreground text-xs'>{items.length}개 기수</span>
                  </div>
                  <SortableCohortList cohorts={items} />
                </section>
              );
            })}
            {uncategorized.length > 0 && (
              <section>
                <div className='mb-2 flex items-center gap-2'>
                  <span className='inline-flex items-center rounded-md border bg-card px-2.5 py-1 text-xs font-bold text-muted-foreground'>
                    미분류
                  </span>
                  <span className='text-muted-foreground text-xs'>{uncategorized.length}개 기수</span>
                </div>
                <SortableCohortList cohorts={uncategorized} />
              </section>
            )}
          </div>
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

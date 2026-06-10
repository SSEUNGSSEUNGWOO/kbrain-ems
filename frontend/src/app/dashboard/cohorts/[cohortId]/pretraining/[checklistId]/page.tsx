import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { createAdminClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ItemAddForm } from '../_components/item-add-form';
import { ItemDeleteButton } from '../_components/item-delete-button';

type Props = { params: Promise<{ cohortId: string; checklistId: string }> };

type Item = {
  id: string;
  question_no: string;
  text: string;
  guide_url: string | null;
  parent_id: string | null;
  parent_answer: string | null;
  no_hint: string | null;
  display_order: number;
};

export default async function ChecklistEditPage({ params }: Props) {
  const { cohortId, checklistId } = await params;
  const supabase = createAdminClient();

  const [{ data: checklist }, { data: items }] = await Promise.all([
    supabase
      .from('pretraining_checklists')
      .select('id, title, description, guide_url, cohort_id')
      .eq('id', checklistId)
      .maybeSingle(),
    supabase
      .from('pretraining_checklist_items')
      .select('id, question_no, text, guide_url, parent_id, parent_answer, no_hint, display_order')
      .eq('checklist_id', checklistId)
      .order('display_order', { ascending: true })
      .returns<Item[]>()
  ]);

  if (!checklist || checklist.cohort_id !== cohortId) notFound();

  const itemsById = new Map((items ?? []).map((i) => [i.id, i]));

  return (
    <PageContainer
      pageTitle={checklist.title}
      pageDescription='사전 세팅 체크리스트 편집'
      pageHeaderAction={
        <div className='flex gap-2'>
          <Button variant='outline' size='sm' asChild>
            <Link href={`/dashboard/cohorts/${cohortId}/pretraining`}>← 목록</Link>
          </Button>
          <Button variant='outline' size='sm' asChild>
            <Link href={`/dashboard/cohorts/${cohortId}/pretraining/${checklistId}/responses`}>
              응답 보기
            </Link>
          </Button>
        </div>
      }
    >
      <div className='flex max-w-3xl flex-col gap-6'>
        {checklist.description && (
          <Card>
            <CardContent className='py-4 text-sm text-muted-foreground'>
              {checklist.description}
            </CardContent>
          </Card>
        )}

        <section>
          <h2 className='mb-3 text-sm font-medium'>
            항목 <span className='text-muted-foreground'>({items?.length ?? 0})</span>
          </h2>
          {(!items || items.length === 0) ? (
            <Card>
              <CardContent className='text-muted-foreground py-8 text-center text-sm'>
                항목이 없습니다. 아래에서 추가하세요.
              </CardContent>
            </Card>
          ) : (
            <div className='flex flex-col gap-2'>
              {items.map((it) => {
                const parent = it.parent_id ? itemsById.get(it.parent_id) : null;
                return (
                  <Card key={it.id}>
                    <CardContent className='flex items-start justify-between gap-3 px-5 py-3'>
                      <div className='flex flex-col gap-1'>
                        <div className='text-sm'>
                          <span className='text-muted-foreground mr-2 font-mono text-xs'>
                            {it.question_no}.
                          </span>
                          {it.text}
                        </div>
                        <div className='flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground'>
                          {parent && (
                            <span>
                              ↳ {parent.question_no} 에서{' '}
                              <span className='font-semibold'>
                                {it.parent_answer === 'no' ? '아니오' : '예'}
                              </span>
                              일 때만 노출
                            </span>
                          )}
                          {it.guide_url && (
                            <a
                              href={it.guide_url}
                              target='_blank'
                              rel='noreferrer'
                              className='text-blue-600 hover:underline'
                            >
                              가이드
                            </a>
                          )}
                          {it.no_hint && <span>아니오 안내: {it.no_hint}</span>}
                        </div>
                      </div>
                      <ItemDeleteButton
                        cohortId={cohortId}
                        checklistId={checklistId}
                        itemId={it.id}
                      />
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        <ItemAddForm
          cohortId={cohortId}
          checklistId={checklistId}
          existingItems={(items ?? []).map((i) => ({ id: i.id, question_no: i.question_no, text: i.text }))}
        />
      </div>
    </PageContainer>
  );
}

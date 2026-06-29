import { createAdminClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { ChecklistForm } from './_components/checklist-form';

type Props = { params: Promise<{ code: string }> };

export const dynamic = 'force-dynamic';

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

export default async function PretrainingPublicPage({ params }: Props) {
  const { code } = await params;
  const supabase = createAdminClient();

  const { data: checklist } = await supabase
    .from('pretraining_checklists')
    .select('id, title, description, guide_url, share_code, closes_at, cohort_id')
    .eq('share_code', code)
    .maybeSingle();
  if (!checklist) notFound();

  // cohort 카테고리에 따라 운영팀 연락처 안내 — 한 카테고리에 여러 번호 가능
  const { data: cohortRow } = await supabase
    .from('cohorts')
    .select('name, category')
    .eq('id', checklist.cohort_id)
    .maybeSingle();
  const INQUIRY_PHONES_BY_CATEGORY: Record<string, string[]> = {
    general: ['[비공개]'],
    champion: ['[비공개]', '[비공개]']
  };
  const inquiryPhones: string[] | null = cohortRow?.category
    ? INQUIRY_PHONES_BY_CATEGORY[cohortRow.category] ?? null
    : null;
  if (checklist.closes_at && new Date(checklist.closes_at) <= new Date()) {
    return (
      <div className='border-border bg-card text-muted-foreground rounded-xl border px-6 py-12 text-center shadow-sm'>
        이 체크리스트는 응답이 마감되었습니다.
      </div>
    );
  }

  const { data: items } = await supabase
    .from('pretraining_checklist_items')
    .select('id, question_no, text, guide_url, parent_id, parent_answer, no_hint, display_order')
    .eq('checklist_id', checklist.id)
    .order('display_order', { ascending: true })
    .returns<Item[]>();

  return (
    <div className='flex flex-col gap-5'>
      <header className='border-border bg-card rounded-xl border px-6 py-5 shadow-sm'>
        {cohortRow?.name && (
          <div className='bg-accent text-accent-foreground mb-1.5 inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-tight'>
            {cohortRow.name}
          </div>
        )}
        <h1 className='text-foreground text-lg font-bold'>{checklist.title}</h1>
        {checklist.description && (
          <p className='text-muted-foreground mt-2 text-sm whitespace-pre-line'>
            {checklist.description}
          </p>
        )}
        {checklist.guide_url && (
          <a
            href={checklist.guide_url}
            target='_blank'
            rel='noreferrer'
            className='bg-accent text-accent-foreground hover:bg-accent/80 mt-3 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium'
          >
            설치·가입 가이드 보기 →
          </a>
        )}
      </header>

      <ChecklistForm
        checklistId={checklist.id}
        items={items ?? []}
        inquiryPhones={inquiryPhones}
      />
    </div>
  );
}

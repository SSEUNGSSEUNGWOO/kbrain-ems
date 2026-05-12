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

  const { data: instructors } = await supabase
    .from('instructors')
    .select('id, name, affiliation, specialty, email, phone, notes, kind')
    .order('name');

  const all = instructors ?? [];
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

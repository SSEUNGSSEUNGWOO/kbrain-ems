import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { createAdminClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';

type Props = { params: Promise<{ cohortId: string; checklistId: string }> };

type Item = { id: string; question_no: string; text: string };
type Response = {
  id: string;
  name: string;
  organization: string | null;
  phone: string | null;
  answers: Record<string, string> | null;
  submitted_at: string | null;
  created_at: string;
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}/${dd} ${hh}:${mi}`;
}

export default async function ChecklistResponsesPage({ params }: Props) {
  const { cohortId, checklistId } = await params;
  const supabase = createAdminClient();

  const [{ data: checklist }, { data: items }, { data: responses }] = await Promise.all([
    supabase
      .from('pretraining_checklists')
      .select('id, title, cohort_id')
      .eq('id', checklistId)
      .maybeSingle(),
    supabase
      .from('pretraining_checklist_items')
      .select('id, question_no, text')
      .eq('checklist_id', checklistId)
      .order('display_order', { ascending: true })
      .returns<Item[]>(),
    supabase
      .from('pretraining_checklist_responses')
      .select('id, name, organization, phone, answers, submitted_at, created_at')
      .eq('checklist_id', checklistId)
      .order('submitted_at', { ascending: false, nullsFirst: false })
      .returns<Response[]>()
  ]);

  if (!checklist || checklist.cohort_id !== cohortId) notFound();

  const rows = responses ?? [];
  const itemRows = items ?? [];
  const submittedCount = rows.filter((r) => r.submitted_at).length;

  return (
    <PageContainer
      pageTitle='사전 세팅 응답'
      pageDescription={checklist.title}
      pageHeaderAction={
        <div className='flex gap-2'>
          <Button variant='outline' size='sm' asChild>
            <Link href={`/dashboard/cohorts/${cohortId}/pretraining/${checklistId}`}>
              ← 편집
            </Link>
          </Button>
          <Button variant='outline' size='sm' asChild>
            <Link href={`/dashboard/cohorts/${cohortId}/pretraining`}>목록</Link>
          </Button>
        </div>
      }
    >
      <Card className='mb-4'>
        <CardContent className='flex flex-wrap items-center gap-x-8 gap-y-2 py-4 px-6'>
          <Stat label='총 응답' value={rows.length} />
          <Stat label='제출 완료' value={submittedCount} tone='text-emerald-600' />
          <Stat label='미제출' value={rows.length - submittedCount} tone='text-amber-600' />
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <Card>
          <CardContent className='text-muted-foreground py-12 text-center text-sm'>
            아직 응답이 없습니다.
          </CardContent>
        </Card>
      ) : (
        <div className='overflow-x-auto rounded-lg border'>
          <table className='w-full text-sm'>
            <thead className='bg-muted/50'>
              <tr>
                <th className='border-b px-3 py-2 text-left font-medium'>제출</th>
                <th className='border-b px-3 py-2 text-left font-medium'>이름</th>
                <th className='border-b px-3 py-2 text-left font-medium'>소속</th>
                <th className='border-b px-3 py-2 text-left font-medium'>연락처</th>
                {itemRows.map((it) => (
                  <th key={it.id} className='border-b px-3 py-2 text-center font-medium' title={it.text}>
                    {it.question_no}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className='even:bg-muted/10'>
                  <td className='border-b px-3 py-2 text-xs text-muted-foreground tabular-nums'>
                    {r.submitted_at ? formatDateTime(r.submitted_at) : '미제출'}
                  </td>
                  <td className='border-b px-3 py-2 font-medium'>{r.name}</td>
                  <td className='border-b px-3 py-2 text-muted-foreground'>
                    {r.organization ?? '—'}
                  </td>
                  <td className='border-b px-3 py-2 text-muted-foreground tabular-nums text-xs'>
                    {r.phone ?? '—'}
                  </td>
                  {itemRows.map((it) => {
                    const ans = (r.answers ?? {})[it.id];
                    return (
                      <td key={it.id} className='border-b px-3 py-2 text-center'>
                        {ans === 'yes' ? (
                          <Badge className='bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-100'>예</Badge>
                        ) : ans === 'no' ? (
                          <Badge className='bg-rose-100 text-rose-800 border-rose-300 hover:bg-rose-100'>아니오</Badge>
                        ) : (
                          <span className='text-muted-foreground text-xs'>—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageContainer>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className='flex flex-col'>
      <span className='text-muted-foreground text-xs'>{label}</span>
      <span className={`text-lg leading-tight font-semibold tabular-nums ${tone ?? 'text-foreground'}`}>
        {value}
      </span>
    </div>
  );
}

import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { createAdminClient } from '@/lib/supabase/server';
import { isTestStudent } from '@/lib/students';
import Link from 'next/link';
import { notFound } from 'next/navigation';

type Props = { params: Promise<{ cohortId: string; checklistId: string }> };

type Item = { id: string; question_no: string; text: string };
type StudentRow = {
  id: string;
  name: string;
  phone: string | null;
  organizations: { name: string } | null;
};
type ResponseRow = {
  id: string;
  student_id: string | null;
  answers: Record<string, string> | null;
  submitted_at: string | null;
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

  const { data: checklist } = await supabase
    .from('pretraining_checklists')
    .select('id, title, cohort_id')
    .eq('id', checklistId)
    .maybeSingle();
  if (!checklist || checklist.cohort_id !== cohortId) notFound();

  const [{ data: items }, { data: students }, { data: responses }] = await Promise.all([
    supabase
      .from('pretraining_checklist_items')
      .select('id, question_no, text')
      .eq('checklist_id', checklistId)
      .order('display_order', { ascending: true })
      .returns<Item[]>(),
    supabase
      .from('students')
      .select('id, name, phone, organizations(name)')
      .eq('cohort_id', cohortId)
      .order('name', { ascending: true })
      .returns<StudentRow[]>(),
    supabase
      .from('pretraining_checklist_responses')
      .select('id, student_id, answers, submitted_at')
      .eq('checklist_id', checklistId)
      .returns<ResponseRow[]>()
  ]);

  const itemRows = items ?? [];
  const studentRows = (students ?? []).filter((s) => !isTestStudent(s.name));
  const responseByStudent = new Map<string, ResponseRow>();
  for (const r of responses ?? []) {
    if (r.student_id) responseByStudent.set(r.student_id, r);
  }

  const submittedCount = studentRows.filter((s) => {
    const r = responseByStudent.get(s.id);
    return !!r?.submitted_at;
  }).length;
  const pendingCount = studentRows.length - submittedCount;

  return (
    <PageContainer
      pageTitle='사전 세팅 응답'
      pageDescription={checklist.title}
      pageHeaderAction={
        <div className='flex gap-2'>
          <Button variant='outline' size='sm' asChild>
            <Link href={`/dashboard/cohorts/${cohortId}/pretraining/${checklistId}`}>← 편집</Link>
          </Button>
          <Button variant='outline' size='sm' asChild>
            <Link href={`/dashboard/cohorts/${cohortId}/pretraining`}>목록</Link>
          </Button>
        </div>
      }
    >
      <Card className='mb-4'>
        <CardContent className='flex flex-wrap items-center gap-x-8 gap-y-2 py-4 px-6'>
          <Stat label='교육생' value={studentRows.length} />
          <Stat label='제출 완료' value={submittedCount} tone='text-emerald-600' />
          <Stat label='미제출' value={pendingCount} tone='text-amber-600' />
        </CardContent>
      </Card>

      {studentRows.length === 0 ? (
        <Card>
          <CardContent className='text-muted-foreground py-12 text-center text-sm'>
            이 기수에 등록된 교육생이 없습니다.
          </CardContent>
        </Card>
      ) : (
        <div className='overflow-x-auto rounded-lg border'>
          <table className='w-full text-sm'>
            <thead className='bg-muted/50'>
              <tr>
                <th className='border-b px-3 py-2 text-left font-medium'>상태</th>
                <th className='border-b px-3 py-2 text-left font-medium'>이름</th>
                <th className='border-b px-3 py-2 text-left font-medium'>소속</th>
                <th className='border-b px-3 py-2 text-left font-medium'>연락처</th>
                {itemRows.map((it) => (
                  <th key={it.id} className='border-b px-3 py-2 text-center font-medium' title={it.text}>
                    {it.question_no}
                  </th>
                ))}
                <th className='border-b px-3 py-2 text-left font-medium'>제출 시각</th>
              </tr>
            </thead>
            <tbody>
              {studentRows.map((s) => {
                const r = responseByStudent.get(s.id);
                const submitted = !!r?.submitted_at;
                return (
                  <tr key={s.id} className='even:bg-muted/10'>
                    <td className='border-b px-3 py-2'>
                      {submitted ? (
                        <Badge className='bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-100'>
                          제출
                        </Badge>
                      ) : (
                        <Badge variant='outline' className='border-amber-300 bg-amber-50 text-amber-700'>
                          미제출
                        </Badge>
                      )}
                    </td>
                    <td className='border-b px-3 py-2 font-medium'>{s.name}</td>
                    <td className='border-b px-3 py-2 text-muted-foreground'>
                      {s.organizations?.name ?? '—'}
                    </td>
                    <td className='border-b px-3 py-2 text-muted-foreground tabular-nums text-xs'>
                      {s.phone ?? '—'}
                    </td>
                    {itemRows.map((it) => {
                      const ans = (r?.answers ?? {})[it.id];
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
                    <td className='border-b px-3 py-2 text-xs text-muted-foreground tabular-nums'>
                      {r?.submitted_at ? formatDateTime(r.submitted_at) : '—'}
                    </td>
                  </tr>
                );
              })}
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

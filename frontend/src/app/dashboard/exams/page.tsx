import Link from 'next/link';
import PageContainer from '@/components/layout/page-container';
import { createAdminClient } from '@/lib/supabase/server';
import { isDeveloper } from '@/lib/auth';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Icons } from '@/components/icons';

export const dynamic = 'force-dynamic';

export default async function ExamsPage() {
  if (!(await isDeveloper())) notFound();

  const supabase = createAdminClient();

  const { data: exams } = await supabase
    .from('exams')
    .select('id, name, description, share_code, fullscreen_required, time_limit_minutes, created_at')
    .order('created_at', { ascending: false });

  const stats = await Promise.all(
    (exams ?? []).map(async (e) => {
      const [qCountRes, sessCountRes, submittedRes] = await Promise.all([
        supabase
          .from('exam_questions_in_exam')
          .select('question_id', { count: 'exact', head: true })
          .eq('exam_id', e.id),
        supabase
          .from('exam_sessions')
          .select('id', { count: 'exact', head: true })
          .eq('exam_id', e.id),
        supabase
          .from('exam_sessions')
          .select('id', { count: 'exact', head: true })
          .eq('exam_id', e.id)
          .not('submitted_at', 'is', null)
      ]);
      return {
        exam: e,
        qCount: qCountRes.count ?? 0,
        sessCount: sessCountRes.count ?? 0,
        submittedCount: submittedRes.count ?? 0
      };
    })
  );

  return (
    <PageContainer
      pageTitle='실전평가'
      pageDescription='CBT 방식 실전평가 시험 세트·응시자·결과 관리'
    >
      {stats.length === 0 ? (
        <div className='flex flex-col items-center justify-center rounded-xl border border-dashed py-16'>
          <div className='mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40'>
            <Icons.forms className='h-6 w-6 text-blue-500' />
          </div>
          <p className='text-foreground mb-1 font-medium'>등록된 시험이 없습니다</p>
        </div>
      ) : (
        <div className='grid gap-4 md:grid-cols-2'>
          {stats.map(({ exam, qCount, sessCount, submittedCount }) => (
            <Link key={exam.id} href={`/dashboard/exams/${exam.id}`}>
              <Card className='hover:border-primary/50 transition-colors'>
                <CardHeader>
                  <CardTitle className='text-lg'>{exam.name}</CardTitle>
                  {exam.description && (
                    <p className='text-muted-foreground text-sm'>{exam.description}</p>
                  )}
                </CardHeader>
                <CardContent className='space-y-3'>
                  <div className='grid grid-cols-3 gap-3 text-center'>
                    <Stat label='문항' value={`${qCount}`} />
                    <Stat label='응시자' value={`${sessCount}`} />
                    <Stat label='제출' value={`${submittedCount}`} />
                  </div>
                  <div className='text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs'>
                    <span>
                      공유코드 <span className='font-mono text-foreground'>{exam.share_code ?? '-'}</span>
                    </span>
                    {exam.fullscreen_required && <span>· 전체화면 필수</span>}
                    {exam.time_limit_minutes && <span>· 총 {exam.time_limit_minutes}분</span>}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </PageContainer>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className='rounded-md border bg-card px-3 py-2'>
      <div className='text-muted-foreground text-[10px] uppercase tracking-widest'>{label}</div>
      <div className='text-xl font-semibold tabular-nums'>{value}</div>
    </div>
  );
}

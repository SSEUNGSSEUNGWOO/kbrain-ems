import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/server';
import { CheckinForm } from './_components/checkin-form';

type Props = {
  params: Promise<{ code: string }>;
};

export const dynamic = 'force-dynamic';

export default async function AttendanceCheckEntryPage({ params }: Props) {
  const { code } = await params;
  const supabase = createAdminClient();

  const { data: check } = await supabase
    .from('attendance_checks')
    .select(
      'id, label, sessions(session_date, title, cohorts(name))'
    )
    .eq('share_code', code)
    .maybeSingle();

  if (!check) notFound();

  // opens_at/closes_at 시간 window 차단 제거 — 학생은 언제든 진입·체크인 가능.
  // 지각 여부는 criterion_at으로만 판정.

  const session = check.sessions as unknown as {
    session_date: string;
    title: string | null;
    cohorts: { name: string } | null;
  } | null;
  const cohortName = session?.cohorts?.name ?? '';
  const sessionLabel = session
    ? `${session.session_date}${session.title ? ` · ${session.title}` : ''}`
    : '';

  return (
    <main className='flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 px-4 py-12'>
      <div className='w-full max-w-sm'>
        <CheckinForm
          code={code}
          label={check.label}
          cohortName={cohortName}
          sessionLabel={sessionLabel}
        />
      </div>
    </main>
  );
}

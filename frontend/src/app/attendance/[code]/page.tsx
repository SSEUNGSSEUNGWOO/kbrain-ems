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
      'id, label, opens_at, closes_at, sessions(session_date, title, cohorts(name))'
    )
    .eq('share_code', code)
    .maybeSingle();

  if (!check) notFound();

  const now = Date.now();
  if (check.opens_at && new Date(check.opens_at).getTime() > now) {
    return (
      <main className='flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 px-4'>
        <div className='w-full max-w-sm rounded-2xl border bg-white px-8 py-12 text-center shadow-lg'>
          <h2 className='text-lg font-bold text-slate-900'>아직 체크인 시간이 아닙니다</h2>
          <p className='mt-2 text-sm text-slate-500'>
            {new Date(check.opens_at).toLocaleString('ko-KR')} 이후 가능합니다.
          </p>
        </div>
      </main>
    );
  }
  if (check.closes_at && new Date(check.closes_at).getTime() < now) {
    return (
      <main className='flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 px-4'>
        <div className='w-full max-w-sm rounded-2xl border bg-white px-8 py-12 text-center shadow-lg'>
          <h2 className='text-lg font-bold text-slate-900'>체크인 시간이 종료되었습니다</h2>
        </div>
      </main>
    );
  }

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

import { createAdminClient } from '@/lib/supabase/server';
import Link from 'next/link';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ id?: string }>;
};

export default async function ApplyDonePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { id } = await searchParams;

  let summary: {
    applicantName: string;
    organizationName: string | null;
    cohortName: string;
    appliedAt: string | null;
  } | null = null;

  if (id) {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('applications')
      .select(
        'applied_at, cohorts(name), applicants(name, organizations(name))'
      )
      .eq('id', id)
      .maybeSingle();

    if (data) {
      const cohort = data.cohorts as unknown as { name: string } | null;
      const applicant = data.applicants as unknown as
        | { name: string; organizations: { name: string } | null }
        | null;
      summary = {
        applicantName: applicant?.name ?? '',
        organizationName: applicant?.organizations?.name ?? null,
        cohortName: cohort?.name ?? '',
        appliedAt: data.applied_at
      };
    }
  }

  return (
    <main className='flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 px-4 py-12'>
      <div className='w-full max-w-md rounded-2xl border bg-white px-8 py-10 shadow-lg'>
        <div className='mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600'>
          <svg className='h-7 w-7' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M5 13l4 4L19 7' />
          </svg>
        </div>
        <h1 className='text-center text-xl font-bold text-slate-900'>신청이 접수되었습니다</h1>
        <p className='mt-2 text-center text-sm text-slate-500'>참여 신청에 감사드립니다.</p>

        {summary && (
          <dl className='mt-6 space-y-3 rounded-xl border border-slate-100 bg-slate-50/60 px-5 py-4 text-sm'>
            {summary.applicantName && (
              <div className='flex justify-between gap-4'>
                <dt className='font-medium text-slate-500'>신청자</dt>
                <dd className='font-semibold text-slate-900'>{summary.applicantName}</dd>
              </div>
            )}
            {summary.organizationName && (
              <div className='flex justify-between gap-4'>
                <dt className='font-medium text-slate-500'>소속 기관</dt>
                <dd className='text-right text-slate-800'>{summary.organizationName}</dd>
              </div>
            )}
            {summary.cohortName && (
              <div className='flex justify-between gap-4'>
                <dt className='font-medium text-slate-500'>지원 기수</dt>
                <dd className='text-right text-slate-800'>{summary.cohortName}</dd>
              </div>
            )}
            {summary.appliedAt && (
              <div className='flex justify-between gap-4'>
                <dt className='font-medium text-slate-500'>접수일</dt>
                <dd className='text-slate-800'>{summary.appliedAt}</dd>
              </div>
            )}
          </dl>
        )}

        <div className='mt-6 rounded-md bg-blue-50/60 px-4 py-3 text-xs text-blue-900'>
          ⓘ 선발 결과는 운영팀이 검토 후 등록된 이메일·연락처로 별도 안내드립니다.
        </div>

        <p className='mt-6 text-center text-[11px] text-slate-400'>
          KBrain EMS · <Link href={`/apply/${slug}`} className='underline'>다른 신청자가 작성하기</Link>
        </p>
      </div>
    </main>
  );
}

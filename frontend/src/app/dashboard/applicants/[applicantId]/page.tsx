import { notFound } from 'next/navigation';
import Link from 'next/link';
import PageContainer from '@/components/layout/page-container';
import { createAdminClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { ApplicantSheet } from '../_components/applicant-sheet';
import { ApplicationSheet } from './_components/application-sheet';
import { ApplicationTable } from './_components/application-table';

export default async function ApplicantDetailPage({
  params
}: {
  params: Promise<{ applicantId: string }>;
}) {
  const { applicantId } = await params;
  const supabase = createAdminClient();

  type ApplicantRow = {
    id: string;
    name: string;
    department: string | null;
    job_title: string | null;
    job_role: string | null;
    birth_date: string | null;
    email: string | null;
    phone: string | null;
    notes: string | null;
    organizations: { name: string; category: string | null } | null;
  };

  const { data: applicantRows, error: applicantError } = await supabase
    .from('applicants')
    .select(
      'id, name, department, job_title, job_role, birth_date, email, phone, notes, organizations(name, category)'
    )
    .eq('id', applicantId)
    .limit(1)
    .returns<ApplicantRow[]>();
  if (applicantError) throw new Error(applicantError.message);

  const row = applicantRows?.[0];
  if (!row) notFound();

  const applicant = {
    id: row.id,
    name: row.name,
    organizationName: row.organizations?.name ?? null,
    organizationCategory: row.organizations?.category ?? null,
    department: row.department,
    job_title: row.job_title,
    job_role: row.job_role,
    birth_date: row.birth_date,
    email: row.email,
    phone: row.phone,
    notes: row.notes
  };

  const { data: cohortRows, error: cohortError } = await supabase
    .from('cohorts')
    .select('id, name')
    .order('name', { ascending: true });
  if (cohortError) throw new Error(cohortError.message);

  type ApplicationRow = {
    id: string;
    cohort_id: string;
    status: string;
    rejected_stage: string | null;
    applied_at: string | null;
    decided_at: string | null;
    note: string | null;
    cohorts: { name: string } | null;
  };

  const { data: applicationRowsRaw, error: applicationError } = await supabase
    .from('applications')
    .select(
      'id, cohort_id, status, rejected_stage, applied_at, decided_at, note, cohorts(name)'
    )
    .eq('applicant_id', applicantId)
    .order('applied_at', { ascending: false })
    .returns<ApplicationRow[]>();
  if (applicationError) throw new Error(applicationError.message);

  const applicationRows = (applicationRowsRaw ?? []).map((a) => ({
    id: a.id,
    cohort_id: a.cohort_id,
    cohortName: a.cohorts?.name ?? null,
    status: a.status,
    rejected_stage: a.rejected_stage,
    applied_at: a.applied_at,
    decided_at: a.decided_at,
    note: a.note
  }));

  return (
    <PageContainer
      pageTitle={applicant.name}
      pageDescription='지원자 상세'
      pageHeaderAction={
        <div className='flex gap-2'>
          <Button variant='outline' asChild>
            <Link href='/dashboard/applicants'>
              <Icons.chevronLeft className='h-4 w-4' />
              목록
            </Link>
          </Button>
          <ApplicantSheet
            applicant={applicant}
            trigger={<Button variant='outline'>정보 수정</Button>}
          />
        </div>
      }
    >
      <div className='grid gap-6'>
        <section className='rounded-md border p-4'>
          <h2 className='mb-3 text-sm font-medium'>기본 정보</h2>
          <dl className='grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-3'>
            <Field label='소속' value={applicant.organizationName} />
            <Field label='구분' value={applicant.department} />
            <Field label='직책' value={applicant.job_title} />
            <Field label='직렬' value={applicant.job_role} />
            <Field label='생년월일' value={applicant.birth_date} />
            <Field label='연락처' value={applicant.phone} />
            <Field label='이메일' value={applicant.email} />
            {applicant.notes && (
              <div className='col-span-full'>
                <Field label='비고' value={applicant.notes} />
              </div>
            )}
          </dl>
        </section>

        <section>
          <div className='mb-3 flex items-center justify-between'>
            <h2 className='text-sm font-medium'>
              지원 이력{' '}
              <span className='text-muted-foreground ml-1 text-xs'>
                ({applicationRows.length})
              </span>
            </h2>
            <ApplicationSheet
              applicantId={applicantId}
              cohorts={cohortRows ?? []}
              trigger={<Button size='sm'>+ 이력 추가</Button>}
            />
          </div>
          <ApplicationTable
            applicantId={applicantId}
            cohorts={cohortRows ?? []}
            applications={applicationRows}
          />
        </section>
      </div>
    </PageContainer>
  );
}

function Field({
  label,
  value
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <dt className='text-muted-foreground text-xs'>{label}</dt>
      <dd className='mt-0.5'>{value || '-'}</dd>
    </div>
  );
}

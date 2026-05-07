import { notFound } from 'next/navigation';
import Link from 'next/link';
import PageContainer from '@/components/layout/page-container';
import { db } from '@/lib/db';
import {
  applicants,
  applications,
  cohorts,
  organizations
} from '@/lib/db/schema';
import { asc, desc, eq } from 'drizzle-orm';
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

  const rows = await db
    .select({
      id: applicants.id,
      name: applicants.name,
      organizationName: organizations.name,
      department: applicants.department,
      job_title: applicants.jobTitle,
      job_role: applicants.jobRole,
      birth_date: applicants.birthDate,
      email: applicants.email,
      phone: applicants.phone,
      notes: applicants.notes
    })
    .from(applicants)
    .leftJoin(organizations, eq(applicants.organizationId, organizations.id))
    .where(eq(applicants.id, applicantId))
    .limit(1);

  const applicant = rows[0];
  if (!applicant) notFound();

  const cohortRows = await db
    .select({ id: cohorts.id, name: cohorts.name })
    .from(cohorts)
    .orderBy(asc(cohorts.name));

  const applicationRows = await db
    .select({
      id: applications.id,
      cohort_id: applications.cohortId,
      cohortName: cohorts.name,
      status: applications.status,
      rejected_stage: applications.rejectedStage,
      applied_at: applications.appliedAt,
      decided_at: applications.decidedAt,
      note: applications.note
    })
    .from(applications)
    .leftJoin(cohorts, eq(applications.cohortId, cohorts.id))
    .where(eq(applications.applicantId, applicantId))
    .orderBy(desc(applications.appliedAt));

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
              cohorts={cohortRows}
              trigger={<Button size='sm'>+ 이력 추가</Button>}
            />
          </div>
          <ApplicationTable
            applicantId={applicantId}
            cohorts={cohortRows}
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

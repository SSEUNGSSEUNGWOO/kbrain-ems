import PageContainer from '@/components/layout/page-container';
import { db } from '@/lib/db';
import { applicants, applications, organizations } from '@/lib/db/schema';
import { asc, eq, sql } from 'drizzle-orm';
import { Button } from '@/components/ui/button';
import { ApplicantSheet } from './_components/applicant-sheet';
import { ApplicantTable } from './_components/applicant-table';

export default async function ApplicantsPage() {
  try {
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
      .orderBy(asc(applicants.name));

    const counts = await db
      .select({
        applicantId: applications.applicantId,
        total: sql<number>`count(*)::int`,
        selected: sql<number>`count(*) FILTER (WHERE ${applications.status} = 'selected')::int`
      })
      .from(applications)
      .groupBy(applications.applicantId);

    const countMap = new Map(
      counts.map((c) => [c.applicantId, { total: c.total, selected: c.selected }])
    );

    const mapped = rows.map((r) => ({
      ...r,
      applicationCount: countMap.get(r.id)?.total ?? 0,
      selectedCount: countMap.get(r.id)?.selected ?? 0
    }));

    return (
      <PageContainer
        pageTitle='지원자 관리'
        pageDescription={`총 ${mapped.length}명`}
        pageHeaderAction={
          <ApplicantSheet trigger={<Button>+ 지원자 추가</Button>} />
        }
      >
        <ApplicantTable applicants={mapped} />
      </PageContainer>
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : '알 수 없는 오류';
    return (
      <PageContainer pageTitle='지원자 관리'>
        <div className='text-destructive'>불러오기 실패: {message}</div>
      </PageContainer>
    );
  }
}

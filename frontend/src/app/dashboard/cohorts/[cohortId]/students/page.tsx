import { notFound } from 'next/navigation';
import PageContainer from '@/components/layout/page-container';
import { db } from '@/lib/db';
import { cohorts, students, organizations } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';
import { Button } from '@/components/ui/button';
import { StudentSheet } from './_components/student-sheet';
import { StudentTable } from './_components/student-table';

export default async function StudentsPage({
  params
}: {
  params: Promise<{ cohortId: string }>;
}) {
  const { cohortId } = await params;

  const cohortRows = await db
    .select({ id: cohorts.id, name: cohorts.name })
    .from(cohorts)
    .where(eq(cohorts.id, cohortId))
    .limit(1);

  const cohort = cohortRows[0];
  if (!cohort) notFound();

  try {
    const rows = await db
      .select({
        id: students.id,
        name: students.name,
        orgName: organizations.name,
        department: students.department,
        job_title: students.jobTitle,
        job_role: students.jobRole,
        birth_date: students.birthDate,
        email: students.email,
        phone: students.phone,
        notes: students.notes
      })
      .from(students)
      .leftJoin(organizations, eq(students.organizationId, organizations.id))
      .where(eq(students.cohortId, cohortId))
      .orderBy(asc(students.name));

    // Map to match the shape StudentTable expects: organizations as { name: string } | null
    const mapped = rows.map((r) => ({
      id: r.id,
      name: r.name,
      organizations: r.orgName ? { name: r.orgName } : null,
      department: r.department,
      job_title: r.job_title,
      job_role: r.job_role,
      birth_date: r.birth_date,
      email: r.email,
      phone: r.phone,
      notes: r.notes
    }));

    return (
      <PageContainer
        pageTitle='인원 관리'
        pageDescription={`${cohort.name} · 총 ${mapped.length}명`}
        pageHeaderAction={
          <StudentSheet
            cohortId={cohortId}
            trigger={<Button>+ 인원 추가</Button>}
          />
        }
      >
        <StudentTable cohortId={cohortId} students={mapped} />
      </PageContainer>
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : '알 수 없는 오류';
    return (
      <PageContainer pageTitle='인원 관리'>
        <div className='text-destructive'>불러오기 실패: {message}</div>
      </PageContainer>
    );
  }
}

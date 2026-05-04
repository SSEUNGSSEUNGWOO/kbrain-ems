import PageContainer from '@/components/layout/page-container';
import { db } from '@/lib/db';
import { cohorts, assignments, assignmentSubmissions, students } from '@/lib/db/schema';
import { eq, count, desc, inArray } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { AssignmentList } from './_components/assignment-list';
import { CreateAssignmentSheet } from './_components/create-assignment-sheet';

export default async function AssignmentsPage({
  params
}: {
  params: Promise<{ cohortId: string }>;
}) {
  const { cohortId } = await params;

  const [cohortRows, assignmentRows, studentCountRows] = await Promise.all([
    db
      .select({ id: cohorts.id, name: cohorts.name })
      .from(cohorts)
      .where(eq(cohorts.id, cohortId))
      .limit(1),
    db
      .select({
        id: assignments.id,
        title: assignments.title,
        description: assignments.description,
        due_date: assignments.dueDate,
        created_at: assignments.createdAt
      })
      .from(assignments)
      .where(eq(assignments.cohortId, cohortId))
      .orderBy(desc(assignments.createdAt)),
    db
      .select({ count: count() })
      .from(students)
      .where(eq(students.cohortId, cohortId))
  ]);

  const cohort = cohortRows[0];
  if (!cohort) notFound();

  const studentCount = studentCountRows[0]?.count ?? 0;

  // Fetch submissions for all assignments
  const assignmentIds = assignmentRows.map((a) => a.id);
  let submissionRows: { assignmentId: string; status: string }[] = [];
  if (assignmentIds.length > 0) {
    submissionRows = await db
      .select({
        assignmentId: assignmentSubmissions.assignmentId,
        status: assignmentSubmissions.status
      })
      .from(assignmentSubmissions)
      .where(
        assignmentIds.length === 1
          ? eq(assignmentSubmissions.assignmentId, assignmentIds[0])
          : inArray(assignmentSubmissions.assignmentId, assignmentIds)
      );
  }

  // Group submissions by assignment
  const submissionsByAssignment = new Map<string, { status: string }[]>();
  for (const s of submissionRows) {
    if (!submissionsByAssignment.has(s.assignmentId)) {
      submissionsByAssignment.set(s.assignmentId, []);
    }
    submissionsByAssignment.get(s.assignmentId)!.push({ status: s.status });
  }

  const mappedAssignments = assignmentRows.map((a) => ({
    id: a.id,
    title: a.title,
    description: a.description,
    due_date: a.due_date,
    assignment_submissions: submissionsByAssignment.get(a.id) ?? []
  }));

  return (
    <PageContainer
      pageTitle='과제'
      pageDescription={`${cohort.name} 과제 출제, 제출 관리 및 채점`}
      pageHeaderAction={<CreateAssignmentSheet cohortId={cohortId} />}
    >
      <AssignmentList
        cohortId={cohortId}
        assignments={mappedAssignments}
        studentCount={studentCount}
      />
    </PageContainer>
  );
}

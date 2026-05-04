import { notFound } from 'next/navigation';
import PageContainer from '@/components/layout/page-container';
import { db } from '@/lib/db';
import { assignments, cohorts, students, organizations, assignmentSubmissions } from '@/lib/db/schema';
import { eq, asc, and } from 'drizzle-orm';
import { AssignmentSubmissionTable } from './_components/assignment-submission-table';

type SubmissionRecord = {
  status: string;
  submitted_at: string | null;
  score: number | null;
  note: string | null;
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  file_type: string | null;
};

export default async function AssignmentDetailPage({
  params
}: {
  params: Promise<{ cohortId: string; assignmentId: string }>;
}) {
  const { cohortId, assignmentId } = await params;

  const [assignmentRows, studentRows, submissionRows] = await Promise.all([
    db
      .select({
        id: assignments.id,
        title: assignments.title,
        description: assignments.description,
        due_date: assignments.dueDate,
        cohortName: cohorts.name
      })
      .from(assignments)
      .leftJoin(cohorts, eq(assignments.cohortId, cohorts.id))
      .where(and(eq(assignments.id, assignmentId), eq(assignments.cohortId, cohortId)))
      .limit(1),
    db
      .select({
        id: students.id,
        name: students.name,
        orgName: organizations.name
      })
      .from(students)
      .leftJoin(organizations, eq(students.organizationId, organizations.id))
      .where(eq(students.cohortId, cohortId))
      .orderBy(asc(students.name)),
    db
      .select({
        student_id: assignmentSubmissions.studentId,
        status: assignmentSubmissions.status,
        submitted_at: assignmentSubmissions.submittedAt,
        score: assignmentSubmissions.score,
        note: assignmentSubmissions.note,
        file_path: assignmentSubmissions.filePath,
        file_name: assignmentSubmissions.fileName,
        file_size: assignmentSubmissions.fileSize,
        file_type: assignmentSubmissions.fileType
      })
      .from(assignmentSubmissions)
      .where(eq(assignmentSubmissions.assignmentId, assignmentId))
  ]);

  const assignment = assignmentRows[0];
  if (!assignment) notFound();

  // Map students to expected shape
  const mappedStudents = studentRows.map((s) => ({
    id: s.id,
    name: s.name,
    organizations: s.orgName ? { name: s.orgName } : null
  }));

  const recordMap = Object.fromEntries(
    submissionRows.map((r) => [
      r.student_id,
      {
        status: r.status,
        submitted_at: r.submitted_at,
        score: r.score ? Number(r.score) : null,
        note: r.note,
        file_path: r.file_path,
        file_name: r.file_name,
        file_size: r.file_size,
        file_type: r.file_type
      } satisfies SubmissionRecord
    ])
  );

  const description = [
    assignment.cohortName,
    assignment.due_date ? `제출 기한 ${assignment.due_date}` : null,
    assignment.description
  ].filter(Boolean).join(' · ');

  return (
    <PageContainer
      pageTitle={assignment.title}
      pageDescription={description || '과제 제출 현황'}
    >
      <AssignmentSubmissionTable
        assignmentId={assignmentId}
        cohortId={cohortId}
        students={mappedStudents}
        recordMap={recordMap}
      />
    </PageContainer>
  );
}

'use server';

import { db } from '@/lib/db';
import { assignmentSubmissions } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

const VALID_STATUSES = new Set(['not_submitted', 'submitted', 'late']);

type AssignmentSubmission = {
  student_id: string;
  status: string;
  submitted_at: string | null;
  score: number | null;
  note: string | null;
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  file_type: string | null;
};

type ActionResult = { error?: string };

export async function saveAssignmentSubmissions(
  assignmentId: string,
  cohortId: string,
  records: AssignmentSubmission[]
): Promise<ActionResult> {
  const invalid = records.find((r) => !VALID_STATUSES.has(r.status));
  if (invalid) return { error: '지원하지 않는 제출 상태가 포함되어 있습니다.' };

  const rows = records.map((r) => ({
    assignmentId,
    studentId: r.student_id,
    status: r.status,
    submittedAt: r.status === 'not_submitted' ? null : r.submitted_at,
    score: r.status === 'not_submitted' ? null : r.score?.toString() ?? null,
    note: r.note,
    filePath: r.file_path,
    fileName: r.file_name,
    fileSize: r.file_size,
    fileType: r.file_type
  }));

  try {
    await db
      .insert(assignmentSubmissions)
      .values(rows)
      .onConflictDoUpdate({
        target: [assignmentSubmissions.assignmentId, assignmentSubmissions.studentId],
        set: {
          status: sql`excluded.status`,
          submittedAt: sql`excluded.submitted_at`,
          score: sql`excluded.score`,
          note: sql`excluded.note`,
          filePath: sql`excluded.file_path`,
          fileName: sql`excluded.file_name`,
          fileSize: sql`excluded.file_size`,
          fileType: sql`excluded.file_type`,
          updatedAt: sql`now()`
        }
      });
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.' };
  }

  revalidatePath(`/dashboard/cohorts/${cohortId}/assignments`);
  revalidatePath(`/dashboard/cohorts/${cohortId}/assignments/${assignmentId}`);
  return {};
}

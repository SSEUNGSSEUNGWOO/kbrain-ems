'use server';

import { createAdminClient } from '@/lib/supabase/server';
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
    assignment_id: assignmentId,
    student_id: r.student_id,
    status: r.status,
    submitted_at: r.status === 'not_submitted' ? null : r.submitted_at,
    score: r.status === 'not_submitted' ? null : r.score?.toString() ?? null,
    note: r.note,
    file_path: r.file_path,
    file_name: r.file_name,
    file_size: r.file_size,
    file_type: r.file_type
  }));

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('assignment_submissions')
    .upsert(rows, { onConflict: 'assignment_id,student_id' });
  if (error) return { error: error.message };

  revalidatePath(`/dashboard/cohorts/${cohortId}/assignments`);
  revalidatePath(`/dashboard/cohorts/${cohortId}/assignments/${assignmentId}`);
  return {};
}

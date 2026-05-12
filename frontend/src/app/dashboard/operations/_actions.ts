'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

type Result = { error?: string };

/** 한 session의 강사·보조강사·운영자 매핑을 통째로 교체. */
export async function setSessionMembers(
  sessionId: string,
  mainInstructorIds: string[],
  subInstructorIds: string[],
  operatorIds: string[]
): Promise<Result> {
  const supabase = createAdminClient();

  // 1) session_instructors 전체 삭제 → 새로 insert
  const { error: dInstErr } = await supabase
    .from('session_instructors')
    .delete()
    .eq('session_id', sessionId);
  if (dInstErr) return { error: dInstErr.message };

  const uniqMain = Array.from(new Set(mainInstructorIds.filter(Boolean)));
  const uniqSub = Array.from(new Set(subInstructorIds.filter(Boolean).filter((id) => !uniqMain.includes(id))));
  const instRows = [
    ...uniqMain.map((id) => ({ session_id: sessionId, instructor_id: id, role: 'main' })),
    ...uniqSub.map((id) => ({ session_id: sessionId, instructor_id: id, role: 'sub' }))
  ];
  if (instRows.length > 0) {
    const { error: iErr } = await supabase.from('session_instructors').insert(instRows);
    if (iErr) return { error: iErr.message };
  }

  // 2) session_operators 전체 삭제 → 새로 insert
  const { error: dOpErr } = await supabase
    .from('session_operators')
    .delete()
    .eq('session_id', sessionId);
  if (dOpErr) return { error: dOpErr.message };

  const uniqOps = Array.from(new Set(operatorIds.filter(Boolean)));
  if (uniqOps.length > 0) {
    const { error: iOpErr } = await supabase.from('session_operators').insert(
      uniqOps.map((id) => ({ session_id: sessionId, operator_id: id }))
    );
    if (iOpErr) return { error: iOpErr.message };
  }

  revalidatePath('/dashboard/operations');
  return {};
}

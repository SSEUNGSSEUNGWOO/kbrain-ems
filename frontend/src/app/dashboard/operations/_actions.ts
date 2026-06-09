'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

type Result = { error?: string };

/** 한 session의 강사·보조강사·운영자 매핑을 통째로 교체.
 *  diff 방식: 기존과 비교해 빠지는 것만 delete, 새로 들어가는 것만 insert.
 *  delete+insert 전체교체 방식은 insert 실패시 모든 배정을 잃어버려 위험. */
export async function setSessionMembers(
  sessionId: string,
  mainInstructorIds: string[],
  subInstructorIds: string[],
  operatorIds: string[]
): Promise<Result> {
  const supabase = createAdminClient();

  const uniqMain = Array.from(new Set(mainInstructorIds.filter(Boolean)));
  const uniqSub = Array.from(
    new Set(subInstructorIds.filter(Boolean).filter((id) => !uniqMain.includes(id)))
  );
  const uniqOps = Array.from(new Set(operatorIds.filter(Boolean)));

  // 1) session_instructors diff
  const { data: existingInst, error: qInstErr } = await supabase
    .from('session_instructors')
    .select('id, instructor_id, role')
    .eq('session_id', sessionId);
  if (qInstErr) return { error: qInstErr.message };

  const desiredInstKeys = new Set([
    ...uniqMain.map((id) => `${id}|main`),
    ...uniqSub.map((id) => `${id}|sub`)
  ]);
  const existingInstKeys = new Set(
    (existingInst ?? []).map((r) => `${r.instructor_id}|${r.role}`)
  );

  const instIdsToDelete = (existingInst ?? [])
    .filter((r) => !desiredInstKeys.has(`${r.instructor_id}|${r.role}`))
    .map((r) => r.id);
  const instRowsToInsert = [...desiredInstKeys]
    .filter((k) => !existingInstKeys.has(k))
    .map((k) => {
      const [instructor_id, role] = k.split('|');
      return { session_id: sessionId, instructor_id, role };
    });

  if (instRowsToInsert.length > 0) {
    const { error } = await supabase.from('session_instructors').insert(instRowsToInsert);
    if (error) return { error: error.message };
  }
  if (instIdsToDelete.length > 0) {
    const { error } = await supabase.from('session_instructors').delete().in('id', instIdsToDelete);
    if (error) return { error: error.message };
  }

  // 2) session_operators diff
  const { data: existingOps, error: qOpErr } = await supabase
    .from('session_operators')
    .select('id, operator_id')
    .eq('session_id', sessionId);
  if (qOpErr) return { error: qOpErr.message };

  const desiredOpIds = new Set(uniqOps);
  const existingOpIds = new Set((existingOps ?? []).map((r) => r.operator_id));

  const opIdsToDelete = (existingOps ?? [])
    .filter((r) => !desiredOpIds.has(r.operator_id))
    .map((r) => r.id);
  const opRowsToInsert = [...desiredOpIds]
    .filter((id) => !existingOpIds.has(id))
    .map((operator_id) => ({ session_id: sessionId, operator_id }));

  if (opRowsToInsert.length > 0) {
    const { error } = await supabase.from('session_operators').insert(opRowsToInsert);
    if (error) return { error: error.message };
  }
  if (opIdsToDelete.length > 0) {
    const { error } = await supabase.from('session_operators').delete().in('id', opIdsToDelete);
    if (error) return { error: error.message };
  }

  revalidatePath('/dashboard/operations');
  return {};
}

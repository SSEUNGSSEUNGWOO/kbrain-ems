'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

/**
 * 회차(session) × 보조강사(instructor) 배정 토글.
 * on=true → INSERT (이미 있으면 무시), on=false → DELETE.
 * role='sub' 고정. main 배정은 다른 화면에서 관리.
 */
export async function toggleAssistantAssignment(
  sessionId: string,
  assistantId: string,
  on: boolean
): Promise<{ error?: string }> {
  const supabase = createAdminClient();
  if (on) {
    const { error } = await supabase
      .from('session_instructors')
      .insert({ session_id: sessionId, instructor_id: assistantId, role: 'sub' });
    // unique constraint (session_id, instructor_id, role) 중복은 무시
    if (error && error.code !== '23505') return { error: error.message };
  } else {
    const { error } = await supabase
      .from('session_instructors')
      .delete()
      .eq('session_id', sessionId)
      .eq('instructor_id', assistantId)
      .eq('role', 'sub');
    if (error) return { error: error.message };
  }
  revalidatePath('/dashboard/assistants');
  return {};
}

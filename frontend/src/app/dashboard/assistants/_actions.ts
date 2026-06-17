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
    // 같은 날 다른 회차에 이미 sub 로 배정돼 있으면 거부 (충돌 방지)
    const { data: target } = await supabase
      .from('sessions')
      .select('session_date')
      .eq('id', sessionId)
      .maybeSingle<{ session_date: string }>();
    if (target) {
      const { data: sameDay } = await supabase
        .from('sessions')
        .select('id, title, cohorts(name)')
        .eq('session_date', target.session_date)
        .neq('id', sessionId);
      const sameDayIds = (sameDay ?? []).map((s: any) => s.id);
      if (sameDayIds.length > 0) {
        const { data: conflicts } = await supabase
          .from('session_instructors')
          .select('session_id, sessions(title, cohorts(name))')
          .eq('instructor_id', assistantId)
          .eq('role', 'sub')
          .in('session_id', sameDayIds);
        if (conflicts && conflicts.length > 0) {
          const c = conflicts[0] as any;
          const label = c.sessions?.cohorts?.name ?? c.sessions?.title ?? '다른 회차';
          return { error: `같은 날 ${label} 에 이미 배정돼 있습니다.` };
        }
      }
    }
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

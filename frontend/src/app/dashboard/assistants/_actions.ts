'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

/**
 * sessions × instructor (role='sub') 배정 토글.
 * 같은 날 다른 회차에 sub 로 이미 들어 있으면 거부.
 */
export async function toggleAssistantAssignment(
  sessionId: string,
  assistantId: string,
  on: boolean
): Promise<{ error?: string }> {
  const supabase = createAdminClient();
  if (on) {
    const { data: target } = await supabase
      .from('sessions')
      .select('session_date')
      .eq('id', sessionId)
      .maybeSingle<{ session_date: string }>();
    if (target) {
      const conflict = await sameDaySubConflict(target.session_date, assistantId, sessionId, null, null);
      if (conflict) return { error: conflict };
    }
    const { error } = await supabase
      .from('session_instructors')
      .insert({ session_id: sessionId, instructor_id: assistantId, role: 'sub' });
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

/**
 * 외부 일정 × instructor 배정 토글.
 */
export async function toggleExternalAssistant(
  eventId: string,
  assistantId: string,
  on: boolean
): Promise<{ error?: string }> {
  const supabase = createAdminClient();
  if (on) {
    const { data: target } = await supabase
      .from('assistant_external_events')
      .select('on_date')
      .eq('id', eventId)
      .maybeSingle<{ on_date: string }>();
    if (target) {
      const conflict = await sameDaySubConflict(target.on_date, assistantId, null, eventId, null);
      if (conflict) return { error: conflict };
    }
    const { error } = await supabase
      .from('assistant_external_assignments')
      .insert({ event_id: eventId, instructor_id: assistantId });
    if (error && error.code !== '23505') return { error: error.message };
  } else {
    const { error } = await supabase
      .from('assistant_external_assignments')
      .delete()
      .eq('event_id', eventId)
      .eq('instructor_id', assistantId);
    if (error) return { error: error.message };
  }
  revalidatePath('/dashboard/assistants');
  return {};
}

/**
 * 셀프스터디 (cohort × on_date) × instructor 배정 토글.
 */
export async function toggleSelfStudyAssistant(
  cohortId: string,
  onDate: string,
  assistantId: string,
  on: boolean
): Promise<{ error?: string }> {
  const supabase = createAdminClient();
  if (on) {
    const conflict = await sameDaySubConflict(onDate, assistantId, null, null, { cohortId, onDate });
    if (conflict) return { error: conflict };
    const { error } = await supabase
      .from('cohort_self_study_assignments')
      .insert({ cohort_id: cohortId, on_date: onDate, instructor_id: assistantId });
    if (error && error.code !== '23505') return { error: error.message };
  } else {
    const { error } = await supabase
      .from('cohort_self_study_assignments')
      .delete()
      .eq('cohort_id', cohortId)
      .eq('on_date', onDate)
      .eq('instructor_id', assistantId);
    if (error) return { error: error.message };
  }
  revalidatePath('/dashboard/assistants');
  return {};
}

/**
 * 회차의 '보조강사 배정 대상 아님' 플래그 토글.
 */
export async function toggleSessionNotRequired(
  sessionId: string,
  next: boolean
): Promise<{ error?: string }> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('sessions')
    .update({ assistant_not_required: next })
    .eq('id', sessionId);
  if (error) return { error: error.message };
  revalidatePath('/dashboard/assistants');
  return {};
}

/**
 * 외부 일정 추가 — 시작~종료일 매일 1 row INSERT (정책 일관).
 */
export async function createExternalEvent(input: {
  title: string;
  organization?: string;
  startDate: string;
  endDate: string;
  requiredCount: number;
}): Promise<{ error?: string }> {
  const { title, organization, startDate, endDate, requiredCount } = input;
  if (!title.trim()) return { error: '제목을 입력해주세요.' };
  if (!startDate || !endDate) return { error: '날짜를 선택해주세요.' };
  if (startDate > endDate) return { error: '종료일이 시작일보다 빠릅니다.' };

  const supabase = createAdminClient();
  const days: string[] = [];
  const cur = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    days.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  const rows = days.map((d) => ({
    on_date: d,
    title: title.trim(),
    organization: organization?.trim() || null,
    required_count: Math.max(1, requiredCount)
  }));
  const { error } = await supabase.from('assistant_external_events').insert(rows);
  if (error) return { error: error.message };
  revalidatePath('/dashboard/assistants');
  return {};
}

/**
 * 외부 일정 삭제 (전 기간이 아니라 단일 날짜 row 1개).
 */
export async function deleteExternalEvent(eventId: string): Promise<{ error?: string }> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('assistant_external_events')
    .delete()
    .eq('id', eventId);
  if (error) return { error: error.message };
  revalidatePath('/dashboard/assistants');
  return {};
}

/**
 * 날짜 × 보조강사 가용 마크 토글. 그 날 가능한 보조강사를 운영자가 미리 표시.
 * 모든 회차/외부일정/셀프스터디에 동일 적용.
 */
export async function toggleDailyAvailability(
  onDate: string,
  assistantId: string,
  on: boolean
): Promise<{ error?: string }> {
  const supabase = createAdminClient();
  if (on) {
    const { error } = await supabase
      .from('assistant_daily_availability')
      .insert({ on_date: onDate, instructor_id: assistantId });
    if (error && error.code !== '23505') return { error: error.message };
  } else {
    const { error } = await supabase
      .from('assistant_daily_availability')
      .delete()
      .eq('on_date', onDate)
      .eq('instructor_id', assistantId);
    if (error) return { error: error.message };
  }
  revalidatePath('/dashboard/assistants');
  return {};
}

/**
 * 같은 날 sub 충돌 체크 — sessions, external, selfstudy 세 가지 소스 통합.
 * self 매개변수 중 하나만 채워서 호출 — 자기 자신 제외용.
 */
async function sameDaySubConflict(
  date: string,
  assistantId: string,
  selfSessionId: string | null,
  selfEventId: string | null,
  selfSelfStudy: { cohortId: string; onDate: string } | null
): Promise<string | null> {
  const supabase = createAdminClient();

  // 1) sessions
  const { data: sameDaySessions } = await supabase
    .from('sessions')
    .select('id, title, cohorts(name)')
    .eq('session_date', date);
  const sessionIds = (sameDaySessions ?? [])
    .filter((s: any) => s.id !== selfSessionId)
    .map((s: any) => s.id);
  if (sessionIds.length > 0) {
    const { data: c1 } = await supabase
      .from('session_instructors')
      .select('session_id')
      .eq('instructor_id', assistantId)
      .eq('role', 'sub')
      .in('session_id', sessionIds)
      .limit(1);
    if (c1 && c1.length > 0) {
      const hit = (sameDaySessions ?? []).find((s: any) => s.id === c1[0].session_id) as any;
      return `같은 날 ${hit?.cohorts?.name ?? '다른 회차'} 에 이미 배정돼 있습니다.`;
    }
  }

  // 2) 외부 일정
  const { data: sameDayEvents } = await supabase
    .from('assistant_external_events')
    .select('id, title, organization')
    .eq('on_date', date);
  const eventIds = (sameDayEvents ?? [])
    .filter((e: any) => e.id !== selfEventId)
    .map((e: any) => e.id);
  if (eventIds.length > 0) {
    const { data: c2 } = await supabase
      .from('assistant_external_assignments')
      .select('event_id')
      .eq('instructor_id', assistantId)
      .in('event_id', eventIds)
      .limit(1);
    if (c2 && c2.length > 0) {
      const hit = (sameDayEvents ?? []).find((e: any) => e.id === c2[0].event_id) as any;
      return `같은 날 외부 일정 '${hit?.organization ?? hit?.title}' 에 이미 배정돼 있습니다.`;
    }
  }

  // 3) 셀프스터디
  const { data: c3 } = await supabase
    .from('cohort_self_study_assignments')
    .select('cohort_id, cohorts(name)')
    .eq('instructor_id', assistantId)
    .eq('on_date', date);
  const c3Filtered = (c3 ?? []).filter((x: any) => {
    if (!selfSelfStudy) return true;
    return !(x.cohort_id === selfSelfStudy.cohortId && date === selfSelfStudy.onDate);
  });
  if (c3Filtered.length > 0) {
    const hit = c3Filtered[0] as any;
    return `같은 날 ${hit.cohorts?.name ?? '다른 cohort'} 셀프스터디에 이미 배정돼 있습니다.`;
  }

  return null;
}

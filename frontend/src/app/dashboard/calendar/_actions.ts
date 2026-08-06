'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/activity-log';
import { revalidatePath } from 'next/cache';

export type CalendarEventInput = {
  title: string;
  event_date: string;
  event_time: string | null;
  category: string | null;
  capacity: number | null;
  notes: string | null;
};

type Result = { error?: string };

function parse(formData: FormData): CalendarEventInput | string {
  const title = String(formData.get('title') ?? '').trim();
  const date = String(formData.get('event_date') ?? '').trim();
  if (!title) return '일정명을 입력해주세요.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '날짜를 선택해주세요.';

  const time = String(formData.get('event_time') ?? '').trim();
  const capacityRaw = String(formData.get('capacity') ?? '').trim();
  const capacity = capacityRaw ? Number.parseInt(capacityRaw, 10) : null;
  if (capacityRaw && (Number.isNaN(capacity) || capacity! < 0))
    return '정원은 0 이상의 숫자여야 합니다.';

  return {
    title,
    event_date: date,
    event_time: time || null,
    category: String(formData.get('category') ?? '').trim() || null,
    capacity,
    notes: String(formData.get('notes') ?? '').trim() || null
  };
}

export async function createCalendarEvent(formData: FormData): Promise<Result> {
  const parsed = parse(formData);
  if (typeof parsed === 'string') return { error: parsed };

  const supabase = createAdminClient();
  const { error } = await supabase.from('calendar_events').insert(parsed);
  if (error) return { error: error.message };

  await logActivity({
    actionType: 'create',
    resourceType: 'cohort',
    summary: `캘린더 일정 추가 — ${parsed.event_date} ${parsed.title}`
  });
  revalidatePath('/dashboard/calendar');
  return {};
}

export async function updateCalendarEvent(id: string, formData: FormData): Promise<Result> {
  const parsed = parse(formData);
  if (typeof parsed === 'string') return { error: parsed };

  const supabase = createAdminClient();
  const { error } = await supabase.from('calendar_events').update(parsed).eq('id', id);
  if (error) return { error: error.message };

  await logActivity({
    actionType: 'update',
    resourceType: 'cohort',
    resourceId: id,
    summary: `캘린더 일정 수정 — ${parsed.event_date} ${parsed.title}`
  });
  revalidatePath('/dashboard/calendar');
  return {};
}

export async function deleteCalendarEvent(id: string): Promise<Result> {
  const supabase = createAdminClient();
  const { data: before } = await supabase
    .from('calendar_events')
    .select('title, event_date')
    .eq('id', id)
    .maybeSingle();

  const { error } = await supabase.from('calendar_events').delete().eq('id', id);
  if (error) return { error: error.message };

  await logActivity({
    actionType: 'delete',
    resourceType: 'cohort',
    resourceId: id,
    summary: `캘린더 일정 삭제 — ${before?.event_date ?? ''} ${before?.title ?? ''}`
  });
  revalidatePath('/dashboard/calendar');
  return {};
}

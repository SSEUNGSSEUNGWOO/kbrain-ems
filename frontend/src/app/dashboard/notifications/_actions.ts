'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { getOperator } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { STAGE_CATALOG, type DispatchTemplate } from '@/lib/dispatch-stages';
import { renderDispatchTemplate } from '@/lib/dispatch-templates';

export type DispatchChannel = 'email' | 'sms';

export type DispatchRecipient = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
};

export type DispatchMaterial = {
  cohortName: string;
  startedAt: string;
  recipients: DispatchRecipient[];
  subject: string;
  body: string;
};

export async function fetchDispatchMaterial(
  cohortId: string,
  template: DispatchTemplate
): Promise<{ ok: true; data: DispatchMaterial } | { ok: false; error: string }> {
  const supabase = createAdminClient();
  const stageDef = STAGE_CATALOG.find((s) => s.code === template);
  if (!stageDef) return { ok: false, error: '알 수 없는 단계입니다.' };

  const { data: cohort, error: cErr } = await supabase
    .from('cohorts')
    .select('id, name, started_at, ended_at, decided_at')
    .eq('id', cohortId)
    .maybeSingle();
  if (cErr) return { ok: false, error: cErr.message };
  if (!cohort) return { ok: false, error: '기수를 찾을 수 없습니다.' };

  // 첫 회차 정보 (장소·시작 시각)
  const { data: firstSession } = await supabase
    .from('sessions')
    .select('start_time, location_id, locations(name)')
    .eq('cohort_id', cohortId)
    .order('session_date', { ascending: true })
    .limit(1)
    .maybeSingle();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const locationName: string | null = (firstSession as any)?.locations?.name ?? null;
  const startTime = firstSession?.start_time ?? null;

  // 대상자 fetch — 단계의 recipient_filter에 따라 분기
  let recipients: DispatchRecipient[] = [];
  if (stageDef.recipientFilter === 'all_students') {
    const { data: students } = await supabase
      .from('students')
      .select('id, name, email, phone')
      .eq('cohort_id', cohortId)
      .order('name', { ascending: true });
    recipients = (students ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      email: s.email,
      phone: s.phone
    }));
  } else {
    const query = supabase
      .from('applications')
      .select('applicant_id, applicants(id, name, email, phone)')
      .eq('cohort_id', cohortId);
    const filtered =
      stageDef.recipientFilter === 'selected_applicants'
        ? query.eq('status', 'selected')
        : query.neq('status', 'selected');
    const { data: apps } = await filtered;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recipients = ((apps ?? []) as any[])
      .filter((a) => a.applicants)
      .map((a) => ({
        id: a.applicants.id,
        name: a.applicants.name,
        email: a.applicants.email,
        phone: a.applicants.phone
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }

  const rendered = renderDispatchTemplate(template, {
    cohortName: cohort.name,
    startedAt: cohort.started_at,
    endedAt: cohort.ended_at,
    decidedAt: cohort.decided_at,
    location: locationName,
    startTime
  });

  return {
    ok: true,
    data: {
      cohortName: cohort.name,
      startedAt: cohort.started_at ?? '',
      recipients,
      subject: rendered.subject,
      body: rendered.body
    }
  };
}

export type MarkStageSentInput = {
  cohortId: string;
  template: DispatchTemplate;
  channels: DispatchChannel[];
  note?: string;
};

export async function markStageSent(input: MarkStageSentInput) {
  if (input.channels.length === 0) {
    return { ok: false as const, error: '발송 채널을 1개 이상 선택해 주세요.' };
  }

  const op = await getOperator();
  if (!op) return { ok: false as const, error: '로그인 정보가 없습니다.' };

  const supabase = createAdminClient();
  const { error } = await supabase.from('notifications').insert({
    cohort_id: input.cohortId,
    recipient_type: 'cohort',
    recipient_id: input.cohortId,
    channel: input.channels[0],
    channels: input.channels,
    template_code: input.template,
    status: 'sent',
    sent_at: new Date().toISOString(),
    sent_by_operator_id: op.id,
    body: input.note ?? null
  });

  if (error) return { ok: false as const, error: error.message };

  revalidatePath('/dashboard/notifications');
  revalidatePath(`/dashboard/cohorts/${input.cohortId}/notifications`);
  return { ok: true as const };
}

export async function toggleStageEnabled(
  cohortId: string,
  template: DispatchTemplate,
  enabled: boolean
) {
  const op = await getOperator();
  if (!op) return { ok: false as const, error: '로그인 정보가 없습니다.' };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('cohort_dispatch_config')
    .upsert(
      { cohort_id: cohortId, template_code: template, enabled },
      { onConflict: 'cohort_id,template_code' }
    );
  if (error) return { ok: false as const, error: error.message };

  revalidatePath('/dashboard/notifications');
  revalidatePath(`/dashboard/cohorts/${cohortId}/notifications`);
  return { ok: true as const };
}

export async function unmarkStageSent(notificationId: string, cohortId: string) {
  const op = await getOperator();
  if (!op) return { ok: false as const, error: '로그인 정보가 없습니다.' };

  const supabase = createAdminClient();
  const { error } = await supabase.from('notifications').delete().eq('id', notificationId);
  if (error) return { ok: false as const, error: error.message };

  revalidatePath('/dashboard/notifications');
  revalidatePath(`/dashboard/cohorts/${cohortId}/notifications`);
  return { ok: true as const };
}

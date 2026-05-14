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

async function resolveRecipients(
  supabase: ReturnType<typeof createAdminClient>,
  cohortId: string,
  filter: 'all_students' | 'selected_applicants' | 'rejected_applicants'
): Promise<DispatchRecipient[]> {
  if (filter === 'all_students') {
    const { data: students } = await supabase
      .from('students')
      .select('id, name, email, phone')
      .eq('cohort_id', cohortId)
      .order('name', { ascending: true });
    return (students ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      email: s.email,
      phone: s.phone
    }));
  }
  const query = supabase
    .from('applications')
    .select('applicant_id, applicants(id, name, email, phone)')
    .eq('cohort_id', cohortId);
  const filtered =
    filter === 'selected_applicants'
      ? query.eq('status', 'selected')
      : query.neq('status', 'selected');
  type AppJoin = {
    applicant_id: string;
    applicants: { id: string; name: string; email: string | null; phone: string | null } | null;
  };
  const { data: apps } = await filtered.returns<AppJoin[]>();
  return (apps ?? [])
    .filter((a): a is AppJoin & { applicants: NonNullable<AppJoin['applicants']> } => !!a.applicants)
    .map((a) => ({
      id: a.applicants.id,
      name: a.applicants.name,
      email: a.applicants.email,
      phone: a.applicants.phone
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

export async function fetchDispatchMaterialBundle(
  cohortId: string,
  templates: DispatchTemplate[]
): Promise<{ ok: true; data: DispatchMaterial } | { ok: false; error: string }> {
  if (templates.length === 0) return { ok: false, error: '템플릿이 비어 있습니다.' };
  const supabase = createAdminClient();
  const stageDefs = templates.map((t) => STAGE_CATALOG.find((s) => s.code === t)).filter(
    (s): s is NonNullable<typeof s> => !!s
  );
  if (stageDefs.length === 0) return { ok: false, error: '알 수 없는 단계입니다.' };

  const { data: cohort, error: cErr } = await supabase
    .from('cohorts')
    .select('id, name, started_at, ended_at, decided_at')
    .eq('id', cohortId)
    .maybeSingle();
  if (cErr) return { ok: false, error: cErr.message };
  if (!cohort) return { ok: false, error: '기수를 찾을 수 없습니다.' };

  type FirstSession = {
    start_time: string | null;
    location_id: string | null;
    locations: { name: string } | null;
  };
  const { data: firstSession } = await supabase
    .from('sessions')
    .select('start_time, location_id, locations(name)')
    .eq('cohort_id', cohortId)
    .order('session_date', { ascending: true })
    .limit(1)
    .returns<FirstSession[]>()
    .maybeSingle();

  const locationName: string | null = firstSession?.locations?.name ?? null;
  const startTime = firstSession?.start_time ?? null;

  // 그룹 첫 단계의 recipientFilter 사용 (보통 합격자 발표가 가장 좁음)
  const recipients = await resolveRecipients(supabase, cohortId, stageDefs[0].recipientFilter);

  const rendered = stageDefs.map((d) =>
    renderDispatchTemplate(d.code, {
      cohortName: cohort.name,
      startedAt: cohort.started_at,
      endedAt: cohort.ended_at,
      decidedAt: cohort.decided_at,
      location: locationName,
      startTime
    })
  );

  const subject = rendered.map((r) => r.subject).join(' · ');
  const body =
    rendered.length === 1
      ? rendered[0].body
      : rendered
          .map((r, i) => `${i > 0 ? '\n\n────────────────────────\n\n' : ''}${r.body}`)
          .join('');

  return {
    ok: true,
    data: {
      cohortName: cohort.name,
      startedAt: cohort.started_at ?? '',
      recipients,
      subject,
      body
    }
  };
}

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
  type FirstSession = {
    start_time: string | null;
    location_id: string | null;
    locations: { name: string } | null;
  };
  const { data: firstSession } = await supabase
    .from('sessions')
    .select('start_time, location_id, locations(name)')
    .eq('cohort_id', cohortId)
    .order('session_date', { ascending: true })
    .limit(1)
    .returns<FirstSession[]>()
    .maybeSingle();

  const locationName: string | null = firstSession?.locations?.name ?? null;
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
  return markStagesSent({
    cohortId: input.cohortId,
    templates: [input.template],
    channels: input.channels,
    note: input.note
  });
}

export async function markStagesSent(input: {
  cohortId: string;
  templates: DispatchTemplate[];
  channels: DispatchChannel[];
  note?: string;
}) {
  if (input.channels.length === 0) {
    return { ok: false as const, error: '발송 채널을 1개 이상 선택해 주세요.' };
  }
  if (input.templates.length === 0) {
    return { ok: false as const, error: '단계가 비어 있습니다.' };
  }

  const op = await getOperator();
  if (!op) return { ok: false as const, error: '로그인 정보가 없습니다.' };

  const supabase = createAdminClient();
  const sentAt = new Date().toISOString();
  const rows = input.templates.map((t) => ({
    cohort_id: input.cohortId,
    recipient_type: 'cohort',
    recipient_id: input.cohortId,
    channel: input.channels[0],
    channels: input.channels,
    template_code: t,
    status: 'sent',
    sent_at: sentAt,
    sent_by_operator_id: op.id,
    body: input.note ?? null
  }));
  const { error } = await supabase.from('notifications').insert(rows);

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
  return unmarkStagesSent([notificationId], cohortId);
}

export async function unmarkStagesSent(notificationIds: string[], cohortId: string) {
  if (notificationIds.length === 0) return { ok: true as const };
  const op = await getOperator();
  if (!op) return { ok: false as const, error: '로그인 정보가 없습니다.' };

  const supabase = createAdminClient();
  const { error } = await supabase.from('notifications').delete().in('id', notificationIds);
  if (error) return { ok: false as const, error: error.message };

  revalidatePath('/dashboard/notifications');
  revalidatePath(`/dashboard/cohorts/${cohortId}/notifications`);
  return { ok: true as const };
}

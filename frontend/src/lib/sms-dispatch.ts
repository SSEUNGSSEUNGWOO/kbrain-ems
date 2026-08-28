import 'server-only';

import { createAdminClient } from '@/lib/supabase/server';
import { STAGE_CATALOG, type DispatchTemplate } from '@/lib/dispatch-stages';
import { renderDispatchTemplate } from '@/lib/dispatch-templates';
import {
  reviewRecipients,
  type RecipientInput,
  type RecipientReview,
  type ValidRecipient
} from '@/lib/recipient-validation';
import { isDryRun, sendSmsBatch } from '@/lib/tason';

// 문자 자동 발송의 본체.
//
// 미리보기 화면과 Cron 이 같은 함수를 쓴다. 두 경로가 각자 대상자를 계산하면 화면에서 본
// 것과 실제로 나가는 것이 어긋난다 — 줌 링크 하나 틀리면 교육생 전원이 못 들어오는 판에
// 그 어긋남은 감당이 안 된다.
//
// 중복 발송 방지는 두 겹이다.
//   1) plan 단계에서 이미 완료된 사람을 제외한다 (정상 경로)
//   2) 그래도 뚫리면 notifications_student_stage_unique 인덱스가 DB 에서 막는다
// Cron 은 같은 실행을 두 번 부를 수 있고(Vercel 문서), 재시도 스케줄러로 바꾸면 일부러
// 다시 부른다. 애플리케이션 검사만으로는 동시 호출 사이의 틈을 못 막는다.

export type DispatchPlan = {
  cohortId: string;
  cohortName: string;
  template: DispatchTemplate;
  stageLabel: string;
  message: string;
  /** 전체 명단을 검증한 결과 (제외 사유 포함). 화면에 그대로 보여준다. */
  review: RecipientReview;
  /** 이미 발송 이력이 있어 이번에 건너뛸 사람. */
  alreadySent: ValidRecipient[];
  /** 이번에 실제로 보낼 사람. */
  pending: ValidRecipient[];
  /** pending 을 100건씩 자른 것. */
  batches: ValidRecipient[][];
  dryRun: boolean;
};

export type DispatchResult = {
  ok: boolean;
  dryRun: boolean;
  sent: number;
  skipped: number;
  failed: number;
  batchResults: { size: number; ok: boolean; error: string | null }[];
};

type PlanError = { ok: false; error: string };

/**
 * 발송 계획을 세운다. 아무것도 보내지 않고 DB 도 바꾸지 않는다 — 순수하게 읽기만 한다.
 * 화면 미리보기와 Cron 의 첫 단계가 모두 이 함수다.
 */
export async function buildDispatchPlan(
  cohortId: string,
  template: DispatchTemplate
): Promise<{ ok: true; plan: DispatchPlan } | PlanError> {
  const stageDef = STAGE_CATALOG.find((s) => s.code === template);
  if (!stageDef) return { ok: false, error: '알 수 없는 발송 단계입니다.' };

  const supabase = createAdminClient();

  const { data: cohort, error: cErr } = await supabase
    .from('cohorts')
    .select('id, name, started_at, ended_at, decided_at, zoom_meeting_id, zoom_password')
    .eq('id', cohortId)
    .maybeSingle();
  if (cErr) return { ok: false, error: cErr.message };
  if (!cohort) return { ok: false, error: '기수를 찾을 수 없습니다.' };

  // 장소·시작 시각은 첫 회차에서 가져온다. 기존 발송 자료 화면과 같은 규칙.
  type FirstSession = {
    start_time: string | null;
    locations: { name: string } | null;
  };
  const { data: firstSession } = await supabase
    .from('sessions')
    .select('start_time, locations(name)')
    .eq('cohort_id', cohortId)
    .order('session_date', { ascending: true })
    .limit(1)
    .returns<FirstSession[]>()
    .maybeSingle();

  const recipientsRaw = await fetchRecipients(cohortId, stageDef.recipientFilter);
  if (!recipientsRaw.ok) return recipientsRaw;

  const review = reviewRecipients(recipientsRaw.rows);

  // 온라인 과정이면 장소 자리에 Zoom 정보를 넣는다. 저장된 값을 쓰므로 회차마다 손으로
  // 넣다가 지난 회차 비밀번호가 그대로 복사되는 일이 없다.
  const zoomPlace =
    cohort.zoom_meeting_id !== null && cohort.zoom_meeting_id !== ''
      ? `Zoom 회의 ID : ${cohort.zoom_meeting_id}${cohort.zoom_password ? ` / PW : ${cohort.zoom_password}` : ''}`
      : null;

  const rendered = renderDispatchTemplate(template, {
    cohortName: cohort.name,
    startedAt: cohort.started_at,
    endedAt: cohort.ended_at,
    decidedAt: cohort.decided_at,
    location: zoomPlace ?? firstSession?.locations?.name ?? null,
    startTime: firstSession?.start_time ?? null
  });

  const sentIds = await fetchSentRecipientIds(cohortId, template);
  const alreadySent = review.valid.filter((r) => sentIds.has(r.id));
  const pending = review.valid.filter((r) => !sentIds.has(r.id));

  const batches: ValidRecipient[][] = [];
  for (let i = 0; i < pending.length; i += 100) batches.push(pending.slice(i, i + 100));

  return {
    ok: true,
    plan: {
      cohortId,
      cohortName: cohort.name,
      template,
      stageLabel: stageDef.label,
      message: rendered.body,
      review,
      alreadySent,
      pending,
      batches,
      dryRun: isDryRun()
    }
  };
}

/**
 * 계획대로 보낸다. 배치 하나가 실패해도 다음 배치를 계속 시도한다 — 137명 중 앞 100명이
 * 나갔는데 뒤에서 멈추면, 성공분을 이력에 남기지 않는 편이 더 위험하다.
 *
 * 배치가 성공한 순간 그 배치 인원을 이력에 기록한다. 실패한 배치는 기록하지 않으므로
 * 다음 호출에서 그 사람들만 다시 대상이 된다.
 */
export async function executeDispatch(plan: DispatchPlan): Promise<DispatchResult> {
  const supabase = createAdminClient();
  const batchResults: DispatchResult['batchResults'] = [];
  let sent = 0;
  let failed = 0;

  for (const batch of plan.batches) {
    const outcome = await sendSmsBatch(batch, plan.message);
    batchResults.push({ size: batch.length, ok: outcome.ok, error: outcome.error });

    if (!outcome.ok) {
      failed += batch.length;
      continue;
    }

    const rows = batch.map((r) => ({
      cohort_id: plan.cohortId,
      recipient_type: 'student',
      recipient_id: r.id,
      channel: 'sms',
      template_code: plan.template,
      status: outcome.dryRun ? 'dry_run' : 'sent',
      sent_at: new Date().toISOString(),
      external_message_id: outcome.messageId,
      body: plan.message
    }));

    // 부분 UNIQUE 인덱스(recipient_type='student' 한정)는 PostgREST 의 onConflict 대상으로
    // 지정할 수 없다. 정상 경로에서는 plan 이 이미 발송분을 걸러내므로 충돌이 나지 않고,
    // 충돌은 Cron 이 동시에 두 번 불린 경우뿐이다. 그때만 다시 조회해 빠진 행만 넣는다.
    let { error } = await supabase.from('notifications').insert(rows);

    if (error?.code === '23505') {
      const already = await fetchSentRecipientIds(plan.cohortId, plan.template);
      const remaining = rows.filter((r) => !already.has(r.recipient_id));
      error = remaining.length
        ? ((await supabase.from('notifications').insert(remaining)).error ?? null)
        : null;
    }

    if (error) {
      failed += batch.length;
      batchResults[batchResults.length - 1] = {
        size: batch.length,
        ok: false,
        error: `발송은 됐으나 이력 기록 실패: ${error.message}`
      };
      continue;
    }
    sent += batch.length;
  }

  return {
    ok: failed === 0,
    dryRun: plan.dryRun,
    sent,
    skipped: plan.alreadySent.length,
    failed,
    batchResults
  };
}

async function fetchRecipients(
  cohortId: string,
  filter: (typeof STAGE_CATALOG)[number]['recipientFilter']
): Promise<{ ok: true; rows: RecipientInput[] } | PlanError> {
  const supabase = createAdminClient();

  if (filter === 'all_students') {
    const { data, error } = await supabase
      .from('students')
      .select('id, name, phone')
      .eq('cohort_id', cohortId)
      .order('name', { ascending: true });
    if (error) return { ok: false, error: error.message };
    return { ok: true, rows: data ?? [] };
  }

  type AppRow = { applicants: { id: string; name: string; phone: string | null } | null };
  const query = supabase
    .from('applications')
    .select('applicants(id, name, phone)')
    .eq('cohort_id', cohortId);
  const { data, error } = await (
    filter === 'selected_applicants'
      ? query.eq('status', 'selected')
      : query.neq('status', 'selected')
  ).returns<AppRow[]>();
  if (error) return { ok: false, error: error.message };

  const rows = (data ?? [])
    .map((a) => a.applicants)
    .filter((a): a is NonNullable<typeof a> => a !== null)
    .toSorted((a, b) => a.name.localeCompare(b.name, 'ko'));
  return { ok: true, rows };
}

/** 이 기수·단계에서 이미 발송된 개인 수신자 id. 드라이런 기록도 완료로 친다. */
async function fetchSentRecipientIds(
  cohortId: string,
  template: DispatchTemplate
): Promise<Set<string>> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('notifications')
    .select('recipient_id')
    .eq('cohort_id', cohortId)
    .eq('recipient_type', 'student')
    .eq('template_code', template);
  return new Set((data ?? []).map((n) => n.recipient_id).filter((id): id is string => id !== null));
}

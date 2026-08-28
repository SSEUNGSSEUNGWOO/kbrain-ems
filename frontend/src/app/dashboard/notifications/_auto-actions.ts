'use server';

import { revalidatePath } from 'next/cache';

import { getOperator } from '@/lib/auth';
import type { DispatchTemplate } from '@/lib/dispatch-stages';
import { EXCLUSION_LABEL, type ExclusionReason } from '@/lib/recipient-validation';
import { buildDispatchPlan, executeDispatch } from '@/lib/sms-dispatch';

// 자동 문자 발송의 화면쪽 진입점.
//
// 기존 수동 발송(_actions.ts)은 그대로 둔다. 지금 운영에서 도는 흐름이라 병행 기간 동안
// 두 경로가 같이 살아 있어야 한다 (docs/02 "도입 순서" 2단계).

export type AutoDispatchPreview = {
  cohortName: string;
  stageLabel: string;
  message: string;
  dryRun: boolean;
  totalRecipients: number;
  pendingCount: number;
  alreadySentCount: number;
  batchSizes: number[];
  excluded: { name: string; phone: string | null; reason: string }[];
};

export async function previewAutoDispatch(
  cohortId: string,
  template: DispatchTemplate
): Promise<{ ok: true; data: AutoDispatchPreview } | { ok: false; error: string }> {
  const op = await getOperator();
  if (!op) return { ok: false, error: '로그인 정보가 없습니다.' };

  const planned = await buildDispatchPlan(cohortId, template);
  if (!planned.ok) return planned;
  const p = planned.plan;

  return {
    ok: true,
    data: {
      cohortName: p.cohortName,
      stageLabel: p.stageLabel,
      message: p.message,
      dryRun: p.dryRun,
      totalRecipients: p.review.valid.length + p.review.excluded.length,
      pendingCount: p.pending.length,
      alreadySentCount: p.alreadySent.length,
      batchSizes: p.batches.map((b) => b.length),
      excluded: p.review.excluded.map((e) => ({
        name: e.name,
        phone: e.phone,
        reason:
          EXCLUSION_LABEL[e.reason as ExclusionReason] +
          (e.duplicateOf ? ` (${e.duplicateOf}와 겹침)` : '')
      }))
    }
  };
}

export type AutoDispatchOutcome = {
  dryRun: boolean;
  sent: number;
  skipped: number;
  failed: number;
  errors: string[];
};

/**
 * 승인 버튼이 부르는 실제 발송. 미리보기와 같은 buildDispatchPlan 을 다시 태워서,
 * 미리보기를 띄운 뒤 명단이 바뀌었더라도 발송 시점 기준으로 다시 계산되게 한다.
 */
export async function runAutoDispatch(
  cohortId: string,
  template: DispatchTemplate
): Promise<{ ok: true; data: AutoDispatchOutcome } | { ok: false; error: string }> {
  const op = await getOperator();
  if (!op) return { ok: false, error: '로그인 정보가 없습니다.' };

  const planned = await buildDispatchPlan(cohortId, template);
  if (!planned.ok) return planned;

  const outcome = await executeDispatch(planned.plan);

  revalidatePath('/dashboard/notifications');
  revalidatePath(`/dashboard/cohorts/${cohortId}/notifications`);

  return {
    ok: true,
    data: {
      dryRun: outcome.dryRun,
      sent: outcome.sent,
      skipped: outcome.skipped,
      failed: outcome.failed,
      errors: outcome.batchResults
        .filter((b) => !b.ok && b.error !== null)
        .map((b) => `${b.size}건 배치: ${b.error}`)
    }
  };
}

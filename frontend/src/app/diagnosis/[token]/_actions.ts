'use server';

import { createAdminClient } from '@/lib/supabase/server';

/**
 * 학생이 "예, 시작" 누른 순간 호출. started_at 이 NULL 일 때만 채워서
 * 한 번 시작한 시각은 절대 덮어쓰지 않는다 (디바이스/브라우저가 바뀌어도 동일 기준).
 *
 * 응답:
 *  - { ok: true, startedAt }  — 새로 채워졌거나 이미 시작돼 있음 (이미 값 반환)
 *  - { ok: false, error }     — 토큰 없음 등
 */
export async function startDiagnosis(
  token: string
): Promise<{ ok: true; startedAt: string } | { ok: false; error: string }> {
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from('diagnosis_responses')
    .select('id, started_at, submitted_at')
    .eq('token', token)
    .maybeSingle();
  if (!existing) return { ok: false, error: 'invalid_token' };
  if (existing.submitted_at) {
    return { ok: false, error: 'already_submitted' };
  }
  if (existing.started_at) {
    return { ok: true, startedAt: existing.started_at };
  }

  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from('diagnosis_responses')
    .update({ started_at: nowIso })
    .eq('id', existing.id)
    .is('started_at', null);
  if (error) return { ok: false, error: error.message };

  return { ok: true, startedAt: nowIso };
}

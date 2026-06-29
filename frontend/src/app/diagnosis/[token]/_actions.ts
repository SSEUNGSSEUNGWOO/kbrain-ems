'use server';

import { createAdminClient } from '@/lib/supabase/server';

/**
 * 학생이 "예, 시작" 누른 순간 호출. started_at 이 NULL 일 때만 채워서
 * 한 번 시작한 시각은 절대 덮어쓰지 않는다 (디바이스/브라우저가 바뀌어도 동일 기준).
 *
 * 응답:
 *  - { ok: true, elapsedSeconds }  — 시작 시각 기준 서버 NOW 까지의 경과초.
 *                                     클라이언트 OS 시간 의존을 피하기 위해 서버에서 계산해서 보낸다.
 *  - { ok: false, error }          — 토큰 없음 등
 */
export async function startDiagnosis(
  token: string
): Promise<{ ok: true; elapsedSeconds: number } | { ok: false; error: string }> {
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
    const elapsed = Math.max(
      0,
      Math.floor((Date.now() - new Date(existing.started_at).getTime()) / 1000)
    );
    return { ok: true, elapsedSeconds: elapsed };
  }

  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from('diagnosis_responses')
    .update({ started_at: nowIso })
    .eq('id', existing.id)
    .is('started_at', null);
  if (error) return { ok: false, error: error.message };

  return { ok: true, elapsedSeconds: 0 };
}

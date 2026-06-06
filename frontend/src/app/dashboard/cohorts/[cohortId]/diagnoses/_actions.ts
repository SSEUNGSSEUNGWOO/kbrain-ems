'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

type GenResult = { error?: string; generated?: number; existed?: number };

function shortToken(len = 12): string {
  // 영숫자 토큰. 충돌 시 unique constraint 가 잡아줌.
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < len; i++) {
    s += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return s;
}

/**
 * 진단의 공유 코드(share_code) 생성. 이미 있으면 그대로 반환.
 */
export async function ensureShareCode(
  diagnosisId: string,
  cohortId: string
): Promise<{ error?: string; code?: string }> {
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from('diagnoses')
    .select('share_code')
    .eq('id', diagnosisId)
    .maybeSingle<{ share_code: string | null }>();
  if (existing?.share_code) return { code: existing.share_code };

  const code = shortToken(8);
  const { error } = await supabase
    .from('diagnoses')
    .update({ share_code: code })
    .eq('id', diagnosisId);
  if (error) return { error: error.message };

  revalidatePath(`/dashboard/cohorts/${cohortId}/diagnoses`);
  return { code };
}

/**
 * 진단의 응답 토큰을 cohort 의 모든 학생에 대해 생성.
 * 이미 존재하는 (diagnosis_id, student_id) 조합은 건너뜀.
 */
export async function generateDiagnosisTokens(
  diagnosisId: string,
  cohortId: string
): Promise<GenResult> {
  const supabase = createAdminClient();

  // 현재 cohort 의 students
  const { data: students, error: stuErr } = await supabase
    .from('students')
    .select('id')
    .eq('cohort_id', cohortId);
  if (stuErr) return { error: stuErr.message };

  const studentIds = (students ?? []).map((s) => s.id);
  if (studentIds.length === 0) return { generated: 0, existed: 0 };

  // 이미 토큰이 있는 학생 식별
  const { data: existing, error: existErr } = await supabase
    .from('diagnosis_responses')
    .select('student_id')
    .eq('diagnosis_id', diagnosisId)
    .in('student_id', studentIds);
  if (existErr) return { error: existErr.message };

  const existingSet = new Set((existing ?? []).map((r) => r.student_id));
  const missing = studentIds.filter((id) => !existingSet.has(id));

  if (missing.length === 0) {
    return { generated: 0, existed: existingSet.size };
  }

  const rows = missing.map((sid) => ({
    diagnosis_id: diagnosisId,
    student_id: sid,
    token: shortToken()
  }));

  const { error: insErr } = await supabase.from('diagnosis_responses').insert(rows);
  if (insErr) return { error: insErr.message };

  revalidatePath(`/dashboard/cohorts/${cohortId}/diagnoses`);
  return { generated: rows.length, existed: existingSet.size };
}

/**
 * 진단을 출석 체크포인트와 연결 (또는 연결 해제).
 */
export async function linkDiagnosisToAttendanceCheck(
  diagnosisId: string,
  cohortId: string,
  attendanceCheckId: string | null
): Promise<{ error?: string }> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('diagnoses')
    .update({ attendance_check_id: attendanceCheckId })
    .eq('id', diagnosisId);
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/cohorts/${cohortId}/diagnoses`);
  return {};
}

/**
 * 응답 가능 시각(opens_at / closes_at) 설정.
 */
export async function updateDiagnosisSchedule(
  diagnosisId: string,
  cohortId: string,
  formData: FormData
): Promise<{ error?: string }> {
  const supabase = createAdminClient();
  const opensAt = String(formData.get('opens_at') ?? '').trim() || null;
  const closesAt = String(formData.get('closes_at') ?? '').trim() || null;

  const { error } = await supabase
    .from('diagnoses')
    .update({
      opens_at: opensAt ? new Date(opensAt).toISOString() : null,
      closes_at: closesAt ? new Date(closesAt).toISOString() : null
    })
    .eq('id', diagnosisId);
  if (error) return { error: error.message };

  revalidatePath(`/dashboard/cohorts/${cohortId}/diagnoses`);
  return {};
}

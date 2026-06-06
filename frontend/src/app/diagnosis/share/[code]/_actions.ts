'use server';

import { createAdminClient } from '@/lib/supabase/server';

export type IdentifyResult =
  | { ok: true; token: string }
  | { ok: false; error: string };

function shortToken(): string {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 12; i++) {
    s += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return s;
}

function normalizeName(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase();
}
function lastFourDigits(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  return digits.slice(-4);
}

export async function identifyAndStart(
  code: string,
  name: string,
  phoneLast4: string
): Promise<IdentifyResult> {
  const supabase = createAdminClient();

  // 1) 진단 + cohort 조회
  const { data: diag } = await supabase
    .from('diagnoses')
    .select('id, cohort_id, opens_at, closes_at')
    .eq('share_code', code)
    .maybeSingle();
  if (!diag) return { ok: false, error: '잘못된 진단 링크입니다.' };

  const now = Date.now();
  if (diag.opens_at && new Date(diag.opens_at).getTime() > now) {
    return { ok: false, error: '응답 가능 시각이 아직 되지 않았습니다.' };
  }
  if (diag.closes_at && new Date(diag.closes_at).getTime() < now) {
    return { ok: false, error: '응답 기간이 종료되었습니다.' };
  }

  // 2) cohort 의 students 중 이름 + 전화 뒷 4자리 일치 찾기
  const { data: students } = await supabase
    .from('students')
    .select('id, name, phone')
    .eq('cohort_id', diag.cohort_id);

  const normName = normalizeName(name);
  const normLast4 = phoneLast4.replace(/\D/g, '');
  if (normLast4.length !== 4) {
    return { ok: false, error: '전화번호 뒷 4자리를 정확히 입력해주세요.' };
  }

  const matches = (students ?? []).filter(
    (s) => normalizeName(s.name) === normName && lastFourDigits(s.phone) === normLast4
  );

  if (matches.length === 0) {
    return {
      ok: false,
      error: '명단에서 일치하는 정보를 찾을 수 없습니다. 이름·전화번호 뒷 4자리를 다시 확인해주세요.'
    };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      error: '동명이인이 있어 자동 매칭이 불가합니다. 관리자에게 문의해주세요.'
    };
  }
  const student = matches[0];

  // 3) 이 학생의 응답 row 조회 또는 생성
  const { data: existing } = await supabase
    .from('diagnosis_responses')
    .select('token, submitted_at')
    .eq('diagnosis_id', diag.id)
    .eq('student_id', student.id)
    .maybeSingle();

  if (existing) {
    return { ok: true, token: existing.token };
  }

  // 새로 생성
  const token = shortToken();
  const { error: insErr } = await supabase
    .from('diagnosis_responses')
    .insert({ diagnosis_id: diag.id, student_id: student.id, token });
  if (insErr) return { ok: false, error: '응답 시작에 실패했습니다.' };

  return { ok: true, token };
}

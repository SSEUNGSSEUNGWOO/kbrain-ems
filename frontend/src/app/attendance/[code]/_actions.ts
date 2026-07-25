'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { inferAttendanceRole } from '@/lib/attendance';

export type CheckinResult =
  | { ok: true; studentName: string; alreadyChecked: boolean; checkedAt: string; label: string }
  | { ok: false; error: string };

function normalizeName(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase();
}
function lastFourDigits(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  return digits.slice(-4);
}

export async function checkinByShareCode(
  code: string,
  name: string,
  phoneLast4: string
): Promise<CheckinResult> {
  const supabase = createAdminClient();

  // 1) 체크포인트 + 세션 정보 조회
  const { data: check } = await supabase
    .from('attendance_checks')
    .select(
      'id, session_id, label, opens_at, closes_at, criterion_at, attendance_role, sessions(cohort_id)'
    )
    .eq('share_code', code)
    .maybeSingle();
  if (!check) return { ok: false, error: '잘못된 출석 체크 링크입니다.' };

  // opens_at/closes_at 시간 window 차단 제거 — 학생은 언제든 체크인 가능.
  // 지각 여부는 criterion_at으로만 판정.
  const session = check.sessions as unknown as { cohort_id: string } | null;
  if (!session) return { ok: false, error: '세션 정보를 찾을 수 없습니다.' };

  // 2) cohort 의 students 중 이름 + 전화 뒷 4자리 일치 찾기
  const normLast4 = phoneLast4.replace(/\D/g, '');
  if (normLast4.length !== 4) {
    return { ok: false, error: '전화번호 뒷 4자리를 정확히 입력해주세요.' };
  }

  const { data: students } = await supabase
    .from('students')
    .select('id, name, phone, applicant_id')
    .eq('cohort_id', session.cohort_id);
  const normName = normalizeName(name);
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
    return { ok: false, error: '동명이인이 있어 자동 매칭이 불가합니다. 관리자에게 문의해주세요.' };
  }
  const student = matches[0];

  // 취하·탈락 등 selected 상태가 아닌 신청자만 차단. application 자체가 없는 학생
  // (테스트·수동등록 등)은 통과. 매칭 키는 students.applicant_id ↔ applications.applicant_id.
  if (student.applicant_id) {
    const { data: app } = await supabase
      .from('applications')
      .select('status')
      .eq('applicant_id', student.applicant_id)
      .eq('cohort_id', session.cohort_id)
      .maybeSingle();
    // 'selected' 와 'same_day_cancel'(당일취소) 만 출결 가능.
    // 'pre_cancel'(사전취소)·'rejected' 는 차단.
    const ALLOWED_FOR_ATTENDANCE = new Set(['selected', 'same_day_cancel']);
    if (app && !ALLOWED_FOR_ATTENDANCE.has(app.status)) {
      return {
        ok: false,
        error: '현재 출석 대상자가 아닙니다. 관리자에게 문의해주세요.'
      };
    }
  }

  // 3) 이미 체크인했는지 확인
  const { data: existing } = await supabase
    .from('attendance_check_records')
    .select('id, checked_at')
    .eq('check_id', check.id)
    .eq('student_id', student.id)
    .maybeSingle();
  if (existing) {
    return {
      ok: true,
      studentName: student.name,
      alreadyChecked: true,
      checkedAt: existing.checked_at,
      label: check.label
    };
  }

  // 4) 신규 체크인 기록 — 동시 클릭 시 unique(check_id, student_id) 위반 가능.
  // 위반이면 다른 요청이 먼저 성공한 것이므로 기존 row 로 응답해 UX 안정화.
  const checkedAt = new Date().toISOString();
  const { error: insErr } = await supabase
    .from('attendance_check_records')
    .insert({ check_id: check.id, student_id: student.id, checked_at: checkedAt });
  if (insErr) {
    if (insErr.code === '23505') {
      const { data: race } = await supabase
        .from('attendance_check_records')
        .select('checked_at')
        .eq('check_id', check.id)
        .eq('student_id', student.id)
        .maybeSingle();
      return {
        ok: true,
        studentName: student.name,
        alreadyChecked: true,
        checkedAt: race?.checked_at ?? checkedAt,
        label: check.label
      };
    }
    return { ok: false, error: '체크인 저장에 실패했습니다.' };
  }

  // 5) attendance_records 자동 반영
  // role이 NULL이면 label로 추론(2026-06 누락 버그 안전망). 추론도 실패하면 동기화 생략.
  const effectiveRole = check.attendance_role ?? inferAttendanceRole(check.label);
  if (effectiveRole === 'arrival') {
    const isLate =
      !!check.criterion_at && new Date(checkedAt) > new Date(check.criterion_at);
    const { error: arErr } = await supabase.from('attendance_records').upsert(
      {
        session_id: check.session_id,
        student_id: student.id,
        status: isLate ? 'late' : 'present',
        arrival_time: checkedAt.slice(11, 16)
      },
      { onConflict: 'session_id,student_id' }
    );
    if (arErr) {
      console.error('[attendance] arrival upsert 실패', {
        sessionId: check.session_id,
        studentId: student.id,
        error: arErr.message
      });
    }
  } else if (effectiveRole === 'departure') {
    // 마감 체크인 — departure_time 만 갱신. status 는 기존 값 유지 (없으면 present).
    const { data: existing } = await supabase
      .from('attendance_records')
      .select('status')
      .eq('session_id', check.session_id)
      .eq('student_id', student.id)
      .maybeSingle();
    const { error: arErr } = await supabase.from('attendance_records').upsert(
      {
        session_id: check.session_id,
        student_id: student.id,
        status: existing?.status ?? 'present',
        departure_time: checkedAt.slice(11, 16)
      },
      { onConflict: 'session_id,student_id' }
    );
    if (arErr) {
      console.error('[attendance] departure upsert 실패', {
        sessionId: check.session_id,
        studentId: student.id,
        error: arErr.message
      });
    }
  } else {
    console.error('[attendance] role 추론 실패 — attendance_records 미동기화', {
      checkId: check.id,
      label: check.label
    });
  }

  return {
    ok: true,
    studentName: student.name,
    alreadyChecked: false,
    checkedAt,
    label: check.label
  };
}

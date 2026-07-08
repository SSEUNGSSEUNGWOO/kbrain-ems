'use server';

import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/server';

function randomToken(len = 16): string {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

function last4(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.slice(-4);
}

export async function enterExamViaShare(input: {
  code: string;
  name: string;
  phoneLast4: string;
}): Promise<{ error?: string }> {
  const name = input.name.trim();
  const digits = input.phoneLast4.replace(/\D/g, '');
  if (!name) return { error: '이름을 입력해주세요.' };
  if (digits.length !== 4) return { error: '전화번호 뒷 4자리를 정확히 입력해주세요.' };

  const s = createAdminClient();

  const { data: exam } = await s
    .from('exams')
    .select('id, cohort_id')
    .eq('share_code', input.code)
    .maybeSingle();
  if (!exam) return { error: '잘못된 시험 링크입니다.' };
  if (!exam.cohort_id) return { error: '시험에 응시자 명단(교육 기수)이 연결되어 있지 않습니다.' };

  // cohort의 students에서 이름 매칭 + phone 뒷 4자리 검증
  const { data: students } = await s
    .from('students')
    .select('id, name, email, personal_email, phone')
    .eq('cohort_id', exam.cohort_id)
    .eq('name', name);
  if (!students || students.length === 0) {
    return { error: '명단에 이름이 없습니다. 오타 확인 후 다시 시도하세요.' };
  }
  const matched = students.find((st) => st.phone && last4(st.phone) === digits);
  if (!matched) {
    return { error: '이름은 확인되지만 전화번호 뒷 4자리가 일치하지 않습니다.' };
  }

  // 이미 발급된 세션 있는지 (같은 exam·student)
  const { data: existing } = await s
    .from('exam_sessions')
    .select('id, token')
    .eq('exam_id', exam.id)
    .eq('student_id', matched.id)
    .maybeSingle();

  let token: string;
  if (existing?.token) {
    token = existing.token;
  } else {
    token = randomToken();
    const { error: insErr } = await s.from('exam_sessions').insert({
      exam_id: exam.id,
      student_id: matched.id,
      token,
      name: matched.name,
      email: matched.email ?? matched.personal_email ?? null,
      phone_last4: digits,
      status: 'in_progress'
    });
    if (insErr) {
      // 동시 요청으로 UNIQUE 제약(exam_id, student_id) 위반 시:
      // 다른 요청이 먼저 insert 성공한 상태라 그 세션을 재조회해서 사용.
      const isUniqueViolation = insErr.code === '23505';
      if (isUniqueViolation) {
        const { data: raced } = await s
          .from('exam_sessions')
          .select('token')
          .eq('exam_id', exam.id)
          .eq('student_id', matched.id)
          .maybeSingle();
        if (raced?.token) {
          token = raced.token;
        } else {
          return { error: '세션 생성 실패 (충돌 복구 실패)' };
        }
      } else {
        return { error: `세션 생성 실패: ${insErr.message}` };
      }
    }
  }

  redirect(`/exam/${token}`);
}

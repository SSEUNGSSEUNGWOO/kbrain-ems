'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { buildSatisfactionQuestions } from '@/lib/survey-templates/satisfaction';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { randomUUID } from 'crypto';

type CreateInput = {
  cohortId: string;
  title: string;
  shareCode: string;
  sessionDate: string; // YYYY-MM-DD
  specialInstructorId: string;
  specialSessionTitle: string;
  techInstructorId: string;
  techSessionTitle: string;
};

export async function createSatisfactionSurvey(input: CreateInput) {
  const {
    cohortId,
    title,
    shareCode,
    sessionDate,
    specialInstructorId,
    specialSessionTitle,
    techInstructorId,
    techSessionTitle
  } = input;

  // 검증
  if (!title.trim()) return { error: '제목을 입력해주세요.' };
  if (!shareCode.trim()) return { error: '공유 코드를 입력해주세요.' };
  if (!sessionDate) return { error: '차수일을 선택해주세요.' };
  if (!specialInstructorId) return { error: '특강 강사를 선택해주세요.' };
  if (!techInstructorId) return { error: '기술교육 강사를 선택해주세요.' };
  if (!specialSessionTitle.trim()) return { error: '특강 세션 제목을 입력해주세요.' };
  if (!techSessionTitle.trim()) return { error: '기술교육 세션 제목을 입력해주세요.' };

  const supabase = createAdminClient();

  // share_code 중복 검사
  const { data: dup } = await supabase
    .from('surveys')
    .select('id')
    .eq('share_code', shareCode.trim())
    .maybeSingle();
  if (dup) return { error: '이미 사용 중인 공유 코드입니다.' };

  // 강사 정보 fetch (섹션 제목용)
  const { data: instructors, error: instErr } = await supabase
    .from('instructors')
    .select('id, name')
    .in('id', [specialInstructorId, techInstructorId]);
  if (instErr || !instructors || instructors.length < 2) {
    return { error: '강사 정보를 찾을 수 없습니다.' };
  }
  const specialInstructor = instructors.find((i) => i.id === specialInstructorId);
  const techInstructor = instructors.find((i) => i.id === techInstructorId);
  if (!specialInstructor || !techInstructor) {
    return { error: '강사 정보를 찾을 수 없습니다.' };
  }

  // 1) sessions 2개
  const { data: sessions, error: sessionErr } = await supabase
    .from('sessions')
    .insert([
      { cohort_id: cohortId, session_date: sessionDate, title: specialSessionTitle.trim() },
      { cohort_id: cohortId, session_date: sessionDate, title: techSessionTitle.trim() }
    ])
    .select('id, title');
  if (sessionErr || !sessions || sessions.length < 2) {
    return { error: sessionErr?.message ?? '세션 생성에 실패했습니다.' };
  }
  const specialSession = sessions.find((s) => s.title === specialSessionTitle.trim());
  const techSession = sessions.find((s) => s.title === techSessionTitle.trim());
  if (!specialSession || !techSession) {
    return { error: '세션 매핑에 실패했습니다.' };
  }

  // 2) session_instructors 2개
  const { error: siErr } = await supabase.from('session_instructors').insert([
    { session_id: specialSession.id, instructor_id: specialInstructorId, role: 'main' },
    { session_id: techSession.id, instructor_id: techInstructorId, role: 'main' }
  ]);
  if (siErr) return { error: siErr.message };

  // 3) survey
  const { data: survey, error: surveyErr } = await supabase
    .from('surveys')
    .insert({
      cohort_id: cohortId,
      title: title.trim(),
      type: 'satisfaction',
      scope: 'session',
      share_code: shareCode.trim()
    })
    .select('id')
    .single();
  if (surveyErr || !survey) {
    return { error: surveyErr?.message ?? '설문 생성에 실패했습니다.' };
  }

  // 4) survey_questions 27개 (강사 2명 = 섹션 4·5)
  const questions = buildSatisfactionQuestions({
    surveyId: survey.id,
    instructors: [
      { id: specialInstructor.id, name: specialInstructor.name, sessionTitle: specialSessionTitle.trim() },
      { id: techInstructor.id, name: techInstructor.name, sessionTitle: techSessionTitle.trim() }
    ]
  });
  const { error: qErr } = await supabase.from('survey_questions').insert(questions);
  if (qErr) return { error: qErr.message };

  // 5) 학생 24명에게 토큰 발급
  const { data: students, error: stuErr } = await supabase
    .from('students')
    .select('id')
    .eq('cohort_id', cohortId);
  if (stuErr) return { error: stuErr.message };

  if (students && students.length > 0) {
    const tokens = students.map((s) => ({
      survey_id: survey.id,
      student_id: s.id,
      token: randomUUID()
    }));
    const { error: tokErr } = await supabase.from('survey_responses').insert(tokens);
    if (tokErr) return { error: tokErr.message };
  }

  revalidatePath(`/dashboard/cohorts/${cohortId}/surveys`);
  redirect(`/dashboard/cohorts/${cohortId}/surveys`);
}

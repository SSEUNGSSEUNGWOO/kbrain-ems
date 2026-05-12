'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { buildSatisfactionQuestions } from '@/lib/survey-templates/satisfaction';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

type CreateLessonInput = {
  cohortId: string;
  sessionDate: string; // YYYY-MM-DD
  title: string;
  locationId: string | null;
  instructorIds: string[]; // 1~N
  withAssignment: boolean;
  assignmentTitle?: string;
  withSurvey: boolean;
  surveyShareCode?: string;
  surveyTitle?: string;
};

type Result = { error?: string };

export async function createLesson(input: CreateLessonInput): Promise<Result> {
  const {
    cohortId,
    sessionDate,
    title,
    locationId,
    instructorIds,
    withAssignment,
    assignmentTitle,
    withSurvey,
    surveyShareCode,
    surveyTitle
  } = input;

  if (!sessionDate) return { error: '날짜를 선택해주세요.' };
  if (!title.trim()) return { error: '수업 제목을 입력해주세요.' };
  if (instructorIds.length === 0) return { error: '강사를 최소 1명 선택해주세요.' };

  const supabase = createAdminClient();

  // 1) session INSERT
  const { data: session, error: sessionErr } = await supabase
    .from('sessions')
    .insert({
      cohort_id: cohortId,
      session_date: sessionDate,
      title: title.trim(),
      location_id: locationId
    })
    .select('id, title')
    .single();
  if (sessionErr || !session) return { error: sessionErr?.message ?? '수업 생성 실패' };

  // 2) session_instructors — 입력 순서대로
  const siRows = instructorIds.map((id) => ({
    session_id: session.id,
    instructor_id: id,
    role: 'main'
  }));
  const { error: siErr } = await supabase.from('session_instructors').insert(siRows);
  if (siErr) return { error: siErr.message };

  // 3) 출결 자동 — cohort 학생 × session
  const { data: students, error: stuErr } = await supabase
    .from('students')
    .select('id')
    .eq('cohort_id', cohortId);
  if (stuErr) return { error: stuErr.message };

  if (students && students.length > 0) {
    const attRows = students.map((s) => ({
      session_id: session.id,
      student_id: s.id,
      status: 'none'
    }));
    const { error: attErr } = await supabase.from('attendance_records').insert(attRows);
    if (attErr) return { error: attErr.message };
  }

  // 4) (옵션) 과제 자동 — 이 수업(세션)에 묶음
  if (withAssignment) {
    const at = (assignmentTitle && assignmentTitle.trim()) || `${title.trim()} 과제`;
    const { error: aErr } = await supabase.from('assignments').insert({
      cohort_id: cohortId,
      session_id: session.id,
      title: at
    });
    if (aErr) return { error: aErr.message };
  }

  // 5) (옵션) 만족도 설문 자동
  if (withSurvey) {
    if (!surveyShareCode?.trim()) return { error: '만족도 공유 코드가 필요합니다.' };

    // share_code 중복 검사
    const { data: dup } = await supabase
      .from('surveys')
      .select('id')
      .eq('share_code', surveyShareCode.trim())
      .maybeSingle();
    if (dup) return { error: '이미 사용 중인 공유 코드입니다.' };

    // 강사 정보 fetch
    const { data: instructors } = await supabase
      .from('instructors')
      .select('id, name')
      .in('id', instructorIds);
    if (!instructors || instructors.length !== instructorIds.length) {
      return { error: '강사 정보를 찾을 수 없습니다.' };
    }

    // 입력 순서 보존
    const orderedInstructors = instructorIds
      .map((id) => instructors.find((i) => i.id === id))
      .filter((x): x is { id: string; name: string } => !!x);

    const { data: survey, error: sErr } = await supabase
      .from('surveys')
      .insert({
        cohort_id: cohortId,
        session_id: session.id,
        title: (surveyTitle && surveyTitle.trim()) || `${title.trim()} 만족도 조사`,
        type: 'satisfaction',
        scope: 'session',
        share_code: surveyShareCode.trim()
      })
      .select('id')
      .single();
    if (sErr || !survey) return { error: sErr?.message ?? '설문 생성 실패' };

    const questions = buildSatisfactionQuestions({
      surveyId: survey.id,
      instructors: orderedInstructors.map((i) => ({
        id: i.id,
        name: i.name,
        sessionTitle: title.trim()
      }))
    });
    const { error: qErr } = await supabase.from('survey_questions').insert(questions);
    if (qErr) return { error: qErr.message };

    // 응답 토큰은 share_code 링크 진입 시 startSurvey()가 그 자리에서 발급.
  }

  revalidatePath(`/dashboard/cohorts/${cohortId}/lessons`);
  redirect(`/dashboard/cohorts/${cohortId}/lessons`);
}

type UpdateLessonInput = {
  cohortId: string;
  sessionId: string;
  sessionDate: string;
  title: string;
  locationId: string | null;
  instructorIds: string[];
};

export async function updateLesson(input: UpdateLessonInput): Promise<Result> {
  const { cohortId, sessionId, sessionDate, title, locationId, instructorIds } = input;

  if (!sessionDate) return { error: '날짜를 선택해주세요.' };
  if (!title.trim()) return { error: '수업 제목을 입력해주세요.' };
  if (instructorIds.length === 0) return { error: '강사를 최소 1명 선택해주세요.' };

  const supabase = createAdminClient();

  // 1) session 메타 업데이트
  const { error: sErr } = await supabase
    .from('sessions')
    .update({ session_date: sessionDate, title: title.trim(), location_id: locationId })
    .eq('id', sessionId);
  if (sErr) return { error: sErr.message };

  // 2) 강사 매핑 전체 갈아엎기 (삭제 후 재생성)
  const { error: delErr } = await supabase
    .from('session_instructors')
    .delete()
    .eq('session_id', sessionId);
  if (delErr) return { error: delErr.message };

  const siRows = instructorIds.map((id) => ({
    session_id: sessionId,
    instructor_id: id,
    role: 'main'
  }));
  const { error: siErr } = await supabase.from('session_instructors').insert(siRows);
  if (siErr) return { error: siErr.message };

  revalidatePath(`/dashboard/cohorts/${cohortId}/lessons`);
  return {};
}

export async function deleteLesson(cohortId: string, sessionId: string): Promise<Result> {
  const supabase = createAdminClient();
  // sessions 삭제 → session_instructors, attendance_records, surveys(session_id=null) cascade
  // surveys는 session_id SET NULL 이라 같이 사라지지 않음. 명시 삭제도 필요.
  const { error: surveyErr } = await supabase
    .from('surveys')
    .delete()
    .eq('session_id', sessionId);
  if (surveyErr) return { error: surveyErr.message };

  const { error } = await supabase.from('sessions').delete().eq('id', sessionId);
  if (error) return { error: error.message };

  revalidatePath(`/dashboard/cohorts/${cohortId}/lessons`);
  return {};
}

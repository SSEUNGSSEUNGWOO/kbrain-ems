'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { buildSatisfactionQuestions } from '@/lib/survey-templates/satisfaction';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

type InstructorInput = {
  instructorId: string;
  sessionTitle: string;
};

type CreateInput = {
  cohortId: string;
  title: string;
  shareCode: string;
  sessionDate: string; // YYYY-MM-DD
  instructors: InstructorInput[];
};

export async function createSatisfactionSurvey(input: CreateInput) {
  const { cohortId, title, shareCode, sessionDate, instructors } = input;

  // 검증
  if (!title.trim()) return { error: '제목을 입력해주세요.' };
  if (!shareCode.trim()) return { error: '공유 코드를 입력해주세요.' };
  if (!sessionDate) return { error: '차수일을 선택해주세요.' };
  if (instructors.length === 0) return { error: '강사를 최소 1명 추가해주세요.' };
  for (const [i, row] of instructors.entries()) {
    if (!row.instructorId) return { error: `${i + 1}번째 강사를 선택해주세요.` };
    if (!row.sessionTitle.trim()) return { error: `${i + 1}번째 세션 제목을 입력해주세요.` };
  }

  const supabase = createAdminClient();

  // share_code 중복 검사
  const { data: dup } = await supabase
    .from('surveys')
    .select('id')
    .eq('share_code', shareCode.trim())
    .maybeSingle();
  if (dup) return { error: '이미 사용 중인 공유 코드입니다.' };

  // 강사 정보 fetch (섹션 제목용)
  const instructorIds = instructors.map((r) => r.instructorId);
  const { data: instructorRecords, error: instErr } = await supabase
    .from('instructors')
    .select('id, name')
    .in('id', instructorIds);
  if (instErr || !instructorRecords || instructorRecords.length !== new Set(instructorIds).size) {
    return { error: '강사 정보를 찾을 수 없습니다.' };
  }
  const nameById = new Map(instructorRecords.map((r) => [r.id, r.name]));

  // 1) sessions — 입력 순서대로 1개씩 생성해 id를 정확히 매핑
  const sessionIds: string[] = [];
  for (const row of instructors) {
    const { data: s, error: sErr } = await supabase
      .from('sessions')
      .insert({
        cohort_id: cohortId,
        session_date: sessionDate,
        title: row.sessionTitle.trim()
      })
      .select('id')
      .single();
    if (sErr || !s) {
      return { error: sErr?.message ?? '세션 생성에 실패했습니다.' };
    }
    sessionIds.push(s.id);
  }

  // 2) session_instructors
  const { error: siErr } = await supabase.from('session_instructors').insert(
    instructors.map((row, i) => ({
      session_id: sessionIds[i],
      instructor_id: row.instructorId,
      role: 'main'
    }))
  );
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

  // 4) survey_questions — 강사 N명 = 헤더 12 + 6N + 푸터 3
  const questions = buildSatisfactionQuestions({
    surveyId: survey.id,
    instructors: instructors.map((row) => ({
      id: row.instructorId,
      name: nameById.get(row.instructorId) ?? '',
      sessionTitle: row.sessionTitle.trim()
    }))
  });
  const { error: qErr } = await supabase.from('survey_questions').insert(questions);
  if (qErr) return { error: qErr.message };

  // 학생 토큰 발급은 발행(publish) 시점에 수행. 여기서는 초안만 만든다.

  revalidatePath(`/dashboard/cohorts/${cohortId}/surveys`);
  redirect(`/dashboard/cohorts/${cohortId}/surveys/${survey.id}/edit`);
}

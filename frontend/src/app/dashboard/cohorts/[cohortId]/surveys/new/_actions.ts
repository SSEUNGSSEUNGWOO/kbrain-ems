'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { buildSatisfactionQuestions } from '@/lib/survey-templates/satisfaction';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

type InstructorInput = {
  instructorId: string;
};

type CreateInput = {
  cohortId: string;
  title: string;
  shareCode: string;
  sessionDate: string; // share_code 자동 생성용
  linkedSessionId: string | null;
  instructors: InstructorInput[];
};

export async function createSatisfactionSurvey(input: CreateInput) {
  const { cohortId, title, shareCode, sessionDate, linkedSessionId, instructors } = input;

  // 검증
  if (!title.trim()) return { error: '제목을 입력해주세요.' };
  if (!shareCode.trim()) return { error: '공유 코드를 입력해주세요.' };
  if (!sessionDate) return { error: '차수일을 선택해주세요.' };
  if (instructors.length === 0) return { error: '강사를 최소 1명 추가해주세요.' };
  for (const [i, row] of instructors.entries()) {
    if (!row.instructorId) return { error: `${i + 1}번째 강사를 선택해주세요.` };
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

  // 연결 회차 선택 시 그 session 제목을 강사 섹션 제목에 표시 (선택)
  let linkedSessionTitle: string | undefined;
  if (linkedSessionId) {
    const { data: sess } = await supabase
      .from('sessions')
      .select('title')
      .eq('id', linkedSessionId)
      .maybeSingle();
    linkedSessionTitle = sess?.title ?? undefined;
  }

  // survey
  const { data: survey, error: surveyErr } = await supabase
    .from('surveys')
    .insert({
      cohort_id: cohortId,
      session_id: linkedSessionId,
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

  // survey_questions — 강사 N명 = 헤더 12 + 6N + 푸터 3
  const questions = buildSatisfactionQuestions({
    surveyId: survey.id,
    instructors: instructors.map((row) => ({
      id: row.instructorId,
      name: nameById.get(row.instructorId) ?? '',
      sessionTitle: linkedSessionTitle
    }))
  });
  const { error: qErr } = await supabase.from('survey_questions').insert(questions);
  if (qErr) return { error: qErr.message };

  // 응답 토큰은 발행(publish) 시점에 발급. 여기서는 초안만.
  revalidatePath(`/dashboard/cohorts/${cohortId}/surveys`);
  redirect(`/dashboard/cohorts/${cohortId}/surveys/${survey.id}/edit`);
}

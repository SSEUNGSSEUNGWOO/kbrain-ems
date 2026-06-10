'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { LIKERT10_LABELS, SCALE_OPTIONS } from '@/lib/survey-templates/satisfaction';
import type { Json, TablesInsert } from '@/lib/supabase/types';
import { revalidatePath } from 'next/cache';

export type QuestionDraft = {
  type: 'likert10' | 'text' | 'choice';
  text: string;
  required: boolean;
  options: Json | null;
};

export type SectionDraft = {
  title: string;
  instructor_id: string | null;
  questions: QuestionDraft[];
};

type ActionResult = { error?: string };

function isPublished(opens_at: string | null): boolean {
  return opens_at !== null;
}

export async function saveSurveyDraft(
  cohortId: string,
  surveyId: string,
  sections: SectionDraft[]
): Promise<ActionResult> {
  const supabase = createAdminClient();

  // 발행 여부 확인 — 발행된 설문은 잠금
  const { data: survey } = await supabase
    .from('surveys')
    .select('opens_at')
    .eq('id', surveyId)
    .maybeSingle();
  if (!survey) return { error: '설문을 찾을 수 없습니다.' };
  if (isPublished(survey.opens_at)) {
    return { error: '이미 발행된 설문은 수정할 수 없습니다.' };
  }

  // 검증
  if (sections.length === 0) return { error: '최소 1개의 섹션이 필요합니다.' };
  for (const [i, section] of sections.entries()) {
    if (!section.title.trim()) return { error: `${i + 1}번째 섹션 제목을 입력해주세요.` };
    if (section.questions.length === 0) {
      return { error: `${i + 1}번째 섹션에 문항을 1개 이상 추가해주세요.` };
    }
    for (const [j, q] of section.questions.entries()) {
      if (!q.text.trim()) {
        return { error: `${i + 1}번째 섹션 ${j + 1}번 문항 텍스트를 입력해주세요.` };
      }
    }
  }

  // 새로 삽입할 row 준비
  const rows: TablesInsert<'survey_questions'>[] = [];
  let questionNo = 1;
  sections.forEach((section, sectionIdx) => {
    const sectionNo = sectionIdx + 1;
    section.questions.forEach((q) => {
      const options =
        q.type === 'likert10'
          ? ({ ...SCALE_OPTIONS, labels: [...LIKERT10_LABELS] } as Json)
          : q.options;
      rows.push({
        survey_id: surveyId,
        question_no: questionNo++,
        type: q.type,
        text: q.text.trim(),
        required: q.required,
        section_no: sectionNo,
        section_title: section.title.trim(),
        instructor_id: section.instructor_id,
        options
      });
    });
  });

  // 기존 문항 백업 → delete → insert. insert 실패시 백업으로 복구해 데이터 유실 방지.
  // (survey_id, question_no) UNIQUE 때문에 delete 없이 insert 불가 → 백업/롤백 패턴.
  const { data: backup, error: bkErr } = await supabase
    .from('survey_questions')
    .select('*')
    .eq('survey_id', surveyId);
  if (bkErr) return { error: bkErr.message };

  const { error: delErr } = await supabase
    .from('survey_questions')
    .delete()
    .eq('survey_id', surveyId);
  if (delErr) return { error: delErr.message };

  const { error: insErr } = await supabase.from('survey_questions').insert(rows);
  if (insErr) {
    if (backup && backup.length > 0) {
      const { error: rbErr } = await supabase.from('survey_questions').insert(backup);
      if (rbErr) {
        return {
          error: `저장 실패: ${insErr.message}. 기존 문항 복구도 실패: ${rbErr.message}. 즉시 개발자에게 알려주세요.`
        };
      }
      return { error: `저장 실패: ${insErr.message}. 기존 문항은 복구되었습니다.` };
    }
    return { error: insErr.message };
  }

  revalidatePath(`/dashboard/cohorts/${cohortId}/surveys/${surveyId}/edit`);
  revalidatePath(`/dashboard/cohorts/${cohortId}/surveys/${surveyId}/preview`);
  revalidatePath(`/dashboard/cohorts/${cohortId}/surveys`);
  return {};
}

export async function publishSurvey(
  cohortId: string,
  surveyId: string
): Promise<ActionResult> {
  const supabase = createAdminClient();

  const { data: survey } = await supabase
    .from('surveys')
    .select('id, opens_at')
    .eq('id', surveyId)
    .maybeSingle();
  if (!survey) return { error: '설문을 찾을 수 없습니다.' };
  if (isPublished(survey.opens_at)) return { error: '이미 발행된 설문입니다.' };

  // 문항 존재 확인
  const { count } = await supabase
    .from('survey_questions')
    .select('id', { head: true, count: 'exact' })
    .eq('survey_id', surveyId);
  if (!count || count === 0) return { error: '문항을 1개 이상 추가한 후 발행해주세요.' };

  // 발행 = opens_at 세팅. 응답 토큰은 학생이 share_code 링크로 시작할 때
  // startSurvey()가 그 자리에서 발급한다.
  const { error: upErr } = await supabase
    .from('surveys')
    .update({ opens_at: new Date().toISOString() })
    .eq('id', surveyId);
  if (upErr) return { error: upErr.message };

  revalidatePath(`/dashboard/cohorts/${cohortId}/surveys`);
  revalidatePath(`/dashboard/cohorts/${cohortId}/surveys/${surveyId}/edit`);
  return {};
}

/**
 * 설문을 다른 cohort 에도 연결 (예: 1기·2기 통합 설문).
 * primary cohort_id 는 그대로 두고, additional_cohort_ids 만 갱신.
 */
export async function updateLinkedCohorts(
  cohortId: string,
  surveyId: string,
  additionalCohortIds: string[]
): Promise<ActionResult> {
  const supabase = createAdminClient();

  // primary cohort 가 additional 에 포함되면 안 됨
  const sanitized = Array.from(new Set(additionalCohortIds.filter((id) => id !== cohortId)));

  const { error } = await supabase
    .from('surveys')
    .update({ additional_cohort_ids: sanitized })
    .eq('id', surveyId)
    .eq('cohort_id', cohortId);
  if (error) return { error: error.message };

  // 연결되는 모든 cohort 의 만족도 메뉴·결과 캐시 무효화
  for (const id of [cohortId, ...sanitized]) {
    revalidatePath(`/dashboard/cohorts/${id}/surveys`);
    revalidatePath(`/dashboard/cohorts/${id}/surveys/${surveyId}/results`);
  }
  revalidatePath(`/dashboard/cohorts/${cohortId}/surveys/${surveyId}/edit`);
  return {};
}

'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { LIKERT5_LABELS, SCALE_OPTIONS } from '@/lib/survey-templates/satisfaction';
import type { Json, TablesInsert } from '@/lib/supabase/types';
import { revalidatePath } from 'next/cache';

export type QuestionDraft = {
  type: 'likert5' | 'text' | 'choice';
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

  // 기존 문항 전체 삭제 (미발행 + 응답 없음 가정)
  const { error: delErr } = await supabase.from('survey_questions').delete().eq('survey_id', surveyId);
  if (delErr) return { error: delErr.message };

  // 새로 삽입
  const rows: TablesInsert<'survey_questions'>[] = [];
  let questionNo = 1;
  sections.forEach((section, sectionIdx) => {
    const sectionNo = sectionIdx + 1;
    section.questions.forEach((q) => {
      const options =
        q.type === 'likert5'
          ? ({ ...SCALE_OPTIONS, labels: [...LIKERT5_LABELS] } as Json)
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

  const { error: insErr } = await supabase.from('survey_questions').insert(rows);
  if (insErr) return { error: insErr.message };

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

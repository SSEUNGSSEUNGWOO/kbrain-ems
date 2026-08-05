'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { loadSurveyReportStats } from '@/lib/reports/survey-report-stats';
import { generateSurveyReportSummary } from '@/lib/reports/generate-survey-report';
import { revalidatePath } from 'next/cache';

export async function generateSummaryAction(
  cohortId: string,
  surveyId: string
): Promise<{ error?: string }> {
  try {
    const stats = await loadSurveyReportStats(cohortId, surveyId);
    if (!stats) return { error: '설문을 찾을 수 없습니다.' };
    if (stats.submittedCount === 0)
      return { error: '제출된 응답이 없어 요약을 생성할 수 없습니다.' };

    const summary = await generateSurveyReportSummary(stats);

    const supabase = createAdminClient();
    const { error } = await supabase
      .from('surveys')
      .update({ report_summary: summary })
      .eq('id', surveyId);
    if (error) return { error: error.message };

    revalidatePath(`/dashboard/cohorts/${cohortId}/surveys/${surveyId}/report`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : '요약 생성 중 오류가 발생했습니다.' };
  }
}

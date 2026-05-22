'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { collectSessionReportData } from '@/lib/reports/session-data';
import { buildSessionReport, SESSION_REPORT_MODEL } from '@/lib/reports/generate-session';
import { revalidatePath } from 'next/cache';

type Result = { reportId: string } | { error: string };

export async function generateSessionReportAction(
  sessionId: string,
  cohortId: string
): Promise<Result> {
  try {
    const data = await collectSessionReportData(sessionId);
    const content = await buildSessionReport(data);

    const supabase = createAdminClient();
    const { data: report, error } = await supabase
      .from('cohort_reports')
      .insert({
        cohort_id: data.session.cohort_id,
        session_id: sessionId,
        type: 'session',
        title: `${data.session.no ?? '?'}회차 결과보고서 — ${data.session.cohort_name}`,
        content: {
          model: SESSION_REPORT_MODEL,
          sections: content.sections,
          source_data: data
        },
        status: 'draft',
        draft_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (error) return { error: error.message };
    if (!report) return { error: '보고서 저장 실패' };

    revalidatePath(`/dashboard/cohorts/${cohortId}/reports`);
    return { reportId: report.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { isViewer } from '@/lib/auth';
import { isTestStudent } from '@/lib/students';
import { logActivity } from '@/lib/activity-log';
import {
  buildNoticeRosterWorkbook,
  type NoticeRosterRow
} from '@/lib/excel/notice-roster-export';

// 분류 매핑 — applications/page.tsx 와 동일. 신청서 C2 응답(①~⑥) → 한글 라벨.
const CATEGORY_LABEL_BY_C2: Record<string, string> = {
  '①': '중앙부처',
  '②': '광역지자체',
  '③': '기초지자체',
  '④': '공공기관',
  '⑤': '교육행정기관',
  '⑥': '기타'
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ cohortId: string }> }
) {
  const { cohortId } = await params;
  const supabase = createAdminClient();
  const hidePersonal = await isViewer();

  const { data: cohortRow } = await supabase
    .from('cohorts')
    .select('id, name')
    .eq('id', cohortId)
    .maybeSingle();
  if (!cohortRow) return new NextResponse('Cohort not found', { status: 404 });

  type AppRow = {
    id: string;
    status: string;
    applicants: {
      id: string;
      name: string;
      phone: string | null;
      email: string | null;
      personal_email: string | null;
      category: string | null;
      organizations: { name: string } | null;
    } | null;
  };

  const { data: applications, error: appError } = await supabase
    .from('applications')
    .select(
      'id, status, applicants(id, name, phone, email, personal_email, category, organizations(name))'
    )
    .eq('cohort_id', cohortId)
    .in('status', ['selected', 'rejected'])
    .returns<AppRow[]>();
  if (appError) return new NextResponse(appError.message, { status: 500 });

  const rows = applications ?? [];

  // C2(분류) 응답 fetch — 신청서에 C2 문항이 있을 때만
  const { data: c2QuestionRow } = await supabase
    .from('application_questions')
    .select('id')
    .eq('cohort_id', cohortId)
    .eq('question_no', 'C2')
    .maybeSingle();

  const c2ChoiceByApp = new Map<string, string>();
  if (c2QuestionRow && rows.length > 0) {
    const appIds = rows.map((r) => r.id);
    const { data: answers } = await supabase
      .from('application_answers')
      .select('application_id, answer_value')
      .eq('question_id', c2QuestionRow.id)
      .in('application_id', appIds);
    for (const a of answers ?? []) {
      const v = typeof a.answer_value === 'string' ? a.answer_value : null;
      if (v) c2ChoiceByApp.set(a.application_id, v);
    }
  }

  function toExportRow(r: AppRow): NoticeRosterRow | null {
    if (!r.applicants || isTestStudent(r.applicants.name)) return null;
    const a = r.applicants;
    const c2 = c2ChoiceByApp.get(r.id);
    const categoryLabel =
      (c2 && CATEGORY_LABEL_BY_C2[c2]) ?? a.category ?? '미분류';
    return {
      name: a.name,
      categoryLabel,
      organizationName: a.organizations?.name ?? null,
      phone: hidePersonal ? null : a.phone,
      email: hidePersonal ? null : a.email,
      personalEmail: hidePersonal ? null : a.personal_email
    };
  }

  const selectedRows: NoticeRosterRow[] = [];
  const rejectedRows: NoticeRosterRow[] = [];
  for (const r of rows) {
    const exp = toExportRow(r);
    if (!exp) continue;
    if (r.status === 'selected') selectedRows.push(exp);
    else if (r.status === 'rejected') rejectedRows.push(exp);
  }

  const buf = await buildNoticeRosterWorkbook({
    cohortName: cohortRow.name,
    sheets: [
      { title: '선발자', rows: selectedRows },
      { title: '미선발자', rows: rejectedRows }
    ]
  });

  await logActivity({
    actionType: 'download',
    resourceType: 'application',
    cohortId,
    summary: `통보 명단 다운로드 (선발 ${selectedRows.length}명·미선발 ${rejectedRows.length}명)`
  });

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const filename = `${cohortRow.name} 통보명단 ${today}.xlsx`;
  const encoded = encodeURIComponent(filename);

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encoded}`,
      'Cache-Control': 'no-store'
    }
  });
}

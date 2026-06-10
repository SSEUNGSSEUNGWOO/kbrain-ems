import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { isViewer } from '@/lib/auth';
import { isTestStudent } from '@/lib/students';
import {
  buildNoticeRosterWorkbook,
  type NoticeRosterRow
} from '@/lib/excel/notice-roster-export';

// 분류 매핑 — applications/page.tsx 와 동일. 운영자가 직접 입력한 한글 라벨 ↔
// 신청서 C2 응답(①~⑥) ↔ 카테고리 key.
const CATEGORY_LABEL_BY_C2: Record<string, string> = {
  '①': '중앙부처',
  '②': '광역지자체',
  '③': '기초지자체',
  '④': '공공기관',
  '⑤': '교육행정기관',
  '⑥': '기타'
};

const STATUS_LABEL: Record<string, string> = {
  selected: '선발자',
  rejected: '미선발자'
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ cohortId: string }> }
) {
  const { cohortId } = await params;
  const url = new URL(req.url);
  const status = url.searchParams.get('status') ?? '';
  if (status !== 'selected' && status !== 'rejected') {
    return new NextResponse('Invalid status', { status: 400 });
  }
  const statusLabel = STATUS_LABEL[status];

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
    .eq('status', status)
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

  const exportRows: NoticeRosterRow[] = rows
    .filter((r) => r.applicants && !isTestStudent(r.applicants.name))
    .map((r) => {
      const a = r.applicants!;
      // C2 응답 우선 → 한글 라벨. 없으면 applicants.category 그대로 (전문인재처럼
      // C2 문항이 없는 cohort 는 운영자가 한글 라벨을 직접 넣어둠).
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
    });

  const buf = await buildNoticeRosterWorkbook({
    cohortName: cohortRow.name,
    statusLabel,
    rows: exportRows
  });

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const filename = `${cohortRow.name} ${statusLabel} 통보명단 ${today}.xlsx`;
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

import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { createAdminClient } from '@/lib/supabase/server';
import { isViewer } from '@/lib/auth';
import { logActivity } from '@/lib/activity-log';
import { categoryFromLabel, ORGANIZATION_CATEGORY_LABEL } from '@/lib/organization-category';
import {
  ROSTER_COLUMNS,
  filterForViewer,
  parseRosterColumns,
  type RosterColumnKey
} from '@/lib/roster-columns';

export async function GET(req: Request, { params }: { params: Promise<{ cohortId: string }> }) {
  const { cohortId } = await params;
  const supabase = createAdminClient();
  const hidePersonal = await isViewer();

  const url = new URL(req.url);
  const requested = parseRosterColumns(url.searchParams.get('cols'));
  const cols = filterForViewer(requested, hidePersonal);
  const colMeta = new Map(ROSTER_COLUMNS.map((c) => [c.key, c]));
  const includeCancel = url.searchParams.get('includeCancel') === '1';

  const { data: cohort } = await supabase
    .from('cohorts')
    .select('id, name')
    .eq('id', cohortId)
    .maybeSingle();
  if (!cohort) return new NextResponse('Cohort not found', { status: 404 });

  type StudentRow = {
    applicant_id: string;
    name: string;
    phone: string | null;
    email: string | null;
    personal_email: string | null;
    department: string | null;
    job_title: string | null;
    job_role: string | null;
    notes: string | null;
    organizations: { name: string } | null;
    applicants: {
      category: string | null;
      phone: string | null;
      email: string | null;
      personal_email: string | null;
    } | null;
  };

  const { data: studentRows, error } = await supabase
    .from('students')
    .select(
      'applicant_id, name, phone, email, personal_email, department, job_title, job_role, notes, organizations(name), applicants(category, phone, email, personal_email)'
    )
    .eq('cohort_id', cohortId)
    .not('name', 'ilike', '테스트%')
    .order('name', { ascending: true })
    .returns<StudentRow[]>();
  if (error) return new NextResponse(error.message, { status: 500 });

  // 현재 selected 인 학생만 (취하·탈락 제외).
  // includeCancel=1 이면 same_day_cancel(당일취소)도 포함.
  // 단, applications가 아예 없는 cohort(자기주도형/특화형처럼 지원 프로세스 없이 학생 직접 등록)는
  // 필터링을 건너뛰고 전체 학생 반환.
  const applicantIds = (studentRows ?? []).map((s) => s.applicant_id).filter(Boolean);
  let visibleSet = new Set<string>();
  const cancelSet = new Set<string>();
  let hasApplications = false;
  if (applicantIds.length > 0) {
    const { data: apps } = await supabase
      .from('applications')
      .select('applicant_id, status')
      .eq('cohort_id', cohortId)
      .in('applicant_id', applicantIds);
    hasApplications = (apps ?? []).length > 0;
    const allowedStatuses = includeCancel
      ? new Set(['selected', 'same_day_cancel'])
      : new Set(['selected']);
    visibleSet = new Set(
      (apps ?? []).filter((a) => allowedStatuses.has(a.status)).map((a) => a.applicant_id)
    );
    for (const a of apps ?? []) {
      if (a.status === 'same_day_cancel') cancelSet.add(a.applicant_id);
    }
  }
  const filtered = hasApplications
    ? (studentRows ?? []).filter((s) => visibleSet.has(s.applicant_id))
    : (studentRows ?? []);

  function cellValue(s: StudentRow, key: RosterColumnKey): string {
    switch (key) {
      case 'category': {
        const k = categoryFromLabel(s.applicants?.category ?? null) ?? 'unknown';
        return ORGANIZATION_CATEGORY_LABEL[k];
      }
      case 'organization':
        return s.organizations?.name ?? '';
      case 'department':
        return s.department ?? '';
      case 'job_title':
        return s.job_title ?? '';
      case 'job_role':
        return s.job_role ?? '';
      case 'phone':
        // 교육생 행이 비어 있으면 지원자 마스터 값으로 대체 —
        // 선발 이후에 연락처를 채운 경우 교육생 행에는 반영되지 않아 빈칸이 나온다.
        return s.phone ?? s.applicants?.phone ?? '';
      case 'email':
        return s.email ?? s.applicants?.email ?? '';
      case 'personal_email':
        return s.personal_email ?? s.applicants?.personal_email ?? '';
      case 'notes':
        return s.notes ?? '';
    }
  }

  // Excel
  const wb = new ExcelJS.Workbook();
  wb.creator = 'kbrain-ems';
  wb.created = new Date();
  const ws = wb.addWorksheet(`${cohort.name} 명단`);

  const headers = [
    'NO',
    '교육생 이름',
    ...cols.map((k) => colMeta.get(k)!.label),
    ...(includeCancel ? ['상태'] : [])
  ];
  const widths = [6, 14, ...cols.map((k) => colMeta.get(k)!.width), ...(includeCancel ? [10] : [])];

  const headerRow = ws.addRow(headers);
  headerRow.height = 28;
  headerRow.eachCell((cell, col) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: col === 1 ? 'FF4A86E8' : 'FFF2F2F2' }
    };
    cell.font = {
      name: 'Arial',
      size: 11,
      bold: true,
      color: { argb: col === 1 ? 'FFFFFFFF' : 'FF000000' }
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' }
    };
  });

  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  filtered.forEach((s, idx) => {
    const vals = [
      idx + 1,
      s.name,
      ...cols.map((k) => cellValue(s, k)),
      ...(includeCancel ? [cancelSet.has(s.applicant_id) ? '당일취소' : '선발'] : [])
    ];
    const row = ws.addRow(vals);
    row.eachCell((cell, col) => {
      cell.font = { name: 'Arial', size: 10 };
      cell.alignment = {
        horizontal: col === 1 ? 'center' : 'left',
        vertical: 'middle'
      };
      cell.border = {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' }
      };
    });
  });

  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const buf = await wb.xlsx.writeBuffer();

  await logActivity({
    actionType: 'download',
    resourceType: 'student',
    cohortId,
    summary: `명단 다운로드 (${cols.length > 0 ? cols.map((k) => colMeta.get(k)!.label).join('·') : '기본'})`
  });

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const filename = `${cohort.name} 명단 ${today}.xlsx`;
  const encoded = encodeURIComponent(filename);

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encoded}`,
      'Cache-Control': 'no-store'
    }
  });
}

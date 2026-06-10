import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { createAdminClient } from '@/lib/supabase/server';
import { isViewer } from '@/lib/auth';
import { logActivity } from '@/lib/activity-log';
import {
  categoryFromLabel,
  ORGANIZATION_CATEGORY_LABEL
} from '@/lib/organization-category';
import {
  ROSTER_COLUMNS,
  filterForViewer,
  parseRosterColumns,
  type RosterColumnKey
} from '@/lib/roster-columns';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ cohortId: string }> }
) {
  const { cohortId } = await params;
  const supabase = createAdminClient();
  const hidePersonal = await isViewer();

  const url = new URL(req.url);
  const requested = parseRosterColumns(url.searchParams.get('cols'));
  const cols = filterForViewer(requested, hidePersonal);
  const colMeta = new Map(ROSTER_COLUMNS.map((c) => [c.key, c]));

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
    applicants: { category: string | null } | null;
  };

  const { data: studentRows, error } = await supabase
    .from('students')
    .select(
      'applicant_id, name, phone, email, personal_email, department, job_title, job_role, notes, organizations(name), applicants(category)'
    )
    .eq('cohort_id', cohortId)
    .order('name', { ascending: true })
    .returns<StudentRow[]>();
  if (error) return new NextResponse(error.message, { status: 500 });

  // 현재 selected 인 학생만 (취하·탈락 제외)
  const applicantIds = (studentRows ?? []).map((s) => s.applicant_id).filter(Boolean);
  let selectedSet = new Set<string>();
  if (applicantIds.length > 0) {
    const { data: apps } = await supabase
      .from('applications')
      .select('applicant_id')
      .eq('cohort_id', cohortId)
      .eq('status', 'selected')
      .in('applicant_id', applicantIds);
    selectedSet = new Set((apps ?? []).map((a) => a.applicant_id));
  }
  const filtered = (studentRows ?? []).filter((s) => selectedSet.has(s.applicant_id));

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
        return s.phone ?? '';
      case 'email':
        return s.email ?? '';
      case 'personal_email':
        return s.personal_email ?? '';
      case 'notes':
        return s.notes ?? '';
    }
  }

  // Excel
  const wb = new ExcelJS.Workbook();
  wb.creator = 'kbrain-ems';
  wb.created = new Date();
  const ws = wb.addWorksheet(`${cohort.name} 명단`);

  const headers = ['NO', '교육생 이름', ...cols.map((k) => colMeta.get(k)!.label)];
  const widths = [6, 14, ...cols.map((k) => colMeta.get(k)!.width)];

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
    const vals = [idx + 1, s.name, ...cols.map((k) => cellValue(s, k))];
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
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encoded}`,
      'Cache-Control': 'no-store'
    }
  });
}

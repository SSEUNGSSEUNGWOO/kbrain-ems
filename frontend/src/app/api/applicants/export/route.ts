import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { fetchAllPages } from '@/lib/supabase/fetch-all';
import { isViewer } from '@/lib/auth';
import { isTestStudent } from '@/lib/students';
import { APPLICANT_SORT_KEYS, type ApplicantSort } from '@/app/dashboard/applicants/_search-params';

type AppJoin = {
  applicant_id: string;
  status: string;
  cohorts: { name: string } | null;
};

type ApplicantRow = {
  id: string;
  name: string;
  category: string | null;
  department: string | null;
  job_title: string | null;
  job_role: string | null;
  birth_date: string | null;
  email?: string | null;
  personal_email?: string | null;
  phone?: string | null;
  notes: string | null;
  organizations: { name: string } | null;
};

const sanitize = (s: string) =>
  s.replace(/[%,()\\]/g, ' ').replace(/\s+/g, ' ').trim();

const cmpName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, 'ko');

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = url.searchParams.get('q') ?? '';
  const category = url.searchParams.get('category') ?? '';
  const unselected = url.searchParams.get('unselected') === '1';
  const sortRaw = url.searchParams.get('sort') ?? 'name';
  const sort: ApplicantSort = (APPLICANT_SORT_KEYS as readonly string[]).includes(sortRaw)
    ? (sortRaw as ApplicantSort)
    : 'name';

  const supabase = createAdminClient();
  const hidePersonal = await isViewer();

  const search = sanitize(q.trim());

  // applications 집계
  let appAggRows: AppJoin[];
  try {
    appAggRows = await fetchAllPages<AppJoin>((from, to) =>
      supabase
        .from('applications')
        .select('applicant_id, status, cohorts(name)')
        .range(from, to)
        .returns<AppJoin[]>()
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  type Stats = { applied: string[]; selected: string[]; rejected: string[] };
  const statsByApplicant = new Map<string, Stats>();
  for (const a of appAggRows) {
    const entry = statsByApplicant.get(a.applicant_id) ?? {
      applied: [],
      selected: [],
      rejected: []
    };
    const cName = a.cohorts?.name ?? '(이름 없음)';
    entry.applied.push(cName);
    if (a.status === 'selected') entry.selected.push(cName);
    else if (a.status === 'rejected') entry.rejected.push(cName);
    statsByApplicant.set(a.applicant_id, entry);
  }

  // applicants
  const selectCols = hidePersonal
    ? 'id, name, category, department, job_title, job_role, birth_date, notes, organizations(name)'
    : 'id, name, category, department, job_title, job_role, birth_date, email, personal_email, phone, notes, organizations(name)';

  let applicantRows: ApplicantRow[];
  try {
    applicantRows = await fetchAllPages<ApplicantRow>((from, to) => {
      let q = supabase.from('applicants').select(selectCols).range(from, to);
      if (search) {
        q = hidePersonal
          ? q.ilike('name', `%${search}%`)
          : q.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
      }
      if (category) {
        if (category === '미분류') {
          q = q.is('category', null);
        } else {
          q = q.eq('category', category);
        }
      }
      return q.returns<ApplicantRow[]>();
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  // 테스트 학생 + 지원 이력 0건 제외 — applicants 페이지와 일관
  const realApplicants = applicantRows.filter(
    (r) => !isTestStudent(r.name) && statsByApplicant.has(r.id)
  );

  // merge + filter + sort
  const merged = realApplicants.map((r) => {
    const s = statsByApplicant.get(r.id) ?? { applied: [], selected: [], rejected: [] };
    return {
      name: r.name,
      category: r.category ?? '미분류',
      organizationName: r.organizations?.name ?? '',
      department: r.department ?? '',
      job_title: r.job_title ?? '',
      job_role: r.job_role ?? '',
      birth_date: r.birth_date ?? '',
      email: r.email ?? '',
      personal_email: r.personal_email ?? '',
      phone: r.phone ?? '',
      notes: r.notes ?? '',
      applicationCount: s.applied.length,
      selectedCount: s.selected.length,
      rejectedCount: s.rejected.length,
      applied: s.applied,
      selected: s.selected,
      rejected: s.rejected
    };
  });

  const filtered = unselected
    ? merged.filter((r) => r.applicationCount >= 1 && r.selectedCount === 0)
    : merged;

  const sorted = filtered.toSorted((a, b) => {
    switch (sort) {
      case 'app_desc':
        return b.applicationCount - a.applicationCount || cmpName(a, b);
      case 'app_asc':
        return a.applicationCount - b.applicationCount || cmpName(a, b);
      case 'selected_desc':
        return b.selectedCount - a.selectedCount || cmpName(a, b);
      case 'selected_asc':
        return a.selectedCount - b.selectedCount || cmpName(a, b);
      case 'rejected_desc':
        return b.rejectedCount - a.rejectedCount || cmpName(a, b);
      case 'rejected_asc':
        return a.rejectedCount - b.rejectedCount || cmpName(a, b);
      default:
        return cmpName(a, b);
    }
  });

  // CSV
  const headers = hidePersonal
    ? [
        '이름',
        '구분',
        '소속',
        '부서',
        '직책',
        '직무',
        '생년월일',
        '지원수',
        '지원 차수',
        '합격수',
        '합격 차수',
        '불합격수',
        '불합격 차수',
        '비고'
      ]
    : [
        '이름',
        '구분',
        '소속',
        '부서',
        '직책',
        '직무',
        '생년월일',
        '이메일',
        '개인이메일',
        '연락처',
        '지원수',
        '지원 차수',
        '합격수',
        '합격 차수',
        '불합격수',
        '불합격 차수',
        '비고'
      ];

  const lines = [headers.map(csvEscape).join(',')];
  for (const r of sorted) {
    const cols = hidePersonal
      ? [
          r.name,
          r.category,
          r.organizationName,
          r.department,
          r.job_title,
          r.job_role,
          r.birth_date,
          r.applicationCount,
          r.applied.join(' / '),
          r.selectedCount,
          r.selected.join(' / '),
          r.rejectedCount,
          r.rejected.join(' / '),
          r.notes
        ]
      : [
          r.name,
          r.category,
          r.organizationName,
          r.department,
          r.job_title,
          r.job_role,
          r.birth_date,
          r.email,
          r.personal_email,
          r.phone,
          r.applicationCount,
          r.applied.join(' / '),
          r.selectedCount,
          r.selected.join(' / '),
          r.rejectedCount,
          r.rejected.join(' / '),
          r.notes
        ];
    lines.push(cols.map(csvEscape).join(','));
  }

  const csv = '﻿' + lines.join('\r\n');
  const today = new Date().toISOString().slice(0, 10);
  const filename = `applicants_${today}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    }
  });
}

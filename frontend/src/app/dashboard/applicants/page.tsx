import PageContainer from '@/components/layout/page-container';
import { createAdminClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { ApplicantSheet } from './_components/applicant-sheet';
import { ApplicantTable } from './_components/applicant-table';

export default async function ApplicantsPage() {
  try {
    const supabase = createAdminClient();

    type ApplicantRow = {
      id: string;
      name: string;
      department: string | null;
      job_title: string | null;
      job_role: string | null;
      birth_date: string | null;
      email: string | null;
      phone: string | null;
      notes: string | null;
      organizations: { name: string } | null;
    };

    const { data: applicantRows, error: applicantError } = await supabase
      .from('applicants')
      .select(
        'id, name, department, job_title, job_role, birth_date, email, phone, notes, organizations(name)'
      )
      .order('name', { ascending: true })
      .returns<ApplicantRow[]>();
    if (applicantError) throw new Error(applicantError.message);

    const rows = (applicantRows ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      organizationName: r.organizations?.name ?? null,
      department: r.department,
      job_title: r.job_title,
      job_role: r.job_role,
      birth_date: r.birth_date,
      email: r.email,
      phone: r.phone,
      notes: r.notes
    }));

    // group by 미지원 → 전체 applications를 가져와 JS로 집계
    const { data: applicationRows, error: applicationError } = await supabase
      .from('applications')
      .select('applicant_id, status');
    if (applicationError) throw new Error(applicationError.message);

    const countMap = new Map<string, { total: number; selected: number }>();
    for (const a of applicationRows ?? []) {
      const entry = countMap.get(a.applicant_id) ?? { total: 0, selected: 0 };
      entry.total++;
      if (a.status === 'selected') entry.selected++;
      countMap.set(a.applicant_id, entry);
    }

    const mapped = rows.map((r) => ({
      ...r,
      applicationCount: countMap.get(r.id)?.total ?? 0,
      selectedCount: countMap.get(r.id)?.selected ?? 0
    }));

    return (
      <PageContainer
        pageTitle='지원자 관리'
        pageDescription={`총 ${mapped.length}명`}
        pageHeaderAction={
          <ApplicantSheet trigger={<Button>+ 지원자 추가</Button>} />
        }
      >
        <ApplicantTable applicants={mapped} />
      </PageContainer>
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : '알 수 없는 오류';
    return (
      <PageContainer pageTitle='지원자 관리'>
        <div className='text-destructive'>불러오기 실패: {message}</div>
      </PageContainer>
    );
  }
}

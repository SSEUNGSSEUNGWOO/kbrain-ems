import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { createAdminClient } from '@/lib/supabase/server';
import { Icons } from '@/components/icons';
import { LmsImportDialog } from './_components/lms-import-dialog';
import { LmsCompletionsTable } from './_components/lms-completions-table';

const PAGE_SIZE = 50;
const normPhone = (s: string | null | undefined) => (s ?? '').replace(/[^\d]/g, '');
const normEmail = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LmsCompletionsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const search = (typeof sp.q === 'string' ? sp.q : '').trim();

  const supabase = createAdminClient();

  type LmsRow = {
    course_code: string;
    course_name: string;
    name: string;
    phone: string | null;
    email: string | null;
    completed_at: string | null;
    updated_at: string;
  };

  // 1) LMS 전체 fetch (PostgREST max-rows=1000 우회: range chunked)
  const lmsRows: LmsRow[] = [];
  const chunk = 1000;
  for (let from = 0; from < 1_000_000; from += chunk) {
    const res = (await supabase
      // @ts-expect-error lms_completions type 미반영
      .from('lms_completions')
      .select('course_code, course_name, name, phone, email, completed_at, updated_at')
      .range(from, from + chunk - 1)) as unknown as { data: LmsRow[] | null };
    const batch = res.data ?? [];
    lmsRows.push(...batch);
    if (batch.length < chunk) break;
  }

  // 2) 사람 단위 그룹화 — 동일 인물 식별 키: phone 우선, 없으면 email, 둘 다 없으면 name+row
  type PersonRow = {
    key: string;
    name: string;
    phone: string | null;
    email: string | null;
    courses: { code: string; name: string; completed_at: string | null }[];
    lastCompletedAt: string | null;
  };
  const personMap = new Map<string, PersonRow>();
  for (const r of lmsRows) {
    const p = normPhone(r.phone);
    const e = normEmail(r.email);
    const key = p ? `p:${p}` : e ? `e:${e}` : `n:${r.name}`;
    let entry = personMap.get(key);
    if (!entry) {
      entry = {
        key,
        name: r.name,
        phone: r.phone,
        email: r.email,
        courses: [],
        lastCompletedAt: null
      };
      personMap.set(key, entry);
    }
    // 같은 과목 중복은 마지막 수료일로 갱신 (이전 dedup으로 거의 없을 거)
    const existing = entry.courses.find((c) => c.code === r.course_code);
    if (existing) {
      if (r.completed_at && (!existing.completed_at || r.completed_at > existing.completed_at)) {
        existing.completed_at = r.completed_at;
      }
    } else {
      entry.courses.push({ code: r.course_code, name: r.course_name, completed_at: r.completed_at });
    }
    if (r.completed_at && (!entry.lastCompletedAt || r.completed_at > entry.lastCompletedAt)) {
      entry.lastCompletedAt = r.completed_at;
    }
  }

  // 3) 검색 필터
  let persons = [...personMap.values()];
  if (search) {
    const q = search.toLowerCase();
    persons = persons.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.phone ?? '').replace(/[^\d]/g, '').includes(q.replace(/[^\d]/g, '')) ||
        (p.email ?? '').toLowerCase().includes(q)
    );
  }

  // 4) 정렬 (이름순)
  persons.sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  // 5) 통계
  const courseCounts = new Map<string, { name: string; count: number }>();
  for (const r of lmsRows) {
    const e = courseCounts.get(r.course_code);
    if (e) e.count++;
    else courseCounts.set(r.course_code, { name: r.course_name, count: 1 });
  }
  const totalPersons = personMap.size;
  const multiCourseCount = [...personMap.values()].filter((p) => p.courses.length >= 2).length;
  const lastUpdated = lmsRows.reduce<string | null>(
    (acc, r) => (acc && acc > r.updated_at ? acc : r.updated_at),
    null
  );

  // 6) 신청자 매칭 (현재 신청자 중 LMS 수료자)
  const { data: applicantsAll } = await supabase
    .from('applicants')
    .select('id, phone, email');
  const applicantPhoneIdx = new Set<string>();
  const applicantEmailIdx = new Set<string>();
  for (const a of applicantsAll ?? []) {
    const p = normPhone(a.phone);
    const e = normEmail(a.email);
    if (p) applicantPhoneIdx.add(p);
    if (e) applicantEmailIdx.add(e);
  }
  let matchedApplicantsCount = 0;
  for (const p of personMap.values()) {
    const ph = normPhone(p.phone);
    const em = normEmail(p.email);
    if ((ph && applicantPhoneIdx.has(ph)) || (em && applicantEmailIdx.has(em))) {
      matchedApplicantsCount++;
    }
  }

  // 7) 페이지네이션
  const total = persons.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const slice = persons.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // 8) 표시용 변환 (매칭 여부 포함)
  const rows = slice.map((p) => {
    const ph = normPhone(p.phone);
    const em = normEmail(p.email);
    const isApplicant =
      (ph && applicantPhoneIdx.has(ph)) || (em && applicantEmailIdx.has(em));
    return {
      key: p.key,
      name: p.name,
      phone: p.phone,
      email: p.email,
      courses: p.courses,
      lastCompletedAt: p.lastCompletedAt,
      isApplicant: Boolean(isApplicant)
    };
  });

  return (
    <PageContainer
      pageTitle='사전학습 명단'
      pageDescription='LMS 수료자 전체 명단. 우리 신청자와는 자동 매칭됩니다.'
      pageHeaderAction={
        <LmsImportDialog
          trigger={
            <Button>
              <Icons.upload className='mr-1.5' />
              명단 업로드
            </Button>
          }
        />
      }
    >
      <div className='flex flex-col gap-6'>
        <Card className='py-4'>
          <CardContent className='flex flex-wrap items-center gap-x-10 gap-y-3 px-6'>
            <Stat label='LMS 수료자 (사람 수)' value={totalPersons} />
            {[...courseCounts.entries()].map(([code, info]) => (
              <Stat key={code} label={info.name} value={info.count} />
            ))}
            <Stat label='두 과목 이상' value={multiCourseCount} tone='text-emerald-600' />
            <Stat label='우리 신청자 매칭' value={matchedApplicantsCount} tone='text-blue-600' />
            <Stat
              label='마지막 갱신'
              value={lastUpdated ? new Date(lastUpdated).toLocaleString('ko-KR') : '—'}
              small
            />
          </CardContent>
        </Card>

        <LmsCompletionsTable
          rows={rows}
          page={safePage}
          pageSize={PAGE_SIZE}
          pageCount={pageCount}
          totalCount={total}
          search={search}
        />
      </div>
    </PageContainer>
  );
}

function Stat({
  label,
  value,
  tone,
  small
}: {
  label: string;
  value: number | string;
  tone?: string;
  small?: boolean;
}) {
  return (
    <div className='flex flex-col'>
      <span className='text-muted-foreground text-xs'>{label}</span>
      <span
        className={`font-semibold tabular-nums ${small ? 'text-sm' : 'text-lg leading-tight'} ${tone ?? 'text-foreground'}`}
      >
        {typeof value === 'number' ? value.toLocaleString() : value}
      </span>
    </div>
  );
}

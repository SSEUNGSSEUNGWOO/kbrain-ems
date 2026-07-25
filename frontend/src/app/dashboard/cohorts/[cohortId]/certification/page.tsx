import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { createAdminClient } from '@/lib/supabase/server';
import { isViewer } from '@/lib/auth';
import { isTestStudent } from '@/lib/students';
import { cn } from '@/lib/utils';

type Props = {
  params: Promise<{ cohortId: string }>;
};

type StudentRow = {
  id: string;
  name: string;
  department: string | null;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  organizations: { name: string } | null;
};

type CertRow = {
  id: string;
  cohort_id: string;
  student_id: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  passed: boolean | null;
  total_score: number | null;
  grade: string | null;
  section_scores: Record<string, number | string | null>;
  exam_no: string | null;
  cert_no: string | null;
  exam_date: string | null;
};

export default async function CertificationPage({ params }: Props) {
  const { cohortId } = await params;
  const supabase = createAdminClient();
  const hidePersonal = await isViewer();

  const { data: cohortRow } = await supabase
    .from('cohorts')
    .select('id, name')
    .eq('id', cohortId)
    .maybeSingle();

  const studentCols = hidePersonal
    ? 'id, name, department, job_title, organizations(name)'
    : 'id, name, department, job_title, email, phone, organizations(name)';

  const { data: studentsRaw } = await supabase
    .from('students')
    .select(studentCols)
    .eq('cohort_id', cohortId)
    .order('name', { ascending: true })
    .returns<StudentRow[]>();

  const students = (studentsRaw ?? []).filter((s) => !isTestStudent(s.name));

  // supabase types.ts 에 certification_results 미등록 — 마이그레이션 적용 후 regen 필요.
  // 컬럼 타입 추론이 never 로 잡히므로 첫 호출을 cast 로 열어줌.
  const certBuilder = supabase.from(
    'certification_results' as unknown as 'cohorts'
  ) as unknown as {
    select: (cols: string) => {
      eq: (
        col: string,
        val: string
      ) => PromiseLike<{ data: CertRow[] | null; error: { message: string } | null }>;
    };
  };
  const certRes = await certBuilder
    .select(
      'id, cohort_id, student_id, name, phone, email, passed, total_score, grade, section_scores, exam_no, cert_no, exam_date'
    )
    .eq('cohort_id', cohortId);
  const certs = certRes.data ?? [];

  const certByStudent = new Map<string, CertRow>();
  const unmatched: CertRow[] = [];
  for (const c of certs) {
    if (c.student_id) certByStudent.set(c.student_id, c);
    else unmatched.push(c);
  }

  // 섹션명 취합 — 등장 순서대로 유지 (Set 은 insertion order 보존)
  const sectionNames = new Set<string>();
  for (const c of certs) {
    for (const key of Object.keys(c.section_scores ?? {})) sectionNames.add(key);
  }
  const sectionCols = [...sectionNames];

  const withResult = students.filter((s) => certByStudent.has(s.id));
  const noResult = students.filter((s) => !certByStudent.has(s.id));
  const passed = withResult.filter((s) => certByStudent.get(s.id)?.passed === true);
  const failed = withResult.filter((s) => certByStudent.get(s.id)?.passed === false);

  return (
    <PageContainer pageTitle='인증' pageDescription={cohortRow?.name ?? ''}>
      <div className='flex flex-col gap-6'>
        <Card className='py-4'>
          <CardContent className='flex flex-wrap items-center gap-x-10 gap-y-3 px-6'>
            <Stat label='학생 수' value={students.length} />
            <Stat label='응시자' value={withResult.length} />
            <Stat label='합격' value={passed.length} tone='text-emerald-600' />
            <Stat label='불합격' value={failed.length} tone='text-rose-600' />
            <Stat label='미응시' value={noResult.length} tone='text-muted-foreground' />
            {unmatched.length > 0 && (
              <Stat label='미매칭 결과' value={unmatched.length} tone='text-amber-600' />
            )}
          </CardContent>
        </Card>

        {students.length === 0 ? (
          <Card>
            <CardContent className='text-muted-foreground py-12 text-center'>
              등록된 학생이 없습니다.
            </CardContent>
          </Card>
        ) : certs.length === 0 ? (
          <Card>
            <CardContent className='text-muted-foreground py-12 text-center'>
              아직 인증 결과가 등록되지 않았습니다. 엑셀 import 로 결과를 넣어주세요.
            </CardContent>
          </Card>
        ) : (
          <section>
            <div className='mb-3 flex items-center gap-2'>
              <h2 className='text-sm font-medium'>학생별 결과</h2>
            </div>
            <div className='overflow-x-auto rounded-lg border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className='w-12'>NO</TableHead>
                    <TableHead>이름</TableHead>
                    <TableHead>소속기관</TableHead>
                    <TableHead>부서·직책</TableHead>
                    <TableHead className='text-right'>총점</TableHead>
                    {sectionCols.map((sec) => (
                      <TableHead key={sec} className='text-right whitespace-nowrap'>
                        {sec}
                      </TableHead>
                    ))}
                    <TableHead className='text-center'>결과</TableHead>
                    <TableHead className='whitespace-nowrap'>인증번호</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((s, idx) => {
                    const c = certByStudent.get(s.id) ?? null;
                    return (
                      <TableRow key={s.id}>
                        <TableCell className='text-muted-foreground tabular-nums'>
                          {idx + 1}
                        </TableCell>
                        <TableCell className='font-medium'>{s.name}</TableCell>
                        <TableCell className='text-muted-foreground'>
                          {s.organizations?.name ?? '—'}
                        </TableCell>
                        <TableCell className='text-muted-foreground text-sm'>
                          {[s.department, s.job_title].filter(Boolean).join(' · ') || '—'}
                        </TableCell>
                        <TableCell className='text-right font-medium tabular-nums'>
                          {c?.total_score ?? '—'}
                        </TableCell>
                        {sectionCols.map((sec) => (
                          <TableCell key={sec} className='text-right tabular-nums text-sm'>
                            {c?.section_scores?.[sec] ?? '—'}
                          </TableCell>
                        ))}
                        <TableCell className='text-center'>
                          {c === null ? (
                            <span className='text-muted-foreground text-xs'>미응시</span>
                          ) : c.passed === true ? (
                            <Badge
                              variant='outline'
                              className='border-emerald-200 bg-emerald-50 font-normal text-emerald-700'
                            >
                              합격
                            </Badge>
                          ) : c.passed === false ? (
                            <Badge
                              variant='outline'
                              className='border-rose-200 bg-rose-50 font-normal text-rose-700'
                            >
                              불합격
                            </Badge>
                          ) : (
                            <span className='text-muted-foreground text-xs'>—</span>
                          )}
                        </TableCell>
                        <TableCell className='text-muted-foreground text-xs tabular-nums'>
                          {c?.cert_no ?? '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </section>
        )}

        {unmatched.length > 0 && (
          <section>
            <div className='mb-3 flex items-center gap-2'>
              <span className='h-2 w-2 rounded-full bg-amber-500' />
              <h2 className='text-sm font-medium'>
                미매칭 결과 {unmatched.length}건
              </h2>
              <span className='text-muted-foreground text-xs'>
                — 이름·연락처가 학생 명단과 매칭되지 않았습니다.
              </span>
            </div>
            <div className='overflow-x-auto rounded-lg border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>이름</TableHead>
                    {!hidePersonal && <TableHead>연락처</TableHead>}
                    {!hidePersonal && <TableHead>이메일</TableHead>}
                    <TableHead className='text-right'>총점</TableHead>
                    <TableHead className='text-center'>결과</TableHead>
                    <TableHead>인증번호</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unmatched.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className='font-medium'>{c.name}</TableCell>
                      {!hidePersonal && (
                        <TableCell className='text-muted-foreground text-xs'>
                          {c.phone ?? '—'}
                        </TableCell>
                      )}
                      {!hidePersonal && (
                        <TableCell className='text-muted-foreground text-xs'>
                          {c.email ?? '—'}
                        </TableCell>
                      )}
                      <TableCell className='text-right tabular-nums'>
                        {c.total_score ?? '—'}
                      </TableCell>
                      <TableCell className='text-center'>
                        {c.passed === true ? (
                          <Badge
                            variant='outline'
                            className='border-emerald-200 bg-emerald-50 font-normal text-emerald-700'
                          >
                            합격
                          </Badge>
                        ) : c.passed === false ? (
                          <Badge
                            variant='outline'
                            className='border-rose-200 bg-rose-50 font-normal text-rose-700'
                          >
                            불합격
                          </Badge>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className='text-muted-foreground text-xs'>
                        {c.cert_no ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        )}
      </div>
    </PageContainer>
  );
}

function Stat({
  label,
  value,
  tone
}: {
  label: string;
  value: string | number;
  tone?: string;
}) {
  return (
    <div className='flex flex-col'>
      <span className='text-muted-foreground text-xs'>{label}</span>
      <span
        className={cn(
          'text-lg leading-tight font-semibold tabular-nums',
          tone ?? 'text-foreground'
        )}
      >
        {value}
      </span>
    </div>
  );
}

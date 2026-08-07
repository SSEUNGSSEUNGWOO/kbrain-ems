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
import {
  getSpecialCourseHistoryByApplicant,
  type SpecialHistory
} from '@/lib/special-course-history';
import { cn } from '@/lib/utils';
import { SyncRetroButton } from './_components/sync-retro-button';
import { CertResultsTable, type CertResultRow } from './_components/cert-results-table';

type Props = {
  params: Promise<{ cohortId: string }>;
};

type StudentRow = {
  id: string;
  name: string;
  applicant_id: string | null;
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
  source_cohort_id: string | null;
};

export default async function CertificationPage({ params }: Props) {
  const { cohortId } = await params;
  const supabase = createAdminClient();
  const hidePersonal = await isViewer();

  const { data: cohortRow } = await supabase
    .from('cohorts')
    .select('id, name, delivery_method')
    .eq('id', cohortId)
    .maybeSingle();

  const studentCols = hidePersonal
    ? 'id, name, applicant_id, department, job_title, organizations(name)'
    : 'id, name, applicant_id, department, job_title, email, phone, organizations(name)';

  const { data: studentsRaw } = await supabase
    .from('students')
    .select(studentCols)
    .eq('cohort_id', cohortId)
    .order('name', { ascending: true })
    .returns<StudentRow[]>();

  const students = (studentsRaw ?? []).filter((s) => !isTestStudent(s.name));

  // supabase types.ts 에 certification_results 미등록 — 마이그레이션 적용 후 regen 필요.
  // 컬럼 타입 추론이 never 로 잡히므로 첫 호출을 cast 로 열어줌.
  const certBuilder = supabase.from('certification_results' as unknown as 'cohorts') as unknown as {
    select: (cols: string) => {
      eq: (
        col: string,
        val: string
      ) => PromiseLike<{ data: CertRow[] | null; error: { message: string } | null }>;
    };
  };
  const certRes = await certBuilder
    .select(
      'id, cohort_id, student_id, name, phone, email, passed, total_score, grade, section_scores, exam_no, cert_no, exam_date, source_cohort_id'
    )
    .eq('cohort_id', cohortId);
  const certs = certRes.data ?? [];

  // 타 기수(자기주도형)에서 응시해 반영된 결과 표시용 — 출처 기수명
  const sourceCohortIds = [...new Set(certs.map((c) => c.source_cohort_id).filter(Boolean))];
  const sourceCohortName = new Map<string, string>();
  if (sourceCohortIds.length > 0) {
    const { data: srcCohorts } = await supabase
      .from('cohorts')
      .select('id, name')
      .in('id', sourceCohortIds as string[]);
    for (const c of srcCohorts ?? []) {
      sourceCohortName.set(c.id, c.name.replace('AI 챔피언 ', ''));
    }
  }

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

  // ── 자기주도형 한정: 이전 과정 수료증·인증 관리 대상 ─────────────────────
  // 같은 트랙의 이전 챔피언 과정에서 "집중은 채웠는데 인증평가만 안 본" 사람은
  // 이번 시험에 응시하면 원 과정 수료 요건이 충족돼 수료증을 추가 발급해야 한다.
  // 미인증(불합격)자는 이번 시험이 재응시 기회.
  type PendingTarget = {
    applicantId: string;
    name: string;
    organization: string | null;
    history: SpecialHistory;
    enrolled: boolean; // 이번 기수 교육생 여부
    examTaken: boolean; // 이번 기수 인증평가 응시 여부
    examPassed: boolean | null;
  };
  let pendingTargets: PendingTarget[] = [];
  const isSelfDirected = cohortRow?.delivery_method === '자기주도형';
  if (isSelfDirected && cohortRow) {
    const track = cohortRow.name.includes('그린')
      ? ('그린' as const)
      : cohortRow.name.includes('블루')
        ? ('블루' as const)
        : null;
    const historyMap = await getSpecialCourseHistoryByApplicant(track);
    const targets = [...historyMap.entries()].filter(
      ([, v]) => v.status === 'exam_only_left' || v.status === 'not_certified'
    );
    if (targets.length > 0) {
      const { data: targetApplicants } = await supabase
        .from('applicants')
        .select('id, name, organizations(name)')
        .in(
          'id',
          targets.map(([id]) => id)
        );
      const applicantInfo = new Map(
        (targetApplicants ?? []).map((a) => [
          a.id,
          {
            name: a.name,
            organization:
              (a as { organizations: { name: string } | null }).organizations?.name ?? null
          }
        ])
      );
      const studentByApplicant = new Map(
        students.filter((s) => s.applicant_id).map((s) => [s.applicant_id!, s])
      );
      pendingTargets = targets
        .map(([applicantId, history]) => {
          const info = applicantInfo.get(applicantId);
          const student = studentByApplicant.get(applicantId);
          const cert = student ? (certByStudent.get(student.id) ?? null) : null;
          return {
            applicantId,
            name: info?.name ?? '(알 수 없음)',
            organization: info?.organization ?? null,
            history,
            enrolled: !!student,
            examTaken: !!cert,
            examPassed: cert?.passed ?? null
          };
        })
        .toSorted(
          (a, b) => Number(b.enrolled) - Number(a.enrolled) || a.name.localeCompare(b.name, 'ko')
        );
    }
  }

  const certResultRows: CertResultRow[] = students.map((s) => {
    const c = certByStudent.get(s.id) ?? null;
    return {
      studentId: s.id,
      name: s.name,
      organization: s.organizations?.name ?? null,
      departmentTitle: [s.department, s.job_title].filter(Boolean).join(' · '),
      totalScore: c?.total_score ?? null,
      sectionScores: c?.section_scores ?? {},
      passed: c?.passed ?? null,
      certNo: c?.cert_no ?? null,
      sourceCohortName: c?.source_cohort_id
        ? (sourceCohortName.get(c.source_cohort_id) ?? '타 기수')
        : null
    };
  });

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

        {pendingTargets.length > 0 && (
          <section>
            <div className='mb-3 flex flex-wrap items-center gap-2'>
              <span className='h-2 w-2 rounded-full bg-amber-500' />
              <h2 className='text-sm font-medium'>
                이전 과정 수료증·인증 관리 대상 {pendingTargets.length}명
              </h2>
              <span className='text-muted-foreground text-xs'>
                — 같은 트랙 이전 과정에서 인증평가만 남은 미수료자(응시 시 원 과정 수료증 추가
                발급)와 미인증자(재응시 기회)
              </span>
              <div className='ml-auto'>
                <SyncRetroButton cohortId={cohortId} />
              </div>
            </div>
            <div className='overflow-x-auto rounded-lg border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>이름</TableHead>
                    <TableHead>소속기관</TableHead>
                    <TableHead>원 과정</TableHead>
                    <TableHead>사유</TableHead>
                    <TableHead>이번 기수</TableHead>
                    <TableHead>조치</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingTargets.map((t) => {
                    const isExamLeft = t.history.status === 'exam_only_left';
                    let action: { label: string; tone: string };
                    if (isExamLeft) {
                      action = t.examTaken
                        ? {
                            label: '원 과정 수료증 발급',
                            tone: 'border-emerald-300 bg-emerald-50 text-emerald-700 font-medium'
                          }
                        : t.enrolled
                          ? {
                              label: '시험 응시 대기',
                              tone: 'border-amber-200 bg-amber-50 text-amber-800'
                            }
                          : {
                              label: '미지원 — 다음 회차 안내',
                              tone: 'border-slate-200 bg-slate-50 text-slate-600'
                            };
                    } else {
                      action =
                        t.examPassed === true
                          ? {
                              label: '재응시 합격 — 인증 취득',
                              tone: 'border-emerald-300 bg-emerald-50 text-emerald-700 font-medium'
                            }
                          : t.examTaken
                            ? t.examPassed === false
                              ? {
                                  label: '재응시 불합격',
                                  tone: 'border-rose-200 bg-rose-50 text-rose-700'
                                }
                              : {
                                  label: '재응시 결과 대기',
                                  tone: 'border-amber-200 bg-amber-50 text-amber-800'
                                }
                            : t.enrolled
                              ? {
                                  label: '재응시 대기',
                                  tone: 'border-amber-200 bg-amber-50 text-amber-800'
                                }
                              : {
                                  label: '미지원 — 재응시 안내',
                                  tone: 'border-slate-200 bg-slate-50 text-slate-600'
                                };
                    }
                    return (
                      <TableRow key={t.applicantId}>
                        <TableCell className='font-medium'>{t.name}</TableCell>
                        <TableCell className='text-muted-foreground'>
                          {t.organization ?? '—'}
                        </TableCell>
                        <TableCell
                          className='text-sm'
                          title={`${t.history.cohortName} · 집중 ${t.history.attendedDays}/${t.history.requiredDays}일`}
                        >
                          {t.history.shortName}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant='outline'
                            className={cn(
                              'font-normal whitespace-nowrap',
                              isExamLeft
                                ? 'border-amber-300 bg-amber-50 text-amber-800'
                                : 'border-violet-200 bg-violet-50 text-violet-700'
                            )}
                          >
                            {isExamLeft ? '미수료 · 시험만 남음' : '미인증'}
                          </Badge>
                        </TableCell>
                        <TableCell className='text-sm'>
                          {t.enrolled ? (
                            <span className='text-emerald-700'>선발됨</span>
                          ) : (
                            <span className='text-muted-foreground'>미지원</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant='outline'
                            className={cn('font-normal whitespace-nowrap', action.tone)}
                          >
                            {action.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </section>
        )}

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
              <span className='text-muted-foreground text-xs'>
                — 이름·소속·인증번호로 검색해 개별 점수를 확인할 수 있습니다
              </span>
            </div>
            <CertResultsTable rows={certResultRows} sectionCols={sectionCols} />
          </section>
        )}

        {unmatched.length > 0 && (
          <section>
            <div className='mb-3 flex items-center gap-2'>
              <span className='h-2 w-2 rounded-full bg-amber-500' />
              <h2 className='text-sm font-medium'>미매칭 결과 {unmatched.length}건</h2>
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

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
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

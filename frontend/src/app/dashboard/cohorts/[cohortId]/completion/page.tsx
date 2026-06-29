import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Icons } from '@/components/icons';
import { createAdminClient } from '@/lib/supabase/server';
import { isViewer } from '@/lib/auth';
import { computeAttendanceCounts } from '@/lib/completion';
import { isTestStudent } from '@/lib/students';
import { cn } from '@/lib/utils';
import { ThresholdInput } from './_components/threshold-input';

const DEFAULT_MIN_ATTENDANCE = 3;

type Props = {
  params: Promise<{ cohortId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CompletionPage({ params, searchParams }: Props) {
  const { cohortId } = await params;
  const sp = await searchParams;

  const supabase = createAdminClient();
  const hidePersonal = await isViewer();

  const { data: cohortRow } = await supabase
    .from('cohorts')
    .select('id, name, category, min_attendance')
    .eq('id', cohortId)
    .maybeSingle();

  const savedMin = cohortRow?.min_attendance ?? null;
  const minParam = Number(typeof sp.min === 'string' ? sp.min : '');
  const minAttendance = Number.isFinite(minParam) && minParam > 0
    ? Math.floor(minParam)
    : (savedMin ?? DEFAULT_MIN_ATTENDANCE);

  if (cohortRow && cohortRow.category !== 'general') {
    return (
      <PageContainer pageTitle='수료' pageDescription={cohortRow.name}>
        <Card>
          <CardContent className='text-muted-foreground flex flex-col items-center gap-2 py-16 text-center text-sm'>
            <p className='text-foreground text-base font-medium'>
              이 과정은 자동 수료 판정을 제공하지 않습니다.
            </p>
            <p>
              일반교육 과정에서만 출결 기반 수료 판정을 사용합니다. AI 챔피언·전문인재·특화교육 등은 별도 수료 기준이라 추후 별도 페이지로 분리됩니다.
            </p>
          </CardContent>
        </Card>
      </PageContainer>
    );
  }

  type StudentRow = {
    id: string;
    name: string;
    department: string | null;
    job_title: string | null;
    job_role: string | null;
    email: string | null;
    phone: string | null;
    organizations: { name: string } | null;
  };

  const studentCols = hidePersonal
    ? 'id, name, department, job_title, job_role, organizations(name)'
    : 'id, name, department, job_title, job_role, email, phone, organizations(name)';

  const { data: studentsRaw } = await supabase
    .from('students')
    .select(studentCols)
    .eq('cohort_id', cohortId)
    .order('name', { ascending: true })
    .returns<StudentRow[]>();

  const students = (studentsRaw ?? []).filter((s) => !isTestStudent(s.name));
  const { totalSessions, perStudent } = await computeAttendanceCounts(
    supabase,
    cohortId,
    students.map((s) => s.id)
  );

  const rows = students.map((s) => {
    const counts = perStudent.get(s.id) ?? { attended: 0, absent: 0 };
    return {
      id: s.id,
      name: s.name,
      organizationName: s.organizations?.name ?? null,
      department: s.department,
      jobTitle: s.job_title,
      email: s.email ?? null,
      phone: s.phone ?? null,
      attendedCount: counts.attended,
      absentCount: counts.absent
    };
  });
  const completed = rows.filter((r) => r.attendedCount >= minAttendance);
  const notCompleted = rows.filter((r) => r.attendedCount < minAttendance);

  const exportHref = `/api/cohorts/${cohortId}/completion/export?min=${minAttendance}`;
  const canExport = completed.length > 0;

  const headerAction = (
    <div className='flex items-center gap-3'>
      <ThresholdInput
        cohortId={cohortId}
        defaultMin={minAttendance}
        savedMin={savedMin}
        totalSessions={totalSessions}
      />
      <Button variant='outline' size='sm' asChild disabled={!canExport}>
        <a href={exportHref}>
          <Icons.download className='mr-1.5' />
          수료자 명단 엑셀
        </a>
      </Button>
    </div>
  );

  return (
    <PageContainer
      pageTitle='수료'
      pageDescription={cohortRow?.name ?? ''}
      pageHeaderAction={headerAction}
    >
      <div className='flex flex-col gap-6'>
        <Card className='py-4'>
          <CardContent className='flex flex-wrap items-center gap-x-10 gap-y-3 px-6'>
            <Stat label='총 회차' value={`${totalSessions}회`} />
            <Stat label='학생 수' value={students.length} />
            <Stat
              label={`수료자 (${minAttendance}회 이상)`}
              value={completed.length}
              tone='text-emerald-600'
            />
            <Stat label='미수료' value={notCompleted.length} tone='text-rose-600' />
          </CardContent>
        </Card>

        {totalSessions === 0 ? (
          <Card>
            <CardContent className='text-muted-foreground py-12 text-center'>
              등록된 회차가 없습니다.
            </CardContent>
          </Card>
        ) : students.length === 0 ? (
          <Card>
            <CardContent className='text-muted-foreground py-12 text-center'>
              등록된 학생이 없습니다.
            </CardContent>
          </Card>
        ) : (
          <>
            <StudentSection
              title={`수료자 ${completed.length}명`}
              tone='emerald'
              rows={completed}
              totalSessions={totalSessions}
              minAttendance={minAttendance}
              hidePersonal={hidePersonal}
              emptyMessage='수료 기준을 충족한 학생이 아직 없습니다.'
            />
            <StudentSection
              title={`미수료 ${notCompleted.length}명`}
              tone='rose'
              rows={notCompleted}
              totalSessions={totalSessions}
              minAttendance={minAttendance}
              hidePersonal={hidePersonal}
              emptyMessage='모든 학생이 수료 기준을 충족했습니다.'
            />
          </>
        )}
      </div>
    </PageContainer>
  );
}

type Row = {
  id: string;
  name: string;
  organizationName: string | null;
  department: string | null;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  attendedCount: number;
  absentCount: number;
};

function StudentSection({
  title,
  tone,
  rows,
  totalSessions,
  minAttendance,
  hidePersonal,
  emptyMessage
}: {
  title: string;
  tone: 'emerald' | 'rose';
  rows: Row[];
  totalSessions: number;
  minAttendance: number;
  hidePersonal: boolean;
  emptyMessage: string;
}) {
  const dotClass = tone === 'emerald' ? 'bg-emerald-500' : 'bg-rose-400';
  return (
    <section>
      <div className='mb-3 flex items-center gap-2'>
        <span className={cn('h-2 w-2 rounded-full', dotClass)} />
        <h2 className='text-sm font-medium'>{title}</h2>
      </div>
      {rows.length === 0 ? (
        <div className='text-muted-foreground rounded-lg border border-dashed py-8 text-center text-sm'>
          {emptyMessage}
        </div>
      ) : (
        <div className='overflow-x-auto rounded-lg border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='w-12'>NO</TableHead>
                <TableHead>이름</TableHead>
                <TableHead>소속기관</TableHead>
                <TableHead>부서·직책</TableHead>
                {!hidePersonal && <TableHead>연락처</TableHead>}
                <TableHead className='text-right'>출석 인정</TableHead>
                <TableHead className='text-right'>결석</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, idx) => (
                <TableRow key={r.id}>
                  <TableCell className='text-muted-foreground tabular-nums'>{idx + 1}</TableCell>
                  <TableCell className='font-medium'>{r.name}</TableCell>
                  <TableCell className='text-muted-foreground'>
                    {r.organizationName ?? '—'}
                  </TableCell>
                  <TableCell className='text-muted-foreground text-sm'>
                    {[r.department, r.jobTitle].filter(Boolean).join(' · ') || '—'}
                  </TableCell>
                  {!hidePersonal && (
                    <TableCell className='text-muted-foreground text-sm'>
                      {r.phone ?? '—'}
                    </TableCell>
                  )}
                  <TableCell className='text-right tabular-nums'>
                    <Badge
                      variant='outline'
                      className={cn(
                        'font-normal',
                        r.attendedCount >= minAttendance
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-50 text-slate-600 border-slate-200'
                      )}
                    >
                      {r.attendedCount} / {totalSessions}
                    </Badge>
                  </TableCell>
                  <TableCell className='text-right tabular-nums text-sm text-muted-foreground'>
                    {r.absentCount > 0 ? r.absentCount : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
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

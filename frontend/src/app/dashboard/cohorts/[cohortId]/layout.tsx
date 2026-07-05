import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getOperator, getVisibleCohortIds } from '@/lib/auth';

// 보조강사가 접근할 수 있는 cohort 하위 도메인. 사이드바 ASSISTANT_DOMAIN_SLUGS와 동일해야 한다.
const ASSISTANT_ALLOWED_DOMAINS = new Set([
  'students',
  'lessons',
  'attendance',
  'surveys',
  'diagnoses'
]);

export default async function CohortLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ cohortId: string }>;
}) {
  const { cohortId } = await params;
  const operator = await getOperator();

  if (operator?.role === 'assistant') {
    const visible = new Set(await getVisibleCohortIds(operator));
    if (!visible.has(cohortId)) {
      redirect('/dashboard/cohorts');
    }

    // path segment 검사: /dashboard/cohorts/[cohortId]/[domain]/...
    const h = await headers();
    const pathname = h.get('x-pathname') ?? '';
    const segments = pathname.split('/').filter(Boolean);
    // 0:dashboard 1:cohorts 2:[cohortId] 3:[domain]
    const domain = segments[3];
    if (domain && !ASSISTANT_ALLOWED_DOMAINS.has(domain)) {
      redirect(`/dashboard/cohorts/${cohortId}`);
    }
  }

  return <>{children}</>;
}

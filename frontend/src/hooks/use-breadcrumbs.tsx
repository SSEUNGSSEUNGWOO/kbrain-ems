'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

type BreadcrumbItem = {
  title: string;
  link: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: '대시보드',
  cohorts: '교육과정',
  students: '인원관리',
  attendance: '출결',
  recruitment: '모집',
  selection: '선발',
  assignments: '과제',
  completion: '수료',
  certification: '인증',
  lessons: '수업관리',
  instructors: '강사·강사료',
  surveys: '만족도',
  diagnoses: '사전·사후 진단',
  reports: '결과보고서',
  notifications: '알림 발송',
  applicants: '지원자 관리',
  operators: '운영자 관리',
  risks: '리스크',
  issues: '이슈',
  evaluators: '평가위원',
  'kpi-dashboard': '사업 KPI'
};

export function useBreadcrumbs() {
  const pathname = usePathname();
  const [cohortName, setCohortName] = useState<string | null>(null);
  const [sessionTitle, setSessionTitle] = useState<string | null>(null);

  const { cohortId, sessionId } = useMemo(() => {
    const segs = pathname.split('/').filter(Boolean);
    const ci = segs.findIndex((s) => s === 'cohorts') + 1;
    const cohortId = ci > 0 && UUID_RE.test(segs[ci] ?? '') ? segs[ci] : null;
    const si = segs.findIndex((s) => s === 'attendance') + 1;
    const sessionId = si > 0 && UUID_RE.test(segs[si] ?? '') ? segs[si] : null;
    return { cohortId, sessionId };
  }, [pathname]);

  useEffect(() => {
    if (!cohortId) { setCohortName(null); return; }
    fetch(`/api/cohort-name?id=${cohortId}`)
      .then((res) => res.json())
      .then((data) => setCohortName(data.name ?? null))
      .catch(() => setCohortName(null));
  }, [cohortId]);

  useEffect(() => {
    if (!sessionId) { setSessionTitle(null); return; }
    fetch(`/api/session-title?id=${sessionId}`)
      .then((res) => res.json())
      .then((data) => setSessionTitle(data.title ?? null))
      .catch(() => setSessionTitle(null));
  }, [sessionId]);

  return useMemo(() => {
    const segs = pathname.split('/').filter(Boolean);
    return segs.map((seg, i) => {
      const path = `/${segs.slice(0, i + 1).join('/')}`;
      let title: string;
      if (UUID_RE.test(seg)) {
        if (segs[i - 1] === 'cohorts') title = cohortName ?? '...';
        else if (segs[i - 1] === 'attendance') title = sessionTitle ?? '...';
        else title = '...';
      } else if (seg === 'dashboard' && segs[i - 2] === 'cohorts' && UUID_RE.test(segs[i - 1] ?? '')) {
        // cohort-scoped /dashboard/cohorts/[id]/dashboard 는 운영자 대시보드와 구분
        title = '누적 통계';
      } else {
        title = SEGMENT_LABELS[seg] ?? seg;
      }
      return { title, link: path };
    });
  }, [pathname, cohortName, sessionTitle]);
}

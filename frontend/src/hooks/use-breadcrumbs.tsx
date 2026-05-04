'use client';

import { createClient } from '@/lib/supabase/client';
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
  students: '인원 관리',
  attendance: '출결',
  recruitment: '모집',
  selection: '선발',
  assignments: '과제',
  completion: '수료',
  certification: '인증'
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
    const supabase = createClient();
    supabase.from('cohorts').select('name').eq('id', cohortId).single()
      .then(({ data }) => setCohortName(data?.name ?? null));
  }, [cohortId]);

  useEffect(() => {
    if (!sessionId) { setSessionTitle(null); return; }
    const supabase = createClient();
    supabase.from('sessions').select('session_date, title').eq('id', sessionId).single()
      .then(({ data }) => {
        if (!data) return;
        setSessionTitle(data.title ?? data.session_date);
      });
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
      } else {
        title = SEGMENT_LABELS[seg] ?? seg;
      }
      return { title, link: path };
    });
  }, [pathname, cohortName, sessionTitle]);
}

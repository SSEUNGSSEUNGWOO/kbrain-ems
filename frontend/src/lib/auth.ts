import { createClient, createAdminClient } from '@/lib/supabase/server';

export type OperatorRole = 'developer' | 'head' | 'viewer' | 'assistant';

export type Operator = {
  id: string;
  name: string;
  role: OperatorRole;
  title: string;
  cohort_order: string[];
  instructor_id: string | null;
};

/**
 * 현재 로그인한 Supabase Auth 사용자에 매핑된 operators row를 반환.
 * /lock에서 signInWithPassword로 발급된 세션 쿠키를 기반으로 동작.
 */
export async function getOperator(): Promise<Operator | null> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;

  // RLS 미적용 단계라 admin client로 조회 (operators는 운영자 정보, 운영자만 접근)
  const admin = createAdminClient();
  const { data } = await admin
    .from('operators')
    .select('id, name, role, title, cohort_order, instructor_id')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    role: data.role as OperatorRole,
    title: data.title ?? '',
    cohort_order: data.cohort_order ?? [],
    instructor_id: data.instructor_id ?? null
  };
}

/**
 * 권한 게이트. viewer·assistant를 제외한 모든 운영자에게 CRUD·관리 권한을 부여한다.
 * viewer는 개인정보 마스킹 + 변경 액션 차단. assistant는 배정 cohort만 읽기 전용.
 */
export async function isDeveloper(): Promise<boolean> {
  const op = await getOperator();
  return op !== null && op.role !== 'viewer' && op.role !== 'assistant';
}

/**
 * viewer 권한 여부. 개인정보(휴대폰·이메일)를 UI에서 가리는 데 사용.
 * 본인 화면에서는 '운영자'로 표시되어 구분되지 않는다.
 */
export async function isViewer(): Promise<boolean> {
  const op = await getOperator();
  return op?.role === 'viewer';
}

/**
 * 보조강사 여부. 사이드바·라우트 가드에서 시야 필터링에 사용.
 */
export async function isAssistant(): Promise<boolean> {
  const op = await getOperator();
  return op?.role === 'assistant';
}

/**
 * 보조강사가 접근 가능한 cohort_id 집합을 반환.
 * 두 배정 소스의 union:
 *   1. session_instructors (role='sub') → sessions.cohort_id  (회차 배정)
 *   2. cohort_self_study_assignments.cohort_id                (셀프스터디 배정)
 * assistant가 아니거나 instructor_id 매핑이 없으면 빈 배열.
 */
export async function getVisibleCohortIds(op: Operator): Promise<string[]> {
  if (op.role !== 'assistant' || !op.instructor_id) return [];

  const admin = createAdminClient();
  const ids = new Set<string>();

  // 1) 회차 배정: session_instructors → sessions.cohort_id
  const { data: links } = await admin
    .from('session_instructors')
    .select('session_id')
    .eq('instructor_id', op.instructor_id);
  const sessionIds = (links ?? []).map((r) => r.session_id);
  if (sessionIds.length > 0) {
    const { data: sessions } = await admin
      .from('sessions')
      .select('cohort_id')
      .in('id', sessionIds);
    for (const s of sessions ?? []) {
      if (s.cohort_id) ids.add(s.cohort_id);
    }
  }

  // 2) 셀프스터디 배정: cohort_self_study_assignments.cohort_id
  const { data: selfAsg } = await admin
    .from('cohort_self_study_assignments')
    .select('cohort_id')
    .eq('instructor_id', op.instructor_id);
  for (const a of selfAsg ?? []) {
    if (a.cohort_id) ids.add(a.cohort_id);
  }

  return [...ids];
}

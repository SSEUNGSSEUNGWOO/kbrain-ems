import { createClient, createAdminClient } from '@/lib/supabase/server';

export type OperatorRole = 'developer' | 'operator';

export type Operator = {
  id: string;
  name: string;
  role: OperatorRole;
  title: string;
  cohort_order: string[];
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
    .select('id, name, role, title, cohort_order')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    role: data.role as OperatorRole,
    title: data.title ?? '',
    cohort_order: data.cohort_order ?? []
  };
}

export async function isDeveloper(): Promise<boolean> {
  const op = await getOperator();
  return op?.role === 'developer';
}

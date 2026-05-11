import { redirect } from 'next/navigation';
import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { getOperator } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PasswordChangeForm } from './_components/password-change-form';

const ROLE_LABEL: Record<string, string> = {
  developer: '개발자',
  operator: '운영자'
};

const ROLE_CLASS: Record<string, string> = {
  developer:
    'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300',
  operator:
    'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
};

export default async function AccountPage() {
  const operator = await getOperator();
  if (!operator) redirect('/lock');

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  return (
    <PageContainer
      pageTitle='개인 설정'
      pageDescription='본인 정보를 확인하고 비밀번호를 변경합니다.'
    >
      <div className='grid max-w-2xl gap-6'>
        <section className='rounded-xl border bg-card px-6 py-5'>
          <h2 className='mb-4 text-base font-semibold'>본인 정보</h2>
          <dl className='grid grid-cols-[8rem_1fr] gap-y-3 text-sm'>
            <dt className='text-muted-foreground'>이름</dt>
            <dd className='font-medium'>{operator.name}</dd>
            <dt className='text-muted-foreground'>이메일</dt>
            <dd className='font-mono text-xs'>{user?.email ?? '-'}</dd>
            <dt className='text-muted-foreground'>직급</dt>
            <dd>{operator.title || '-'}</dd>
            <dt className='text-muted-foreground'>권한</dt>
            <dd>
              <Badge variant='outline' className={ROLE_CLASS[operator.role] ?? ''}>
                {ROLE_LABEL[operator.role] ?? operator.role}
              </Badge>
            </dd>
          </dl>
          <p className='mt-4 text-xs text-muted-foreground'>
            이름·직급·권한·이메일을 변경하려면 개발자에게 문의해주세요.
          </p>
        </section>

        <section className='rounded-xl border bg-card px-6 py-5'>
          <h2 className='mb-1 text-base font-semibold'>비밀번호 변경</h2>
          <p className='mb-4 text-xs text-muted-foreground'>
            현재 비밀번호를 확인 후 새 비밀번호로 변경합니다.
          </p>
          <PasswordChangeForm email={user?.email ?? ''} />
        </section>
      </div>
    </PageContainer>
  );
}

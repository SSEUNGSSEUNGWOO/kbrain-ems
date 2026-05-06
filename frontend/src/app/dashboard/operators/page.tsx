import { redirect } from 'next/navigation';
import PageContainer from '@/components/layout/page-container';
import { isDeveloper } from '@/lib/auth';
import { OperatorTable } from './_components/operator-table';

export default async function OperatorsPage() {
  const dev = await isDeveloper();
  if (!dev) redirect('/dashboard/overview');

  return (
    <PageContainer
      pageTitle='운영자 관리'
      pageDescription='시스템 접근 가능한 운영자를 관리합니다.'
    >
      <OperatorTable />
    </PageContainer>
  );
}

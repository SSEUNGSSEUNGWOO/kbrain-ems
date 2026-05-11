type Props = {
  params: Promise<{ token: string }>;
};

export default async function DiagnosisResponsePage({ params }: Props) {
  const { token } = await params;

  // TODO: diagnosis_responses.token 으로 응답 row 조회
  // TODO: 만료·중복 제출 검증
  // TODO: 사전·사후 문항 렌더링 + 점수 계산 + 제출

  return (
    <main className='mx-auto max-w-2xl px-4 py-12'>
      <h1 className='text-2xl font-bold'>역량 진단</h1>
      <p className='mt-2 text-sm text-muted-foreground'>토큰: {token}</p>
      <div className='mt-8 text-muted-foreground'>준비 중입니다.</div>
    </main>
  );
}

import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { createAdminClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';

type Props = {
  params: Promise<{ cohortId: string; surveyId: string }>;
};

const LIKERT5_LABELS = ['매우 불만족', '불만족', '보통', '만족', '매우 만족'] as const;

export default async function SurveyPreviewPage({ params }: Props) {
  const { cohortId, surveyId } = await params;
  const supabase = createAdminClient();

  const [surveyRes, questionsRes] = await Promise.all([
    supabase.from('surveys').select('id, title, share_code').eq('id', surveyId).maybeSingle(),
    supabase
      .from('survey_questions')
      .select('id, question_no, type, text, required, section_no, section_title, instructor_id, options')
      .eq('survey_id', surveyId)
      .order('question_no', { ascending: true })
  ]);

  if (!surveyRes.data || !questionsRes.data) notFound();

  const survey = surveyRes.data;
  const questions = questionsRes.data;

  // 섹션별 그룹
  type Q = (typeof questions)[number];
  const sections = new Map<number, { title: string | null; items: Q[] }>();
  for (const q of questions) {
    const key = q.section_no ?? 0;
    const entry = sections.get(key) ?? { title: q.section_title, items: [] };
    entry.items.push(q);
    sections.set(key, entry);
  }
  const sectionList = Array.from(sections.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([no, v]) => ({ no, ...v }));

  // follow-up 매핑 (text 문항이 직전 likert 문항에 묶이는지)
  const followUpMap = new Map<string, string>();
  let prevScale: Q | null = null;
  for (const q of questions) {
    if (q.type === 'likert5') {
      prevScale = q;
    } else if (q.type === 'text' && prevScale) {
      if (prevScale.section_no === q.section_no && prevScale.instructor_id === q.instructor_id) {
        followUpMap.set(q.id, prevScale.id);
      }
      prevScale = null;
    } else {
      prevScale = null;
    }
  }

  return (
    <PageContainer
      pageTitle='설문 미리보기'
      pageDescription={survey.title}
      pageHeaderAction={
        <Link href={`/dashboard/cohorts/${cohortId}/surveys`}>
          <Button variant='outline'>← 설문 목록</Button>
        </Link>
      }
    >
      <div className='max-w-2xl space-y-5'>
        <div className='rounded-lg border bg-blue-50/50 px-4 py-3 text-sm text-blue-900 dark:bg-blue-900/20 dark:text-blue-100'>
          <strong>미리보기 모드</strong> · 응답자에게 표시되는 모습. 입력 비활성, 사유 문항은 모두 노출.
        </div>

        {sectionList.map((section) => (
          <section key={section.no} className='rounded-xl border bg-card shadow-sm'>
            {section.title && (
              <div className='border-b bg-muted/40 px-6 py-3'>
                <h2 className='text-sm font-bold'>
                  <span className='text-blue-600'>{section.no}.</span> {section.title}
                </h2>
              </div>
            )}
            <div className='space-y-5 px-6 py-5'>
              {section.items.map((q) => {
                const isFollowUp = followUpMap.has(q.id);

                if (q.type === 'likert5') {
                  return (
                    <div key={q.id}>
                      <div className='flex items-baseline gap-2'>
                        <span className='text-xs font-semibold text-muted-foreground'>Q{q.question_no}</span>
                        <label className='flex-1 text-sm font-medium'>
                          {q.text}
                          {q.required && <span className='ml-1 text-red-500'>*</span>}
                        </label>
                      </div>
                      <div className='mt-2 grid grid-cols-5 gap-1.5 sm:gap-2'>
                        {LIKERT5_LABELS.map((label, i) => (
                          <div
                            key={i}
                            className='flex flex-col items-center gap-0.5 rounded-lg border border-slate-200 bg-white px-1 py-1.5 text-center text-slate-400 sm:gap-1 sm:px-2 sm:py-2'
                            style={{ wordBreak: 'keep-all' }}
                          >
                            <span className='text-sm font-bold tabular-nums sm:text-base'>{i + 1}</span>
                            <span className='text-[10px] leading-[1.15] text-slate-500 sm:text-[11px]'>
                              {label}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }

                if (q.type === 'text') {
                  return (
                    <div
                      key={q.id}
                      className={
                        isFollowUp ? 'rounded-lg bg-amber-50/40 p-4 ring-1 ring-amber-100 dark:bg-amber-900/10' : ''
                      }
                    >
                      <div className='flex items-baseline gap-2'>
                        <span className='text-xs font-semibold text-muted-foreground'>Q{q.question_no}</span>
                        <label className='flex-1 text-sm font-medium'>
                          {isFollowUp && <span className='mr-1 text-amber-600'>↳</span>}
                          {q.text}
                          {q.required && <span className='ml-1 text-red-500'>*</span>}
                        </label>
                      </div>
                      <textarea
                        rows={isFollowUp ? 2 : 3}
                        disabled
                        placeholder={
                          isFollowUp
                            ? '척도 2(불만족) 이하일 때만 노출 — 어떤 점이 아쉬우셨나요?'
                            : '자유롭게 작성해 주세요'
                        }
                        className='mt-2 w-full resize-none rounded-md border bg-muted/30 px-3 py-2 text-sm'
                      />
                      {isFollowUp && (
                        <p className='mt-1 text-[11px] text-amber-700 dark:text-amber-400'>
                          조건부 — 위 척도 점수가 2(불만족) 이하일 때만 응답자에게 표시됨
                        </p>
                      )}
                    </div>
                  );
                }

                return null;
              })}
            </div>
          </section>
        ))}

        <div className='rounded-xl border bg-muted/30 px-6 py-3 text-center text-xs text-muted-foreground'>
          미리보기 — 응답자에게는 하단에 "제출하기" 버튼이 표시됩니다.
        </div>
      </div>
    </PageContainer>
  );
}

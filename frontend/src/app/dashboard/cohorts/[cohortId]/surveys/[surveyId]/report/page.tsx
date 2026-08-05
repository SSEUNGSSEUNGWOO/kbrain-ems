import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { PrintButton } from '@/components/print-button';
import { createAdminClient } from '@/lib/supabase/server';
import { loadSurveyReportStats } from '@/lib/reports/survey-report-stats';
import type { SurveyReportSummary } from '@/lib/reports/generate-survey-report';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ResultsView } from '../results/_components/results-view';
import { GenerateSummaryButton } from './_components/generate-summary-button';

type Props = { params: Promise<{ cohortId: string; surveyId: string }> };

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
const circled = (no: number): string => CIRCLED[no - 1] ?? `${no}.`;

const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
};

function SectionHeading({ no, title }: { no: number; title: string }) {
  return (
    <div className='flex items-stretch bg-[#1f3864] text-white'>
      <span className='flex w-9 shrink-0 items-center justify-center border-r border-white/25 text-sm font-bold'>
        {no}
      </span>
      <span className='px-3 py-1.5 text-sm font-bold'>{title}</span>
    </div>
  );
}

function ScoreBar({ avg, accent }: { avg: number | null; accent: boolean }) {
  const pct = avg === null ? 0 : (avg / 10) * 100;
  return (
    <div className='h-2.5 flex-1 rounded-sm bg-slate-100'>
      <div
        className={`h-full rounded-sm ${accent ? 'bg-emerald-600' : 'bg-[#1f3864]'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default async function SurveyReportPage({ params }: Props) {
  const { cohortId, surveyId } = await params;
  const supabase = createAdminClient();

  const { data: surveyRow } = await supabase
    .from('surveys')
    .select('id, cohort_id, additional_cohort_ids, report_summary')
    .eq('id', surveyId)
    .maybeSingle();
  if (!surveyRow) notFound();

  const stats = await loadSurveyReportStats(cohortId, surveyId);
  if (!stats) notFound();

  const summary = surveyRow.report_summary as unknown as SurveyReportSummary | null;
  const issuedDate = fmtDate(summary?.generated_at ?? new Date().toISOString());
  const instructorLabel = stats.instructorNames.join(', ') || '—';
  const overall = stats.overallAvg;

  return (
    <>
      {/* 인쇄 전용 CSS — 사이드바·헤더·버튼 숨기고 print-area만 A4로 인쇄 */}
      <style>{`
        @media print {
          @page { size: A4; margin: 14mm 12mm; }
          html, body { background: white !important; }
          body * { visibility: hidden; }
          #survey-report-print-area, #survey-report-print-area * { visibility: visible; }
          #survey-report-print-area {
            position: absolute; inset: 0; width: 100%;
            padding: 0; margin: 0; background: white;
          }
          #survey-report-print-area * {
            box-shadow: none !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .no-print { display: none !important; }
          #survey-report-print-area .print-avoid-break,
          #survey-report-print-area svg,
          #survey-report-print-area table { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>
      <PageContainer
        pageTitle='만족도 결과보고서'
        pageDescription={`${stats.cohortName} · ${stats.surveyTitle}`}
        pageHeaderAction={
          <div className='no-print flex items-center gap-2'>
            <GenerateSummaryButton cohortId={cohortId} surveyId={surveyId} hasSummary={!!summary} />
            <PrintButton />
            <Button variant='outline' size='sm' asChild>
              <Link href={`/dashboard/cohorts/${cohortId}/surveys/${surveyId}/results`}>
                결과 페이지
              </Link>
            </Button>
            <Button variant='outline' size='sm' asChild>
              <Link href={`/dashboard/cohorts/${cohortId}/surveys`}>← 목록</Link>
            </Button>
          </div>
        }
      >
        <div id='survey-report-print-area' className='max-w-4xl space-y-6 print:max-w-none'>
          {/* ── 파트 1. 요약 보고서 ────────────────────────────────── */}
          <div className='rounded-xl border bg-white p-6 text-slate-900 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none print:break-after-page'>
            {/* 표제 */}
            <div className='pb-4 text-center'>
              <h1 className='text-xl font-black tracking-tight'>교육 만족도 조사 결과보고서</h1>
              <p className='mt-1 text-sm'>
                <span className='font-bold'>{stats.cohortName}</span>{' '}
                <span className='text-xs text-slate-400'>
                  발행 {issuedDate} · 담당 강사 {instructorLabel}
                </span>
              </p>
            </div>
            <div className='mb-4 border-b-2 border-[#1f3864] pb-1 text-sm font-bold text-[#1f3864]'>
              파트 1. 요약 보고서
            </div>

            {/* 1. 조사 개요 */}
            <div className='print-avoid-break'>
              <SectionHeading no={1} title='조사 개요' />
              <table className='w-full border-collapse text-sm'>
                <tbody>
                  {[
                    [
                      '조사 대상',
                      `${stats.cohortName} 수강생 ${stats.totalStudents}명`,
                      '조사 방식',
                      '온라인 설문 (10점 척도 및 서술형)'
                    ],
                    [
                      '응답 현황',
                      `${stats.submittedCount}명 응답 (응답률 ${stats.responseRate}%) · 척도 응답 ${stats.scaleResponseCount}건`,
                      '교육 형태',
                      stats.deliveryMethod ?? '—'
                    ],
                    ['담당 강사', instructorLabel, '보고서 발행', issuedDate]
                  ].map(([k1, v1, k2, v2]) => (
                    <tr key={k1} className='border-b border-slate-200'>
                      <td className='w-24 border-x border-slate-200 bg-slate-50 px-3 py-2 font-semibold'>
                        {k1}
                      </td>
                      <td className='border-r border-slate-200 px-3 py-2'>{v1}</td>
                      <td className='w-24 border-r border-slate-200 bg-slate-50 px-3 py-2 font-semibold'>
                        {k2}
                      </td>
                      <td className='border-r border-slate-200 px-3 py-2'>{v2}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 2. 종합 만족도 점수 */}
            <div className='print-avoid-break mt-5'>
              <SectionHeading no={2} title='종합 만족도 점수' />
              <div className='mt-2 grid grid-cols-3 gap-2'>
                <div className='bg-[#1f3864] px-3 py-3 text-center text-white'>
                  <div className='text-[11px] font-semibold opacity-90'>
                    종합 만족도 ({stats.likertQuestionCount}개 문항 평균)
                  </div>
                  <div className='mt-0.5 text-2xl font-bold tabular-nums'>
                    {overall !== null ? overall.toFixed(2) : '—'}
                    <span className='text-sm font-normal opacity-80'> / 10</span>
                  </div>
                  <div className='text-[11px] opacity-80'>
                    {overall !== null ? `100점 환산 ${(overall * 10).toFixed(1)}점` : ''}
                  </div>
                </div>
                <div className='bg-emerald-700 px-3 py-3 text-center text-white'>
                  <div className='text-[11px] font-semibold opacity-90'>
                    추천 의향{stats.recommend ? ` (Q${stats.recommend.questionNo})` : ''}
                  </div>
                  <div className='mt-0.5 text-2xl font-bold tabular-nums'>
                    {stats.recommend?.avg != null ? stats.recommend.avg.toFixed(2) : '—'}
                    <span className='text-sm font-normal opacity-80'> / 10</span>
                  </div>
                  <div className='text-[11px] opacity-80'>
                    {stats.recommend
                      ? `10점 응답 ${stats.recommend.topCount}명(${stats.recommend.topPct}%)`
                      : ''}
                  </div>
                </div>
                <div className='bg-[#2f4f7f] px-3 py-3 text-center text-white'>
                  <div className='text-[11px] font-semibold opacity-90'>설문 응답률</div>
                  <div className='mt-0.5 text-2xl font-bold tabular-nums'>
                    {stats.responseRate}
                    <span className='text-sm font-normal opacity-80'> %</span>
                  </div>
                  <div className='text-[11px] opacity-80'>
                    {stats.submittedCount}명 / {stats.totalStudents}명 제출
                  </div>
                </div>
              </div>
              <div className='mt-3 space-y-1.5'>
                {stats.sections.map((s) => {
                  const accent = s.avg !== null && s.avg >= 9;
                  return (
                    <div
                      key={s.sectionNo}
                      className='flex items-center gap-3 border border-slate-200 px-3 py-1.5 text-sm'
                    >
                      <span
                        className={`w-44 shrink-0 truncate font-semibold ${accent ? 'text-emerald-700' : ''}`}
                      >
                        {circled(s.sectionNo)}{' '}
                        {s.instructorName
                          ? `${s.title.split('(')[0].trim()}(${s.instructorName})`
                          : s.title}
                      </span>
                      <ScoreBar avg={s.avg} accent={accent} />
                      <span
                        className={`w-12 shrink-0 text-right font-bold tabular-nums ${accent ? 'text-emerald-700' : 'text-[#1f3864]'}`}
                      >
                        {s.avg !== null ? s.avg.toFixed(2) : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {summary ? (
              <>
                {/* 3. 주요 성과 */}
                <div className='print-avoid-break mt-5'>
                  <SectionHeading no={3} title='주요 성과 (Positive Key Findings)' />
                  <ul className='mt-2 space-y-2 text-sm leading-relaxed'>
                    {summary.key_findings.map((f) => (
                      <li key={f.title}>
                        <span className='mr-1 text-[#1f3864]'>▪</span>
                        <span className='font-bold'>{f.title}</span> : {f.body}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* 4. 주관식 의견 종합 요약 */}
                <div className='print-avoid-break mt-5'>
                  <SectionHeading no={4} title='주관식 의견 종합 요약' />
                  <div className='mt-2 space-y-3 text-sm leading-relaxed'>
                    <div>
                      <div className='font-bold'>
                        [긍정 의견]{' '}
                        <span className='text-xs font-medium text-slate-400'>
                          {summary.positive_tags.map((t) => `#${t}`).join(' ')}
                        </span>
                      </div>
                      <ul className='mt-1 space-y-0.5'>
                        {summary.positive_bullets.map((b) => (
                          <li key={b}>－ {b}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className='font-bold'>
                        [건설적 제언]{' '}
                        <span className='text-xs font-medium text-slate-400'>
                          {summary.suggestion_tags.map((t) => `#${t}`).join(' ')}
                        </span>
                      </div>
                      <ul className='mt-1 space-y-0.5'>
                        {summary.suggestion_bullets.map((b) => (
                          <li key={b}>－ {b}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>

                {/* 5. 향후 개선 방향 */}
                <div className='print-avoid-break mt-5'>
                  <SectionHeading no={5} title='향후 개선 방향 (차기 과정 반영 사항)' />
                  <ol className='mt-2 space-y-1.5 text-sm leading-relaxed'>
                    {summary.improvements.map((f, i) => (
                      <li key={f.title}>
                        <span className='font-bold'>
                          {i + 1}. {f.title}
                        </span>{' '}
                        : {f.body}
                      </li>
                    ))}
                  </ol>
                </div>
              </>
            ) : (
              <div className='no-print mt-5 rounded-lg border border-dashed px-4 py-6 text-center text-sm text-slate-500'>
                주요 성과·주관식 요약·개선 방향은 아직 생성되지 않았습니다. 우측 상단{' '}
                <span className='font-semibold'>AI 요약 생성</span> 버튼을 눌러주세요.
              </div>
            )}
          </div>

          {/* ── 파트 2. 붙임 — 세부 분석 ──────────────────────────── */}
          <div>
            <div className='mb-3 border-b-2 border-[#1f3864] pb-1 text-sm font-bold text-[#1f3864]'>
              파트 2. 붙임 — 세부 분석 내용
            </div>
            <ResultsView cohortId={cohortId} surveyId={surveyId} canDelete={false} hideKpi />
          </div>

          {/* 개선 참고 의견 (파트2 말미) */}
          {summary && summary.minor_feedback.length > 0 && (
            <div className='print-avoid-break rounded-xl border bg-card px-6 py-5 shadow-sm print:rounded-none print:border-0 print:px-0 print:py-2 print:shadow-none'>
              <h2 className='mb-1 text-sm font-bold'>개선 참고 의견</h2>
              <p className='text-muted-foreground mb-3 text-xs'>
                척도 응답은 대부분 상위 점수에 분포함. 아래는 향후 운영 개선을 위한 소수 참고 의견을
                건설적 표현으로 정리한 것임.
              </p>
              <ul className='space-y-1 rounded-md border bg-muted/30 px-4 py-3 text-sm'>
                {summary.minor_feedback.map((b) => (
                  <li key={b}>· {b}</li>
                ))}
              </ul>
            </div>
          )}

          <p className='text-muted-foreground pb-4 text-[11px]'>
            본 보고서는 응답자 익명 원칙에 따라 개인 식별 정보를 포함하지 않습니다.
          </p>
        </div>
      </PageContainer>
    </>
  );
}

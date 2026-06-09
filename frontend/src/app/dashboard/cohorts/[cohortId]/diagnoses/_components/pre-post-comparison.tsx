// 사전(pre) · 사후(post) 진단 비교 분석.
// page.tsx 가 pre/post 둘 다 있는 경우에만 렌더링.
// short_text(주관식) 문항은 options.correct 가 비어 있어 자동 채점 불가 — 표에서 제외하고
// total_score 만 활용. 객관식·OX(16문항)는 문항별 정답률 비교 표시.

import { PrePostCharts } from './pre-post-charts';

type Response = {
  id: string;
  student_id: string | null;
  submitted_at: string | null;
  total_score: number | null;
  responses: Record<string, string> | null;
  students: { name: string } | null;
};

type Question = {
  id: string;
  question_no: number;
  type: string;
  text: string;
  options: Record<string, unknown> | null;
  weight: string | null;
};

type Props = {
  preResponses: Response[];
  postResponses: Response[];
  questions: Question[];
};

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function stdev(nums: number[]): number {
  if (nums.length < 2) return 0;
  const m = avg(nums);
  const variance = nums.reduce((s, x) => s + (x - m) ** 2, 0) / (nums.length - 1);
  return Math.sqrt(variance);
}

type AnswerOpts = { correct?: string; correct_keywords?: string[] };

// submit RPC 와 동일한 채점 규칙 — short_text 는 correct_keywords 어느 하나라도 부분 포함하면 정답.
function isAnswerCorrect(answer: string, opts: AnswerOpts): boolean {
  const a = answer.trim();
  if (!a) return false;
  if (opts.correct && a === opts.correct) return true;
  const kws = opts.correct_keywords ?? [];
  if (kws.length > 0) {
    const lower = a.toLowerCase();
    for (const kw of kws) {
      if (kw && lower.includes(kw.trim().toLowerCase())) return true;
    }
  }
  return false;
}

function correctRate(
  responses: Response[],
  questionNo: number,
  opts: AnswerOpts
): { correct: number; total: number; rate: number } {
  let correct = 0;
  let total = 0;
  for (const r of responses) {
    if (!r.submitted_at) continue;
    const ans = r.responses?.[String(questionNo)];
    if (ans == null || ans === '') continue;
    total++;
    if (isAnswerCorrect(String(ans), opts)) correct++;
  }
  return { correct, total, rate: total > 0 ? (correct / total) * 100 : 0 };
}

export function PrePostComparison({ preResponses, postResponses, questions }: Props) {
  const preSubmitted = preResponses.filter((r) => r.submitted_at);
  const postSubmitted = postResponses.filter((r) => r.submitted_at);

  // 점수 요약 (전체)
  const preScores = preSubmitted.map((r) => Number(r.total_score ?? 0));
  const postScores = postSubmitted.map((r) => Number(r.total_score ?? 0));
  const preAvg = avg(preScores);
  const postAvg = avg(postScores);
  const preStd = stdev(preScores);
  const postStd = stdev(postScores);
  const delta = postAvg - preAvg;

  // paired (pre · post 둘 다 응답한 학생)
  type Paired = {
    studentId: string;
    name: string;
    pre: number;
    post: number;
    delta: number;
  };
  const preByStudent = new Map<string, Response>();
  for (const r of preSubmitted) {
    if (r.student_id) preByStudent.set(r.student_id, r);
  }
  const paired: Paired[] = [];
  for (const r of postSubmitted) {
    if (!r.student_id) continue;
    const pre = preByStudent.get(r.student_id);
    if (!pre) continue;
    paired.push({
      studentId: r.student_id,
      name: r.students?.name ?? '(미지정)',
      pre: Number(pre.total_score ?? 0),
      post: Number(r.total_score ?? 0),
      delta: Number(r.total_score ?? 0) - Number(pre.total_score ?? 0)
    });
  }
  paired.sort((a, b) => b.delta - a.delta);
  const pairedAvgDelta = paired.length > 0 ? avg(paired.map((p) => p.delta)) : 0;
  const improvedCount = paired.filter((p) => p.delta > 0).length;
  const declinedCount = paired.filter((p) => p.delta < 0).length;
  const sameCount = paired.filter((p) => p.delta === 0).length;

  // 문항별 정답률 비교 (객관식·OX 만 — options.correct 있는 문항)
  type QuestionStat = {
    no: number;
    text: string;
    type: string;
    preRate: number;
    postRate: number;
    preN: number;
    postN: number;
    deltaRate: number;
  };
  const questionStats: QuestionStat[] = [];
  for (const q of questions) {
    const opts = (q.options as AnswerOpts | null) ?? {};
    const hasGrading = !!opts.correct || (opts.correct_keywords?.length ?? 0) > 0;
    if (!hasGrading) continue; // 정답 정의 안 된 문항만 제외
    const pre = correctRate(preSubmitted, q.question_no, opts);
    const post = correctRate(postSubmitted, q.question_no, opts);
    questionStats.push({
      no: q.question_no,
      text: q.text,
      type: q.type,
      preRate: pre.rate,
      postRate: post.rate,
      preN: pre.total,
      postN: post.total,
      deltaRate: post.rate - pre.rate
    });
  }
  questionStats.sort((a, b) => a.no - b.no);
  const sortedByDelta = [...questionStats].sort((a, b) => b.deltaRate - a.deltaRate);
  const topGains = sortedByDelta.slice(0, 3);
  const topDeclines = sortedByDelta.filter((q) => q.deltaRate < 0).slice(-3).reverse();

  // 점수 분포 히스토그램 — 10점 구간 (0~9, 10~19, ..., 90~100). 100점은 마지막 bin 포함.
  const bins = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const histogram = bins.slice(0, -1).map((lo, i) => {
    const hi = bins[i + 1];
    const isLast = i === bins.length - 2;
    const inRange = (v: number) => (isLast ? v >= lo && v <= hi : v >= lo && v < hi);
    return {
      range: isLast ? `${lo}~${hi}` : `${lo}~${hi - 1}`,
      pre: preScores.filter(inRange).length,
      post: postScores.filter(inRange).length
    };
  });

  const pairedPoints = paired.map((p) => ({
    name: p.name,
    pre: p.pre,
    post: p.post,
    delta: p.delta
  }));

  return (
    <section className='rounded-2xl border bg-white p-6 shadow-sm'>
      <header className='mb-5'>
        <h2 className='text-lg font-bold text-slate-900'>사전 → 사후 비교 분석</h2>
        <p className='mt-1 text-xs text-slate-500'>
          전체 점수 변화는 응답한 모든 학생 기준, 개인별 변화는 두 진단 모두 응답한 학생 기준입니다.
        </p>
      </header>

      {/* 1) 점수 요약 */}
      <div className='mb-6 grid grid-cols-2 gap-4 md:grid-cols-4'>
        <Stat label='사전 평균' value={`${preAvg.toFixed(1)}점`} sub={`σ ${preStd.toFixed(1)} · n=${preScores.length}`} tone='text-blue-700' />
        <Stat label='사후 평균' value={`${postAvg.toFixed(1)}점`} sub={`σ ${postStd.toFixed(1)} · n=${postScores.length}`} tone='text-emerald-700' />
        <Stat
          label='평균 향상폭'
          value={`${delta >= 0 ? '+' : ''}${delta.toFixed(1)}점`}
          sub={delta >= 0 ? '학습 효과 ↑' : '하락'}
          tone={delta >= 0 ? 'text-emerald-700' : 'text-rose-700'}
        />
        <Stat
          label='paired 학생'
          value={`${paired.length}명`}
          sub={`평균 변화 ${pairedAvgDelta >= 0 ? '+' : ''}${pairedAvgDelta.toFixed(1)}점`}
          tone='text-slate-700'
        />
      </div>

      {/* 향상/하락/동일 카운트 */}
      {paired.length > 0 && (
        <div className='mb-6 flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 px-4 py-3 text-sm'>
          <span className='font-semibold text-slate-700'>개인별 결과:</span>
          <span className='text-emerald-700'>향상 <b>{improvedCount}</b>명</span>
          <span className='text-slate-500'>변동 없음 {sameCount}명</span>
          <span className='text-rose-700'>하락 <b>{declinedCount}</b>명</span>
        </div>
      )}

      {/* 차트 — 점수 분포 히스토그램 + paired 산점도 */}
      <PrePostCharts histogram={histogram} paired={pairedPoints} />

      {/* 2) 가장 향상된 / 하락한 문항 */}
      {questionStats.length > 0 && (
        <div className='mb-6 grid grid-cols-1 gap-4 md:grid-cols-2'>
          <HighlightList
            title='가장 향상된 문항'
            items={topGains}
            tone='emerald'
          />
          <HighlightList
            title='가장 하락한 문항'
            items={topDeclines}
            tone='rose'
            emptyText='하락한 문항 없음 — 모든 문항이 유지·향상'
          />
        </div>
      )}

      {/* 3) 문항별 정답률 비교 표 (객관식·OX) */}
      {questionStats.length > 0 && (
        <div className='mb-6 overflow-hidden rounded-xl border'>
          <table className='w-full text-sm'>
            <thead className='bg-slate-50 text-xs'>
              <tr>
                <th className='px-3 py-2 text-left font-semibold text-slate-600'>#</th>
                <th className='px-3 py-2 text-left font-semibold text-slate-600'>문항</th>
                <th className='w-16 px-3 py-2 text-center font-semibold text-slate-600'>유형</th>
                <th className='w-20 px-3 py-2 text-right font-semibold text-slate-600'>사전</th>
                <th className='w-20 px-3 py-2 text-right font-semibold text-slate-600'>사후</th>
                <th className='w-20 px-3 py-2 text-right font-semibold text-slate-600'>변화</th>
              </tr>
            </thead>
            <tbody className='divide-y'>
              {questionStats.map((q) => (
                <tr key={q.no}>
                  <td className='px-3 py-2 text-slate-500 tabular-nums'>{q.no}</td>
                  <td className='px-3 py-2 text-slate-700'>{q.text}</td>
                  <td className='px-3 py-2 text-center text-xs text-slate-500'>
                    {q.type === 'multiple_choice'
                      ? '객관식'
                      : q.type === 'ox'
                        ? 'OX'
                        : q.type === 'short_text'
                          ? '주관식'
                          : q.type}
                  </td>
                  <td className='px-3 py-2 text-right text-blue-700 tabular-nums'>
                    {q.preRate.toFixed(0)}%
                    <span className='ml-1 text-[10px] text-slate-400'>({q.preN})</span>
                  </td>
                  <td className='px-3 py-2 text-right text-emerald-700 tabular-nums'>
                    {q.postRate.toFixed(0)}%
                    <span className='ml-1 text-[10px] text-slate-400'>({q.postN})</span>
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-semibold tabular-nums ${
                      q.deltaRate > 0
                        ? 'text-emerald-700'
                        : q.deltaRate < 0
                          ? 'text-rose-700'
                          : 'text-slate-400'
                    }`}
                  >
                    {q.deltaRate > 0 ? '+' : ''}
                    {q.deltaRate.toFixed(0)}%p
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 4) 개인별 변화 표 */}
      {paired.length > 0 && (
        <details className='rounded-xl border'>
          <summary className='cursor-pointer bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100'>
            개인별 점수 변화 ({paired.length}명) — 향상폭 정렬
          </summary>
          <div className='max-h-96 overflow-auto'>
            <table className='w-full text-sm'>
              <thead className='sticky top-0 bg-white text-xs'>
                <tr className='border-b'>
                  <th className='px-3 py-2 text-left font-semibold text-slate-600'>이름</th>
                  <th className='w-20 px-3 py-2 text-right font-semibold text-slate-600'>사전</th>
                  <th className='w-20 px-3 py-2 text-right font-semibold text-slate-600'>사후</th>
                  <th className='w-24 px-3 py-2 text-right font-semibold text-slate-600'>변화</th>
                </tr>
              </thead>
              <tbody className='divide-y'>
                {paired.map((p) => (
                  <tr key={p.studentId}>
                    <td className='px-3 py-2 font-medium text-slate-900'>{p.name}</td>
                    <td className='px-3 py-2 text-right text-blue-700 tabular-nums'>{p.pre}</td>
                    <td className='px-3 py-2 text-right text-emerald-700 tabular-nums'>{p.post}</td>
                    <td
                      className={`px-3 py-2 text-right font-semibold tabular-nums ${
                        p.delta > 0
                          ? 'text-emerald-700'
                          : p.delta < 0
                            ? 'text-rose-700'
                            : 'text-slate-400'
                      }`}
                    >
                      {p.delta > 0 ? '+' : ''}
                      {p.delta}점
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
  tone
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className='rounded-xl border bg-slate-50 px-4 py-3'>
      <div className='text-xs text-slate-500'>{label}</div>
      <div className={`mt-0.5 text-xl font-bold tabular-nums ${tone ?? 'text-slate-900'}`}>
        {value}
      </div>
      {sub && <div className='mt-0.5 text-[11px] text-slate-500'>{sub}</div>}
    </div>
  );
}

function HighlightList({
  title,
  items,
  tone,
  emptyText
}: {
  title: string;
  items: { no: number; text: string; deltaRate: number }[];
  tone: 'emerald' | 'rose';
  emptyText?: string;
}) {
  const accent = tone === 'emerald' ? 'text-emerald-700' : 'text-rose-700';
  const bg = tone === 'emerald' ? 'bg-emerald-50/50' : 'bg-rose-50/50';
  return (
    <div className={`rounded-xl border ${bg} p-4`}>
      <div className='mb-2 text-xs font-semibold text-slate-700'>{title}</div>
      {items.length === 0 ? (
        <div className='text-xs text-slate-500 italic'>{emptyText ?? '없음'}</div>
      ) : (
        <ul className='space-y-1.5 text-sm'>
          {items.map((q) => (
            <li key={q.no} className='flex items-start gap-2'>
              <span className='text-xs text-slate-400 tabular-nums'>Q{q.no}</span>
              <span className='flex-1 text-slate-700'>{q.text}</span>
              <span className={`shrink-0 text-xs font-semibold tabular-nums ${accent}`}>
                {q.deltaRate > 0 ? '+' : ''}
                {q.deltaRate.toFixed(0)}%p
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

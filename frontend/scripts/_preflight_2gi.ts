/**
 * 2기 시험 사전 점검 — exam 준비, 세션 상태, 시간 제한, 기존 세션 정리 대상 확인.
 */
import { createAdminClient } from '@/lib/supabase/server';

const s = createAdminClient();

// 2기 exam
const EXAM_2GI = 'ab4733ef-1902-4f55-9930-4a9990b70ffa';

const { data: exam } = await s
  .from('exams')
  .select('id, name, share_code, fullscreen_required, time_limit_mc, time_limit_st, time_limit_task, cohort_id')
  .eq('id', EXAM_2GI)
  .maybeSingle();

console.log('=== 2기 EXAM ===');
console.log(JSON.stringify(exam, null, 2));

// 문항 수·섹션별 합계
const { data: qie } = await s
  .from('exam_questions_in_exam')
  .select('question_id, exam_questions(id, type, score)')
  .eq('exam_id', EXAM_2GI);
const byType: Record<string, { count: number; totalScore: number }> = {
  multiple_choice: { count: 0, totalScore: 0 },
  short_text: { count: 0, totalScore: 0 },
  task_based: { count: 0, totalScore: 0 }
};
for (const r of (qie ?? []) as unknown as { exam_questions: { type: string; score: number } }[]) {
  const t = r.exam_questions?.type;
  if (t && byType[t]) {
    byType[t].count++;
    byType[t].totalScore += r.exam_questions.score;
  }
}
console.log('\n=== 문항 구성 ===');
for (const [k, v] of Object.entries(byType)) {
  console.log(`  ${k}: ${v.count}문항 · 합 ${v.totalScore}점`);
}
const totalMax = Object.values(byType).reduce((s, v) => s + v.totalScore, 0);
console.log(`  총 만점: ${totalMax}점`);

// 시간 제한
console.log('\n=== 섹션 시간 제한 ===');
const e = exam as unknown as { time_limit_mc?: number; time_limit_st?: number; time_limit_task?: number } | null;
console.log(`  객관식: ${(e?.time_limit_mc ?? 0) / 60}분`);
console.log(`  단답형: ${(e?.time_limit_st ?? 0) / 60}분`);
console.log(`  작업형: ${(e?.time_limit_task ?? 0) / 60}분`);

// 세션 상태
const { data: sessions } = await s
  .from('exam_sessions')
  .select('id, name, status, submitted_at, created_at')
  .eq('exam_id', EXAM_2GI)
  .order('created_at');
console.log(`\n=== 2기 EXAM 세션: ${sessions?.length ?? 0}건 ===`);
const byStatus: Record<string, number> = {};
for (const sess of sessions ?? []) {
  byStatus[sess.status] = (byStatus[sess.status] ?? 0) + 1;
}
console.log('  상태별:', byStatus);
if ((sessions?.length ?? 0) > 0) {
  console.log('  세션 리스트:');
  for (const sess of sessions ?? []) {
    console.log(`    ${sess.name?.padEnd(10)} · ${sess.status} · submitted=${sess.submitted_at ?? '-'}`);
  }
}

// rubric 확인 (T-E-036 문항)
const { data: taskQ } = await s
  .from('exam_questions')
  .select('id, code, score, correct')
  .eq('code', 'T-E-036')
  .maybeSingle();
console.log('\n=== T-E-036 rubric ===');
const rubric = ((taskQ?.correct as { rubric?: unknown[] } | null)?.rubric) ?? [];
console.log(`  문항 만점: ${taskQ?.score}점`);
console.log(`  rubric 항목: ${rubric.length}개`);

/**
 * 시험/문제은행 문항의 time_limit_seconds 일괄 설정.
 * task_based는 항상 건너뜀 (UI에서 무시).
 *
 * usage:
 *   # 특정 시험의 문항들에 유형별 시간 설정
 *   bun run scripts/set-question-timers.ts --exam=<exam_id> --mc=60 --st=90 --apply
 *
 *   # 특정 문제은행 전체
 *   bun run scripts/set-question-timers.ts --bank=<bank_id> --mc=60 --st=90 --apply
 *
 *   # null로 리셋 (시간 제한 해제)
 *   bun run scripts/set-question-timers.ts --exam=<exam_id> --clear --apply
 *
 * 옵션:
 *   --exam=<id>   시험 세트 ID (해당 시험의 문항만 대상)
 *   --bank=<id>   문제은행 ID (해당 은행 전체)
 *   --mc=<sec>    multiple_choice 문항 시간 (초)
 *   --st=<sec>    short_text 문항 시간 (초)
 *   --clear       모든 값 null (--mc, --st 무시)
 *   --apply       실제 실행 (없으면 dry-run)
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(__dirname, '../.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const APPLY = process.argv.includes('--apply');
const CLEAR = process.argv.includes('--clear');
const arg = (name: string): string | undefined => {
  const v = process.argv.find((a) => a.startsWith(`--${name}=`));
  return v?.slice(name.length + 3);
};
const numArg = (name: string): number | null => {
  const v = arg(name);
  if (v == null) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

async function collectQuestionIds(): Promise<string[]> {
  const examId = arg('exam');
  const bankId = arg('bank');
  if (examId && bankId) throw new Error('--exam과 --bank는 동시 사용 불가');

  if (examId) {
    const { data } = await s
      .from('exam_questions_in_exam')
      .select('question_id')
      .eq('exam_id', examId);
    return (data ?? []).map((r) => r.question_id);
  }
  if (bankId) {
    const { data } = await s.from('exam_questions').select('id').eq('bank_id', bankId);
    return (data ?? []).map((r) => r.id);
  }
  throw new Error('--exam=<id> 또는 --bank=<id> 필요');
}

async function main() {
  const mc = numArg('mc');
  const st = numArg('st');
  if (!CLEAR && !mc && !st) {
    throw new Error('설정할 값이 없습니다. --mc, --st 또는 --clear 지정.');
  }

  console.log(`mode: ${APPLY ? 'APPLY' : 'dry-run'}${CLEAR ? ' (CLEAR)' : ''}`);
  console.log(`  multiple_choice: ${CLEAR ? 'null' : mc != null ? `${mc}초` : '(변경 없음)'}`);
  console.log(`  short_text     : ${CLEAR ? 'null' : st != null ? `${st}초` : '(변경 없음)'}`);
  console.log(`  task_based     : (항상 건너뜀)`);

  const ids = await collectQuestionIds();
  if (ids.length === 0) {
    console.log('대상 문항 없음.');
    return;
  }

  // 유형별 카운트
  const { data: qList } = await s
    .from('exam_questions')
    .select('id, type, time_limit_seconds')
    .in('id', ids);

  const byType: Record<string, { id: string; before: number | null }[]> = {};
  for (const q of qList ?? []) {
    (byType[q.type] ??= []).push({ id: q.id, before: q.time_limit_seconds });
  }
  for (const [type, arr] of Object.entries(byType)) {
    console.log(`\n[${type}] ${arr.length}개`);
    if (type === 'task_based') {
      console.log('  → 건너뜀');
      continue;
    }
    const target = CLEAR ? null : type === 'multiple_choice' ? mc : type === 'short_text' ? st : null;
    if (target === null && !CLEAR) {
      console.log('  → 해당 유형 값 미지정, 건너뜀');
      continue;
    }
    if (!APPLY) {
      console.log(`  [dry] ${arr.length}개 → time_limit_seconds=${target}`);
      continue;
    }
    const { error } = await s
      .from('exam_questions')
      .update({ time_limit_seconds: target })
      .in(
        'id',
        arr.map((x) => x.id)
      );
    if (error) {
      console.log(`  ERR ${error.message}`);
    } else {
      console.log(`  ✓ ${arr.length}개 → ${target}`);
    }
  }
  console.log('\n완료.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

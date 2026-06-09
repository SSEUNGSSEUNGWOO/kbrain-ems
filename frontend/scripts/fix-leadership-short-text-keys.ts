/**
 * 관리자 AI 리더십 진단 Q17~Q20 short_text 정답 키워드 등록 + 응답 재채점.
 * submit RPC 의 채점 로직(options.correct_keywords + lower(LIKE)) 과 동일하게 처리.
 *
 * usage:
 *   bun run scripts/fix-leadership-short-text-keys.ts          # dry-run
 *   bun run scripts/fix-leadership-short-text-keys.ts --apply  # 적용
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

const COHORT = 'ae8f03de-6fae-4cbf-878f-5f06a087038a';
const APPLY = process.argv.includes('--apply');

// 문항별 정답 키워드 (LIKE 매칭, 대소문자 무시)
const KEYWORDS: Record<number, string[]> = {
  17: ['바이브코딩', '바이브 코딩', 'vibe coding', 'vibecoding'],
  18: ['RAG', '검색증강생성'],
  19: ['sllm', 'slm'],
  20: ['ollama', '올라마']
};

const { data: diags } = await s.from('diagnoses').select('id, type').eq('cohort_id', COHORT);
console.log('diagnoses:', diags?.length);

// ---------- 1) options.correct_keywords 등록 ----------
for (const d of diags ?? []) {
  const { data: qs } = await s
    .from('diagnosis_questions')
    .select('id, question_no, type, options')
    .eq('diagnosis_id', d.id)
    .gte('question_no', 17)
    .lte('question_no', 20);
  for (const q of qs ?? []) {
    if (q.type !== 'short_text') continue;
    const kws = KEYWORDS[q.question_no];
    if (!kws) continue;
    const nextOptions = { ...(q.options ?? {}), correct_keywords: kws };
    console.log(`  ${d.type} Q${q.question_no} → correct_keywords=${JSON.stringify(kws)}`);
    if (APPLY) {
      const { error } = await s
        .from('diagnosis_questions')
        .update({ options: nextOptions })
        .eq('id', q.id);
      if (error) { console.error('  update fail:', error.message); process.exit(1); }
    }
  }
}

if (!APPLY) {
  console.log('\n--apply 로 실제 등록 + 재채점');
  process.exit(0);
}

// ---------- 2) 응답 재채점 ----------
// submit RPC 로직 재구현: short_text 는 correct_keywords 어느 하나라도 lower(ans).includes(lower(kw))
//                       multi_choice/ox 는 options.correct 와 정확히 일치
console.log('\n응답 재채점...');
for (const d of diags ?? []) {
  const { data: qs } = await s
    .from('diagnosis_questions')
    .select('question_no, type, options, weight')
    .eq('diagnosis_id', d.id);
  type Q = { question_no: number; type: string; options: { correct?: string; correct_keywords?: string[] } | null; weight: number | null };
  const questions = (qs ?? []) as Q[];

  const { data: rs } = await s
    .from('diagnosis_responses')
    .select('id, responses, total_score, submitted_at')
    .eq('diagnosis_id', d.id);

  let updated = 0;
  for (const r of rs ?? []) {
    if (!r.submitted_at) continue;
    const answers = (r.responses ?? {}) as Record<string, string>;
    let score = 0;
    for (const q of questions) {
      const ans = answers[String(q.question_no)];
      if (!ans || !ans.trim()) continue;
      const w = Number(q.weight ?? 1);
      let match = false;
      if (q.type === 'multiple_choice' || q.type === 'ox') {
        if (q.options?.correct && ans.trim() === q.options.correct) match = true;
      } else if (q.type === 'short_text') {
        const kws = q.options?.correct_keywords ?? [];
        const lowerAns = ans.trim().toLowerCase();
        for (const kw of kws) {
          if (kw && lowerAns.includes(kw.trim().toLowerCase())) { match = true; break; }
        }
      }
      if (match) score += w;
    }
    if (score !== Number(r.total_score)) {
      const { error } = await s
        .from('diagnosis_responses')
        .update({ total_score: score })
        .eq('id', r.id);
      if (error) { console.error('  update fail:', error.message); continue; }
      updated++;
    }
  }
  console.log(`  ${d.type}: 재채점 변경 ${updated}건 / 전체 ${rs?.length ?? 0}`);
}
console.log('완료');

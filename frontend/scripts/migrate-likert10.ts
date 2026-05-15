// 만족도 설문 척도 5점 → 10점 일괄 변환.
// 1) likert5 문항 id 수집
// 2) survey_responses.responses 안의 likert5 응답값 ×2 변환
// 3) survey_questions.options 갱신 (max 10, labels 10개)
// 4) survey_questions.type 'likert5' → 'likert10'
//
// 실행: bun run scripts/migrate-likert10.ts
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

// 1) likert5 문항 id 수집
const { data: qs, error: qErr } = await s
  .from('survey_questions')
  .select('id')
  .eq('type', 'likert5');
if (qErr) throw qErr;
const likertIds = new Set((qs ?? []).map((q) => q.id));
console.log(`[1/4] likert5 문항 ${likertIds.size}개 발견`);

// 2) 응답값 ×2 변환
const { data: responses, error: rErr } = await s
  .from('survey_responses')
  .select('id, responses');
if (rErr) throw rErr;

let scaledRows = 0;
let scaledValues = 0;
for (const row of responses ?? []) {
  if (!row.responses || typeof row.responses !== 'object' || Array.isArray(row.responses)) {
    continue;
  }
  const orig = row.responses as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  let changed = false;
  for (const [k, v] of Object.entries(orig)) {
    if (likertIds.has(k) && typeof v === 'number') {
      next[k] = v * 2;
      changed = true;
      scaledValues++;
    } else {
      next[k] = v;
    }
  }
  if (changed) {
    const { error } = await s
      .from('survey_responses')
      .update({ responses: next })
      .eq('id', row.id);
    if (error) throw error;
    scaledRows++;
  }
}
console.log(`[2/4] survey_responses ${scaledRows}건 / ${scaledValues}개 응답값 ×2 변환`);

// 3) options 갱신
const newOptions = {
  min: 1,
  max: 10,
  labels: ['매우 불만족', '', '', '', '보통', '', '', '', '', '매우 만족']
};
const { error: optErr } = await s
  .from('survey_questions')
  .update({ options: newOptions })
  .eq('type', 'likert5');
if (optErr) throw optErr;
console.log(`[3/4] survey_questions.options 갱신 완료 (max 5 → 10, 라벨 10개)`);

// 4) type 변경
const { error: typeErr } = await s
  .from('survey_questions')
  .update({ type: 'likert10' })
  .eq('type', 'likert5');
if (typeErr) throw typeErr;
console.log(`[4/4] survey_questions.type 'likert5' → 'likert10' 완료`);

console.log('\n✅ 마이그레이션 완료');

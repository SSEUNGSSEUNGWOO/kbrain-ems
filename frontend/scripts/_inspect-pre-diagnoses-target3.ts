// 일회성 — 그린2/블루3/노코드(⑥)의 현재 pre 진단 문항을 덤프해서 xlsx와 비교
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(__dirname, '../.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TARGETS = [
  '그린',   // 초급 종합과정
  '블루',   // 중급 종합과정
  '노코드', // ⑥
];

async function main() {
  console.log('==== matching cohorts ====');
  const { data: cohorts } = await supabase
    .from('cohorts')
    .select('id, name, started_at, ended_at, recruiting_slug, category')
    .order('started_at', { ascending: true, nullsFirst: false });

  const matched = (cohorts ?? []).filter((c) =>
    TARGETS.some((t) => c.name?.includes(t))
  );

  for (const c of matched) {
    console.log(`  [${c.id}] ${c.name}  (${c.started_at ?? '-'} ~ ${c.ended_at ?? '-'})`);
  }

  console.log('\n==== diagnoses (type=pre) for those cohorts ====');
  const cohortIds = matched.map((c) => c.id);
  const { data: diags } = await supabase
    .from('diagnoses')
    .select('id, cohort_id, type, title, share_code, created_at')
    .in('cohort_id', cohortIds)
    .order('cohort_id', { ascending: true })
    .order('created_at', { ascending: true });

  for (const d of diags ?? []) {
    const c = matched.find((x) => x.id === d.cohort_id);
    console.log(`  [diag ${d.id}] cohort=${c?.name} type=${d.type} title="${d.title}" share=${d.share_code ?? '-'}`);
  }

  console.log('\n==== pre-diagnosis questions ====');
  for (const d of diags ?? []) {
    if (d.type !== 'pre') continue;
    const c = matched.find((x) => x.id === d.cohort_id);
    console.log(`\n--- ${c?.name}  diag=${d.id} (${d.title}) ---`);
    const { data: qs } = await supabase
      .from('diagnosis_questions')
      .select('id, question_no, type, text, weight, choices, correct, correct_keywords')
      .eq('diagnosis_id', d.id)
      .order('question_no', { ascending: true });
    qs?.forEach((q) => {
      console.log(`  Q${q.question_no} [${q.type}] w=${q.weight}  ${q.text.slice(0, 80)}`);
      if (Array.isArray(q.choices)) {
        for (const ch of q.choices as Array<{ key: string; text: string }>) {
          const mark = ch.key === q.correct ? '★' : ' ';
          console.log(`     ${mark}${ch.key} ${ch.text}`);
        }
      }
      if (q.correct) console.log(`     정답: ${q.correct}`);
      if (q.correct_keywords) console.log(`     키워드: ${JSON.stringify(q.correct_keywords)}`);
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

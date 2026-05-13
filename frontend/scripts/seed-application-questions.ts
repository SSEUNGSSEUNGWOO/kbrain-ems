// HWP "2026년 교육과정 신청 사전문항" 시드 로더.
// 데이터: scripts/data/application-questions-seed.json
//
// 동작:
//   1. 시드 json 로드
//   2. 각 course.cohort_name으로 cohort 조회 (없으면 SKIP + 경고)
//   3. 매핑된 cohort_id 단위로 application_questions wipe → 공통 + 과정별 재삽입
//      (멱등성: 재실행해도 동일 결과)
//   4. 가중치는 _meta.weights_by_difficulty 적용 (지식평가만)
//
// 실행: bun run scripts/seed-application-questions.ts
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

type Choice = { key: string; text: string };
type SeedQuestion = {
  question_no: string;
  section: string;
  question_type: string;
  question_text: string;
  difficulty?: string;
  choices?: Choice[];
  correct_choice?: string;
};
type SeedCourse = {
  code: string;
  cohort_name?: string;
  cohort_name_prefix?: string;
  pre_learning_label?: string;
  questions: SeedQuestion[];
};
type SeedFile = {
  _meta: {
    weights_by_difficulty: Record<string, number>;
  };
  common: SeedQuestion[];
  courses: SeedCourse[];
};

const dataPath = path.resolve(__dirname, 'data/application-questions-seed.json');
const seed = JSON.parse(fs.readFileSync(dataPath, 'utf8')) as SeedFile;
const weightFor = (q: SeedQuestion): number =>
  q.section === 'knowledge' && q.difficulty
    ? (seed._meta.weights_by_difficulty[q.difficulty] ?? 1)
    : 1;

const toRow = (cohortId: string, q: SeedQuestion, displayOrder: number) => ({
  cohort_id: cohortId,
  track_id: null,
  section: q.section,
  question_no: q.question_no,
  difficulty: q.difficulty ?? null,
  question_text: q.question_text,
  question_type: q.question_type,
  choices: q.choices ?? null,
  correct_choice: q.correct_choice ?? null,
  weight: weightFor(q),
  display_order: displayOrder
});

let totalCohorts = 0;
let totalInserted = 0;
const skipped: string[] = [];

async function resolveCohorts(course: SeedCourse): Promise<{ id: string; name: string }[]> {
  if (course.cohort_name) {
    const { data } = await s
      .from('cohorts')
      .select('id, name')
      .eq('name', course.cohort_name)
      .maybeSingle();
    return data ? [data] : [];
  }
  if (course.cohort_name_prefix) {
    const { data } = await s
      .from('cohorts')
      .select('id, name')
      .ilike('name', `${course.cohort_name_prefix}%`)
      .order('name');
    return data ?? [];
  }
  return [];
}

for (const course of seed.courses) {
  const cohorts = await resolveCohorts(course);
  if (cohorts.length === 0) {
    const label = course.cohort_name ?? course.cohort_name_prefix ?? `(code=${course.code})`;
    console.warn(`[SKIP] cohort not found: ${label}`);
    skipped.push(label);
    continue;
  }

  for (const cohort of cohorts) {
    const { error: delErr } = await s
      .from('application_questions')
      .delete()
      .eq('cohort_id', cohort.id);
    if (delErr) {
      console.error(`[ERR] wipe failed (${cohort.name}):`, delErr.message);
      continue;
    }

    const rows = [
      ...seed.common.map((q, i) => toRow(cohort.id, q, i)),
      ...course.questions.map((q, i) => toRow(cohort.id, q, seed.common.length + i))
    ];

    const { error: insErr } = await s.from('application_questions').insert(rows);
    if (insErr) {
      console.error(`[ERR] insert failed (${cohort.name}):`, insErr.message);
      continue;
    }

    totalCohorts += 1;
    totalInserted += rows.length;
    console.log(
      `[OK] ${cohort.name} — ${rows.length}문항 (공통 ${seed.common.length} + 과정 ${course.questions.length})`
    );
  }
}

console.log(`\n완료 — cohorts ${totalCohorts}, 문항 ${totalInserted}`);
if (skipped.length > 0) {
  console.log(`\n경고: 매칭 안 된 cohort name (${skipped.length}):`);
  for (const n of skipped) console.log(`  - ${n}`);
}

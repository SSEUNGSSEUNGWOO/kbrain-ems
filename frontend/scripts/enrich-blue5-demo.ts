/**
 * 블루 5회차 시연 데이터 보강:
 *  1) 시드 200명 모두 ai_literacy + data_literacy 수료 처리 (lms_completions insert)
 *  2) 30명에게 다른 진행 cohort active application 추가
 *     - 그중 15명은 어느 cohort에서 status='selected' (자동선발 시트의
 *       "다른 cohort 합격자 제외" 토글 시연용)
 *
 * 멱등: 같은 (course_code, phone) 또는 (applicant, cohort) 이미 있으면 스킵.
 *
 * usage:
 *   bun run scripts/enrich-blue5-demo.ts          # dry-run
 *   bun run scripts/enrich-blue5-demo.ts --apply  # 적용
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

const BLUE5_ID = 'f046ddf8-c458-4bf4-a71d-3230bc798e8a';
const APPLY = process.argv.includes('--apply');

// 시드 신청자가 다른 cohort에서 active application 갖게 할 cohort들
// (블루 5회차와 시기 겹치는 진행 중 cohort 중 시연 흐름에 자연스러운 것)
const OTHER_COHORTS = [
  { id: '0e3b0791-5c03-40f8-a632-094ffd7fe5d2', name: 'AI 챔피언 그린 1회차' },
  { id: '175c280a-d24b-418a-867e-0ca322ef97f9', name: 'AI 챔피언 그린 2회차' },
  { id: '385f6497-0b85-41d9-8668-bc0c8cf8f9b6', name: 'AI 챔피언 블루 4회차' }
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---------- 1단계: 블루 5회차 신청자(applicant) 로드 ----------
const { data: blue5Apps, error: appErr } = await s
  .from('applications')
  .select('applicant_id, applicants(id, name, phone, email)')
  .eq('cohort_id', BLUE5_ID);
if (appErr) {
  console.error(appErr);
  process.exit(1);
}
type AppRow = { applicant_id: string; applicants: { id: string; name: string; phone: string | null; email: string | null } | null };
const apps = (blue5Apps ?? []) as unknown as AppRow[];
console.log(`블루 5회차 신청자: ${apps.length}명`);

// ---------- 2단계: lms_completions 행 준비 ----------
type LmsInsert = {
  course_code: string;
  course_name: string;
  name: string;
  phone: string;
  email: string;
  completed: boolean;
  completed_at: string;
  certificate_no: string;
};

const lmsRows: LmsInsert[] = [];
let certSeq = 80000; // 충돌 회피용 큰 시퀀스
for (const a of apps) {
  const ap = a.applicants;
  if (!ap) continue;
  const phoneDigits = (ap.phone ?? '').replace(/[^\d]/g, '');
  if (!phoneDigits) continue;
  for (const cc of [
    { code: 'ai_literacy', name: '① AI 리터러시' },
    { code: 'data_literacy', name: '② 데이터 리터러시' }
  ]) {
    certSeq++;
    lmsRows.push({
      course_code: cc.code,
      course_name: cc.name,
      name: ap.name,
      phone: phoneDigits,
      email: (ap.email ?? '').trim().toLowerCase(),
      completed: true,
      completed_at: '2026-05-15',
      certificate_no: `2026-D${certSeq}`
    });
  }
}
console.log(`lms_completions 추가할 행: ${lmsRows.length}개 (200 × 2)`);

// ---------- 3단계: 30명 선정 → 다른 cohort active application ----------
const shuffled = shuffle(apps).slice(0, 30);
const otherAppPlan: {
  applicant_id: string;
  cohort_id: string;
  cohort_name: string;
  status: 'applied' | 'selected';
}[] = [];
shuffled.forEach((a, i) => {
  if (!a.applicants) return;
  const target = pick(OTHER_COHORTS);
  // 처음 15명은 selected, 나머지 15명은 applied
  otherAppPlan.push({
    applicant_id: a.applicant_id,
    cohort_id: target.id,
    cohort_name: target.name,
    status: i < 15 ? 'selected' : 'applied'
  });
});
console.log(`\n다른 cohort active application 추가: ${otherAppPlan.length}개`);
const byCohort = new Map<string, { selected: number; applied: number; name: string }>();
for (const p of otherAppPlan) {
  const cur = byCohort.get(p.cohort_id) ?? { selected: 0, applied: 0, name: p.cohort_name };
  if (p.status === 'selected') cur.selected++;
  else cur.applied++;
  byCohort.set(p.cohort_id, cur);
}
for (const [, v] of byCohort) {
  console.log(`  ${v.name}: selected ${v.selected}, applied ${v.applied}`);
}

if (!APPLY) {
  console.log('\n--apply 로 실제 적용');
  process.exit(0);
}

// ---------- 4단계: lms_completions 멱등 insert ----------
console.log('\nlms_completions insert...');
let lmsInserted = 0, lmsSkipped = 0;
// 한번에 배치 — 200×2=400 → batch 100씩
for (let i = 0; i < lmsRows.length; i += 100) {
  const batch = lmsRows.slice(i, i + 100);
  // 중복 회피: 같은 (course_code, phone) 이미 있으면 스킵하기 위해 사전 조회
  const phones = batch.map(r => r.phone);
  const { data: existing } = await s
    // @ts-expect-error lms_completions 미반영
    .from('lms_completions')
    .select('course_code, phone')
    .in('phone', phones)
    .in('course_code', ['ai_literacy', 'data_literacy']);
  const existSet = new Set(
    ((existing as { course_code: string; phone: string }[] | null) ?? [])
      .map(r => `${r.course_code}|${r.phone}`)
  );
  const toInsert = batch.filter(r => !existSet.has(`${r.course_code}|${r.phone}`));
  lmsSkipped += batch.length - toInsert.length;
  if (toInsert.length > 0) {
    const { error } = await s
      // @ts-expect-error lms_completions 미반영
      .from('lms_completions').insert(toInsert);
    if (error) { console.error(error); process.exit(1); }
    lmsInserted += toInsert.length;
  }
}
console.log(`  lms insert: ${lmsInserted}, 스킵 ${lmsSkipped}`);

// ---------- 5단계: 다른 cohort active application 멱등 insert ----------
console.log('\n다른 cohort application insert...');
let appInserted = 0, appSkipped = 0;
for (const p of otherAppPlan) {
  // 이미 같은 (applicant, cohort) 있으면 스킵
  const { data: dup } = await s
    .from('applications')
    .select('id, status')
    .eq('applicant_id', p.applicant_id)
    .eq('cohort_id', p.cohort_id)
    .maybeSingle();
  if (dup) { appSkipped++; continue; }
  const { error } = await s.from('applications').insert({
    applicant_id: p.applicant_id,
    cohort_id: p.cohort_id,
    status: p.status,
    applied_at: '2026-07-01',
    decided_at: p.status === 'selected' ? '2026-07-20' : null
  });
  if (error) { console.error(`app insert fail:`, error); continue; }
  appInserted++;
}
console.log(`  application insert: ${appInserted}, 스킵 ${appSkipped}`);
console.log('\n완료');

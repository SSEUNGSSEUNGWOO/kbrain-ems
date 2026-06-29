/**
 * 블루 5회차 시연 데이터 종합 cleanup.
 *   1) cross-cohort dummy 30건 (그린 1·2 / 블루 4회차)
 *   2) 블루 5회차 applications 200건 + application_answers
 *   3) 시드 applicants 200명 (다른 cohort 에 application 없는 사람만)
 *   4) lms_completions 의 시드 phone 매칭 행 (ai_literacy + data_literacy)
 * organizations 는 그대로 유지 (다른 신청자도 같은 org 쓸 수 있어서).
 *
 * usage:
 *   bun run scripts/cleanup-blue5-demo.ts          # dry-run
 *   bun run scripts/cleanup-blue5-demo.ts --apply  # 실행
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

const BLUE5 = 'f046ddf8-c458-4bf4-a71d-3230bc798e8a';
const OTHER_COHORTS = [
  '0e3b0791-5c03-40f8-a632-094ffd7fe5d2', // 그린 1
  '175c280a-d24b-418a-867e-0ca322ef97f9', // 그린 2
  '385f6497-0b85-41d9-8668-bc0c8cf8f9b6'  // 블루 4
];
const APPLY = process.argv.includes('--apply');

// ---------- 시드 applicant 식별 ----------
const { data: blue5Apps } = await s
  .from('applications')
  .select('id, applicant_id')
  .eq('cohort_id', BLUE5);
const applicantIds = [...new Set((blue5Apps ?? []).map((a) => a.applicant_id))];
console.log(`블루 5회차 시드 applicant: ${applicantIds.length}명, applications: ${blue5Apps?.length ?? 0}건`);

// ---------- 1) cross-cohort dummy 조회 ----------
const { data: crossDummy } = await s
  .from('applications')
  .select('id, cohort_id, status')
  .in('applicant_id', applicantIds)
  .in('cohort_id', OTHER_COHORTS);
console.log(`cross-cohort dummy: ${crossDummy?.length ?? 0}건`);

// ---------- 2) phone 모음 (lms 매칭용) ----------
const { data: applicantRows } = await s
  .from('applicants')
  .select('id, phone, email')
  .in('id', applicantIds);
const seedPhones = new Set<string>();
for (const a of applicantRows ?? []) {
  const p = (a.phone ?? '').replace(/[^\d]/g, '');
  if (p) seedPhones.add(p);
}
console.log(`시드 phone digits: ${seedPhones.size}개`);

// ---------- 3) lms 시드 행 카운트 ----------
let lmsCount = 0;
if (seedPhones.size > 0) {
  const { count } = await s
    // @ts-ignore lms_completions 미반영
    .from('lms_completions')
    .select('*', { count: 'exact', head: true })
    .in('course_code', ['ai_literacy', 'data_literacy'])
    .in('phone', [...seedPhones]);
  lmsCount = count ?? 0;
}
console.log(`lms_completions 매칭 행: ${lmsCount}개`);

// ---------- 4) applicants 중 다른 cohort 잔존자 식별 (cross-cohort 삭제 후 기준) ----------
// cross-cohort dummy 30건을 1단계에서 삭제하면, 시드 applicants 는 BLUE5 외엔 application 없음.
// 그래서 단순히 "BLUE5/OTHER_COHORTS 외에 다른 곳에 박힌 applicants" 만 체크하면 됨.
let toDeleteApplicantIds: string[] = applicantIds;
if (applicantIds.length > 0) {
  const { data: otherApps } = await s
    .from('applications')
    .select('applicant_id')
    .in('applicant_id', applicantIds)
    .neq('cohort_id', BLUE5)
    .not('cohort_id', 'in', `(${OTHER_COHORTS.map((id) => `"${id}"`).join(',')})`);
  const protectSet = new Set((otherApps ?? []).map((a) => a.applicant_id));
  console.log(`보호 대상 (BLUE5/cross 외 다른 cohort 에 application 있는 applicants): ${protectSet.size}명`);
  toDeleteApplicantIds = applicantIds.filter((id) => !protectSet.has(id));
}
console.log(`삭제 예정 applicants: ${toDeleteApplicantIds.length}명`);

if (!APPLY) {
  console.log('\n--apply 로 실제 삭제');
  process.exit(0);
}

// ============================================================
// 실제 삭제 — 순서가 중요: applications → applicants → lms
// ============================================================

// 1) cross-cohort dummy 삭제
if (crossDummy && crossDummy.length > 0) {
  const { error } = await s.from('applications').delete().in('id', crossDummy.map((a) => a.id));
  if (error) { console.error('cross delete fail:', error); process.exit(1); }
  console.log(`✓ cross-cohort dummy ${crossDummy.length}건 삭제`);
}

// 2) 블루 5회차 application_answers + applications (FK CASCADE 있다고 가정. 안전을 위해 명시 삭제도 시도)
const blue5AppIds = (blue5Apps ?? []).map((a) => a.id);
if (blue5AppIds.length > 0) {
  // application_answers 명시 삭제 (FK CASCADE 없을 수 있음 → in chunks)
  for (let i = 0; i < blue5AppIds.length; i += 100) {
    const slice = blue5AppIds.slice(i, i + 100);
    const { error } = await s.from('application_answers').delete().in('application_id', slice);
    if (error) { console.error('answers delete fail:', error); process.exit(1); }
  }
  const { error } = await s.from('applications').delete().in('id', blue5AppIds);
  if (error) { console.error('apps delete fail:', error); process.exit(1); }
  console.log(`✓ 블루 5회차 applications ${blue5AppIds.length}건 + answers 삭제`);
}

// 3) applicants 삭제
if (toDeleteApplicantIds.length > 0) {
  for (let i = 0; i < toDeleteApplicantIds.length; i += 100) {
    const slice = toDeleteApplicantIds.slice(i, i + 100);
    const { error } = await s.from('applicants').delete().in('id', slice);
    if (error) { console.error('applicants delete fail:', error); process.exit(1); }
  }
  console.log(`✓ applicants ${toDeleteApplicantIds.length}명 삭제`);
}

// 4) lms_completions 삭제
if (seedPhones.size > 0) {
  const { error } = await s
    // @ts-ignore lms_completions 미반영
    .from('lms_completions')
    .delete()
    .in('course_code', ['ai_literacy', 'data_literacy'])
    .in('phone', [...seedPhones]);
  if (error) { console.error('lms delete fail:', error); process.exit(1); }
  console.log(`✓ lms_completions ${lmsCount}개 삭제`);
}

console.log('\n완료');

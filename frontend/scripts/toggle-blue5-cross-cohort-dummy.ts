/**
 * 블루 5회차 자동선발 시연 — "다른 cohort 합격자 제외" 기능용 dummy 적용/정리.
 *
 * 블루 5회차 시드 학생 200명 중 30명에게 다른 cohort 의 active application 을
 * 박는다. selected 15 + applied 15. 시연 후 cleanup 으로 깨끗이 회수.
 *
 * usage:
 *   bun run scripts/toggle-blue5-cross-cohort-dummy.ts          # dry-run (현황만)
 *   bun run scripts/toggle-blue5-cross-cohort-dummy.ts --apply  # dummy 추가
 *   bun run scripts/toggle-blue5-cross-cohort-dummy.ts --cleanup # dummy 정리
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
const CLEANUP = process.argv.includes('--cleanup');

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

// ---------- 블루 5회차 시드 applicant 추출 ----------
const { data: blue5Apps } = await s
  .from('applications')
  .select('applicant_id')
  .eq('cohort_id', BLUE5_ID);
const seedApplicantIds = [...new Set((blue5Apps ?? []).map((a) => a.applicant_id))];
console.log(`블루 5회차 시드 applicant: ${seedApplicantIds.length}명`);

// ---------- 현황 ----------
const { data: existing } = await s
  .from('applications')
  .select('id, applicant_id, cohort_id, status')
  .in('applicant_id', seedApplicantIds)
  .in('cohort_id', OTHER_COHORTS.map((c) => c.id));
console.log(`다른 cohort 에 있는 시드 application: ${existing?.length ?? 0}건`);
const byCohort: Record<string, { selected: number; applied: number; total: number }> = {};
for (const a of existing ?? []) {
  const c = byCohort[a.cohort_id] ?? { selected: 0, applied: 0, total: 0 };
  c.total++;
  if (a.status === 'selected') c.selected++;
  else if (a.status === 'applied') c.applied++;
  byCohort[a.cohort_id] = c;
}
for (const c of OTHER_COHORTS) {
  const x = byCohort[c.id] ?? { selected: 0, applied: 0, total: 0 };
  console.log(`  ${c.name}: total ${x.total} (selected ${x.selected}, applied ${x.applied})`);
}

// ---------- CLEANUP ----------
if (CLEANUP) {
  const ids = (existing ?? []).map((a) => a.id);
  if (ids.length === 0) {
    console.log('\n정리할 dummy 없음');
    process.exit(0);
  }
  console.log(`\nCLEANUP: ${ids.length}건 삭제`);
  const { error } = await s.from('applications').delete().in('id', ids);
  if (error) { console.error(error); process.exit(1); }
  console.log('완료');
  process.exit(0);
}

// ---------- APPLY ----------
if (!APPLY) {
  console.log('\n--apply 로 dummy 추가 / --cleanup 으로 정리');
  process.exit(0);
}

if ((existing?.length ?? 0) > 0) {
  console.log('\n⚠ 이미 dummy 가 있음. --cleanup 후 다시 실행하세요.');
  process.exit(1);
}

const targets = shuffle(seedApplicantIds).slice(0, 30);
const plan: { applicant_id: string; cohort_id: string; status: 'applied' | 'selected' }[] = [];
targets.forEach((aid, i) => {
  const target = pick(OTHER_COHORTS);
  plan.push({
    applicant_id: aid,
    cohort_id: target.id,
    status: i < 15 ? 'selected' : 'applied'
  });
});
const planByCohort: Record<string, { selected: number; applied: number }> = {};
for (const p of plan) {
  const c = planByCohort[p.cohort_id] ?? { selected: 0, applied: 0 };
  if (p.status === 'selected') c.selected++;
  else c.applied++;
  planByCohort[p.cohort_id] = c;
}
console.log(`\nAPPLY 계획 (30건):`);
for (const c of OTHER_COHORTS) {
  const x = planByCohort[c.id] ?? { selected: 0, applied: 0 };
  console.log(`  ${c.name}: selected ${x.selected}, applied ${x.applied}`);
}

const rows = plan.map((p) => ({
  applicant_id: p.applicant_id,
  cohort_id: p.cohort_id,
  status: p.status,
  applied_at: '2026-07-01',
  decided_at: p.status === 'selected' ? '2026-07-20' : null
}));
const { error } = await s.from('applications').insert(rows);
if (error) { console.error(error); process.exit(1); }
console.log('\n완료 — 30건 추가');

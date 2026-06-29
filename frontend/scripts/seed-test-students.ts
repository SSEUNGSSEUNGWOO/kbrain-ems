/**
 * 사전 세팅 체크리스트 매칭 테스트용 학생 시드.
 * 3개 cohort 에 각각 "테스트1~5" 학생 5명씩 (총 15명) 추가.
 * phone 끝 4자리는 모두 "0000" — verify 시 동일 4자리로 매칭 가능.
 *
 * 메모: 이름이 "테스트" 로 시작하므로 isTestStudent 헬퍼에 의해 운영
 * 집계·명단·엑셀에서 자동 제외됨. 다만 응답 페이지 학생 매트릭스 에서도
 * 안 보이므로 매칭 동작만 검증하고 응답 결과 확인은 별도 점검 필요.
 *
 * usage:
 *   bun run scripts/seed-test-students.ts          # dry-run
 *   bun run scripts/seed-test-students.ts --apply  # 실행
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

const TARGET_COHORTS = [
  'AI 리터러시와 업무활용',
  '데이터 리터러시',
  '생성형 AI 활용 노코드 데이터분석',
  'AI 챔피언 블루 1회차',
  'AI 행정 융합 기획'
];

const TEST_NAMES = ['테스트1', '테스트2', '테스트3', '테스트4', '테스트5'];
const TEST_PHONE = '010-0000-0000';

async function findCohort(namePartial: string) {
  const { data } = await s
    .from('cohorts')
    .select('id, name')
    .ilike('name', `%${namePartial}%`)
    .limit(1);
  return data?.[0];
}

async function seedFor(cohort: { id: string; name: string }) {
  for (const name of TEST_NAMES) {
    // 이미 같은 이름 학생 있는지 확인 (멱등)
    const { data: existing } = await s
      .from('students')
      .select('id')
      .eq('cohort_id', cohort.id)
      .eq('name', name)
      .maybeSingle();
    if (existing) {
      console.log(`  · [skip] ${name} 이미 있음`);
      continue;
    }

    if (!APPLY) {
      console.log(`  [dry-run] ${name} 추가 예정`);
      continue;
    }

    // applicant 생성
    const { data: app, error: appErr } = await s
      .from('applicants')
      .insert({ name, phone: TEST_PHONE })
      .select('id')
      .single();
    if (appErr || !app) throw new Error(appErr?.message ?? 'applicant insert 실패');

    // application 생성 (selected 상태) — 트리거가 자동으로 students row 도 생성
    const today = new Date().toISOString().slice(0, 10);
    const { error: appsErr } = await s.from('applications').insert({
      applicant_id: app.id,
      cohort_id: cohort.id,
      status: 'selected',
      decided_at: today
    });
    if (appsErr) throw new Error(appsErr.message);

    // 자동 생성된 students row 에 phone 채우기 (applicants.phone 은 트리거가 못 본 듯)
    const { error: updErr } = await s
      .from('students')
      .update({ phone: TEST_PHONE })
      .eq('applicant_id', app.id)
      .eq('cohort_id', cohort.id);
    if (updErr) throw new Error(updErr.message);

    console.log(`  ✓ ${name} 추가 완료`);
  }
}

async function main() {
  console.log(`\nmode: ${APPLY ? 'APPLY' : 'dry-run'}\n`);

  for (const partial of TARGET_COHORTS) {
    console.log(`[${partial}]`);
    const cohort = await findCohort(partial);
    if (!cohort) {
      console.log(`  ⚠️ 매칭 안 됨`);
      continue;
    }
    console.log(`  → ${cohort.id} ${cohort.name}`);
    await seedFor(cohort);
  }

  console.log(`\n완료${APPLY ? '' : ' (dry-run — 실제 변경 안 함)'}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

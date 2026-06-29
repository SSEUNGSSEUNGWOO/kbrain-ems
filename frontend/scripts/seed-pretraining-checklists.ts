/**
 * 사전 세팅 체크리스트 시드 — 3개 cohort 에 동일 4항목 체크리스트 생성.
 *
 * 항목:
 *   1) Zoom 프로그램 설치
 *   2) Zoom 화상/마이크 테스트 — (Zoom 설치='예' 일 때만 노출 후속 분기)
 *   3) ChatGPT 가입
 *   4) Google Gemini 가입
 *
 * usage:
 *   bun run scripts/seed-pretraining-checklists.ts          # dry-run
 *   bun run scripts/seed-pretraining-checklists.ts --apply  # 실행
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

// 대상 cohort 이름 — partial match 로 검색
const TARGET_NAMES = [
  'AI 리터러시와 업무활용',
  '데이터 리터러시',
  '생성형 AI 활용 노코드 데이터분석'
];

const CHECKLIST_TITLE = '실습 환경 사전 세팅 체크리스트';
const CHECKLIST_DESC = `귀중한 시간 할애하여 본 체크리스트에 응해주셔서 감사드립니다.
원활한 교육 진행을 위해 실습 환경 세팅 및 실행 확인이 필요합니다.
사전 세팅이 어려우시면 운영팀에 문의 바랍니다.`;
const GUIDE_URL = 'https://2026-toolguide.vercel.app/';

type ItemSeed = {
  question_no: string;
  text: string;
  guide_url: string | null;
  no_hint: string | null;
  // null 이면 항상 노출, parent_no 가 있으면 그 항목의 parent_answer 일 때만 노출
  parent_no: string | null;
  parent_answer: 'yes' | 'no' | null;
};

const ITEMS: ItemSeed[] = [
  {
    question_no: '1',
    text: 'Zoom 프로그램을 설치 완료하셨습니까?',
    guide_url: 'https://zoom.us/download',
    no_hint: 'https://zoom.us/download 에서 Zoom 데스크톱 앱을 설치해주세요.',
    parent_no: null,
    parent_answer: null
  },
  {
    question_no: '1-1',
    text: 'Zoom 실행 후, 화상 및 마이크 테스트를 완료하셨습니까?',
    guide_url: 'https://zoom.us/test',
    no_hint: 'https://zoom.us/test 접속 후 테스트 진행 요청',
    parent_no: '1',
    parent_answer: 'yes'
  },
  {
    question_no: '2',
    text: '[AI 도구 가입] ChatGPT 웹사이트 가입 완료하셨습니까?',
    guide_url: 'https://chatgpt.com',
    no_hint: 'https://chatgpt.com 접속 후 회원가입 진행 요청',
    parent_no: null,
    parent_answer: null
  },
  {
    question_no: '3',
    text: '[AI 도구 가입] Google Gemini 가입 완료하셨습니까? (Google 계정 가입 후 https://gemini.google.com/app 접속 확인 — Google Colab 도 활용 예정)',
    guide_url: 'https://gemini.google.com/app',
    no_hint: 'Google 계정 가입 후 https://gemini.google.com/app 접속',
    parent_no: null,
    parent_answer: null
  }
];

async function findCohort(name: string) {
  const { data, error } = await s
    .from('cohorts')
    .select('id, name')
    .ilike('name', `%${name}%`)
    .limit(5);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function seedFor(cohortId: string, cohortName: string) {
  // 이미 동일 제목 체크리스트 있는지 확인
  const { data: existing } = await s
    .from('pretraining_checklists')
    .select('id, title')
    .eq('cohort_id', cohortId)
    .eq('title', CHECKLIST_TITLE)
    .maybeSingle();
  if (existing) {
    console.log(`  [skip] 이미 존재: ${existing.id}`);
    return;
  }

  if (!APPLY) {
    console.log(`  [dry-run] 체크리스트 생성 예정: "${CHECKLIST_TITLE}" + 항목 ${ITEMS.length}개`);
    return;
  }

  const { data: cl, error: clErr } = await s
    .from('pretraining_checklists')
    .insert({
      cohort_id: cohortId,
      title: CHECKLIST_TITLE,
      description: CHECKLIST_DESC,
      guide_url: GUIDE_URL
    })
    .select('id')
    .single();
  if (clErr || !cl) throw new Error(clErr?.message ?? 'checklist insert 실패');

  // 1차 패스 — parent 가 없는 항목들 먼저 insert (id 받기)
  const idByQno = new Map<string, string>();
  const rootItems = ITEMS.filter((it) => !it.parent_no);
  for (let i = 0; i < rootItems.length; i++) {
    const it = rootItems[i];
    const { data: row, error } = await s
      .from('pretraining_checklist_items')
      .insert({
        checklist_id: cl.id,
        question_no: it.question_no,
        text: it.text,
        guide_url: it.guide_url,
        no_hint: it.no_hint,
        display_order: i + 1
      })
      .select('id')
      .single();
    if (error || !row) throw new Error(error?.message ?? 'item insert 실패');
    idByQno.set(it.question_no, row.id);
  }

  // 2차 패스 — parent 가 있는 항목들. display_order 는 부모 바로 다음 자리.
  for (const it of ITEMS.filter((x) => x.parent_no)) {
    const parentId = idByQno.get(it.parent_no!);
    if (!parentId) throw new Error(`parent ${it.parent_no} 를 못 찾음`);
    // 부모 display_order 기반으로 .5 등 fractional 대신 모두 끝에 추가
    const { data: row, error } = await s
      .from('pretraining_checklist_items')
      .insert({
        checklist_id: cl.id,
        question_no: it.question_no,
        text: it.text,
        guide_url: it.guide_url,
        no_hint: it.no_hint,
        parent_id: parentId,
        parent_answer: it.parent_answer,
        display_order: rootItems.length + 10 // 부모들 뒤에 오게
      })
      .select('id')
      .single();
    if (error || !row) throw new Error(error?.message ?? 'sub-item insert 실패');
    idByQno.set(it.question_no, row.id);
  }

  console.log(`  ✓ 생성 완료: ${cl.id} (${cohortName})`);
}

async function main() {
  console.log(`\nmode: ${APPLY ? 'APPLY' : 'dry-run'}\n`);

  for (const name of TARGET_NAMES) {
    console.log(`[${name}] 검색 중...`);
    const matches = await findCohort(name);
    if (matches.length === 0) {
      console.log(`  ⚠️ 매칭되는 cohort 없음 — 이름 확인 필요`);
      continue;
    }
    if (matches.length > 1) {
      console.log(`  ⚠️ 매칭 다중 (${matches.length}건). 첫 번째 사용:`);
      for (const m of matches) console.log(`     - ${m.id} ${m.name}`);
    }
    const target = matches[0];
    console.log(`  → ${target.id} ${target.name}`);
    await seedFor(target.id, target.name);
  }

  console.log(`\n완료${APPLY ? '' : ' (dry-run — 실제 insert 안 함. 적용하려면 --apply)'}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

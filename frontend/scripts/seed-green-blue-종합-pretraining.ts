/**
 * AI 챔피언 그린(초급)·블루(중급) 종합과정 사전 세팅 체크리스트 시드.
 * 항목은 seed-green1-pretraining.ts와 동일 (Zoom·ChatGPT·Claude·Gemini·NotebookLM·공공데이터·Python·Lovable·v0).
 *
 * usage:
 *   bun run scripts/seed-green-blue-종합-pretraining.ts          # dry-run
 *   bun run scripts/seed-green-blue-종합-pretraining.ts --apply  # 실행
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

const COHORT_NAMES = [
  'AI 챔피언 그린(초급) 종합과정 (특화)',
  'AI 챔피언 블루(중급) 종합과정 (특화)'
];
const TITLE = '실습 환경 사전 세팅 체크리스트';
const DESC = `귀중한 시간 할애하여 본 체크리스트에 응해주셔서 감사드립니다.
원활한 교육 진행을 위해 실습 환경 세팅 및 실행 확인이 필요합니다.
사전 세팅이 어려우시면 운영팀에 문의 바랍니다.`;
const GUIDE_URL = 'https://2026-toolguide.vercel.app/';

type ItemSeed = {
  qno: string;
  text: string;
  guide: string | null;
  no_hint: string | null;
  parent_qno?: string;
  parent_answer?: 'yes' | 'no';
};

const ITEMS: ItemSeed[] = [
  {
    qno: '1',
    text: 'Zoom 프로그램을 설치 완료하셨습니까?',
    guide: 'https://zoom.us/download',
    no_hint: 'https://zoom.us/download 에서 Zoom 데스크톱 앱을 설치해주세요.'
  },
  {
    qno: '1-1',
    text: 'Zoom 실행 후, 화상 및 마이크 테스트를 완료하셨습니까?',
    guide: 'https://zoom.us/test',
    no_hint: 'https://zoom.us/test 접속 후 테스트 진행 요청',
    parent_qno: '1',
    parent_answer: 'yes'
  },
  {
    qno: '2',
    text: '[AI 도구] ChatGPT 가입 완료하셨습니까?',
    guide: 'https://chatgpt.com',
    no_hint: 'https://chatgpt.com 접속 후 회원가입 진행 요청'
  },
  {
    qno: '3',
    text: '[AI 도구] Claude 가입 완료하셨습니까?',
    guide: 'https://claude.ai',
    no_hint: 'https://claude.ai 접속 후 회원가입 진행 요청'
  },
  {
    qno: '4',
    text: '[AI 도구] Google Gemini 가입 완료하셨습니까?',
    guide: 'https://gemini.google.com/app',
    no_hint: 'https://gemini.google.com/app 접속 후 Google 계정으로 로그인'
  },
  {
    qno: '5',
    text: '[AI 도구] NotebookLM 가입 완료하셨습니까?',
    guide: 'https://notebooklm.google.com',
    no_hint: 'https://notebooklm.google.com 접속 후 Google 계정으로 로그인'
  },
  {
    qno: '6',
    text: '[데이터] 공공데이터포털(data.go.kr) 가입 완료하셨습니까?',
    guide: 'https://www.data.go.kr',
    no_hint: 'https://www.data.go.kr 접속 후 회원가입 진행 요청'
  },
  {
    qno: '7',
    text: '[실습 환경] Python 3.x 설치 완료하셨습니까?',
    guide: 'https://www.python.org/downloads/',
    no_hint: 'https://www.python.org/downloads/ 에서 Python 3.11 이상 설치 권장.'
  },
  {
    qno: '8',
    text: '[AI 도구] Lovable 가입 완료하셨습니까?',
    guide: 'https://lovable.dev',
    no_hint: 'https://lovable.dev 접속 후 회원가입 진행 요청'
  },
  {
    qno: '9',
    text: '[AI 도구] v0 가입 완료하셨습니까?',
    guide: 'https://v0.app',
    no_hint: 'https://v0.app 접속 후 회원가입 진행 요청'
  }
];

async function seedCohort(cohortName: string) {
  console.log(`\n[${cohortName}]`);

  const { data: matches } = await s
    .from('cohorts')
    .select('id, name')
    .eq('name', cohortName)
    .limit(2);
  if (!matches?.length) {
    console.log('  ⚠️ 매칭 안 됨');
    return;
  }
  const cohort = matches[0];
  console.log(`  → ${cohort.id} ${cohort.name}`);

  const { data: existing } = await s
    .from('pretraining_checklists')
    .select('id')
    .eq('cohort_id', cohort.id)
    .eq('title', TITLE);
  const exRow = existing?.[0];
  if (exRow) {
    const { count } = await s
      .from('pretraining_checklist_responses')
      .select('id', { count: 'exact', head: true })
      .eq('checklist_id', exRow.id);
    if ((count ?? 0) > 0) {
      console.log(`  ⚠️ 응답 ${count}건 있어 삭제 거부. 수동 처리 필요.`);
      return;
    }
    if (APPLY) {
      await s.from('pretraining_checklists').delete().eq('id', exRow.id);
      console.log(`  · 기존 체크리스트 삭제: ${exRow.id}`);
    } else {
      console.log(`  [dry-run] 기존 체크리스트 삭제 예정: ${exRow.id}`);
    }
  }

  if (!APPLY) {
    console.log(`  [dry-run] 새 체크리스트 생성 예정 (${ITEMS.length}개 항목):`);
    for (const it of ITEMS) console.log(`     ${it.qno}. ${it.text}`);
    return;
  }

  const { data: cl, error: clErr } = await s
    .from('pretraining_checklists')
    .insert({
      cohort_id: cohort.id,
      title: TITLE,
      description: DESC,
      guide_url: GUIDE_URL
    })
    .select('id')
    .single();
  if (clErr || !cl) throw new Error(clErr?.message ?? 'checklist insert 실패');

  const idByQno = new Map<string, string>();
  for (const it of ITEMS.filter((x) => !x.parent_qno)) {
    const order = parseInt(it.qno.split('-')[0]) * 10;
    const { data: row, error } = await s
      .from('pretraining_checklist_items')
      .insert({
        checklist_id: cl.id,
        question_no: it.qno,
        text: it.text,
        guide_url: it.guide,
        no_hint: it.no_hint,
        display_order: order
      })
      .select('id')
      .single();
    if (error || !row) throw new Error(error?.message ?? 'item insert 실패');
    idByQno.set(it.qno, row.id);
  }
  for (const it of ITEMS.filter((x) => x.parent_qno)) {
    const parentId = idByQno.get(it.parent_qno!);
    if (!parentId) throw new Error(`parent ${it.parent_qno} 못 찾음`);
    const baseOrder = parseInt(it.qno.split('-')[0]) * 10;
    const subOrder = parseInt(it.qno.split('-')[1] ?? '0');
    await s.from('pretraining_checklist_items').insert({
      checklist_id: cl.id,
      question_no: it.qno,
      text: it.text,
      guide_url: it.guide,
      no_hint: it.no_hint,
      parent_id: parentId,
      parent_answer: it.parent_answer ?? 'yes',
      display_order: baseOrder + subOrder
    });
  }

  console.log(`  ✓ 생성 완료: ${cl.id}`);
}

async function main() {
  console.log(`mode: ${APPLY ? 'APPLY' : 'dry-run'}`);
  for (const name of COHORT_NAMES) {
    await seedCohort(name);
  }
  console.log('');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

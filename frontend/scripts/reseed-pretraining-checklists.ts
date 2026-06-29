/**
 * 3개 cohort 의 사전 세팅 체크리스트를 과정별 맞춤 항목으로 재시드.
 * 기존 동일 제목 체크리스트는 삭제 후 재생성 (응답 없을 때만 안전).
 *
 * usage:
 *   bun run scripts/reseed-pretraining-checklists.ts          # dry-run
 *   bun run scripts/reseed-pretraining-checklists.ts --apply  # 실행
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

const CHECKLIST_TITLE = '실습 환경 사전 세팅 체크리스트';
const DESC = `귀중한 시간 할애하여 본 체크리스트에 응해주셔서 감사드립니다.
원활한 교육 진행을 위해 실습 환경 세팅 및 실행 확인이 필요합니다.
사전 세팅이 어려우시면 운영팀에 문의 바랍니다.`;
const GUIDE_URL = 'https://2026-toolguide.vercel.app/';

// 공통 항목 — 모든 과정 비대면이라 Zoom 필수
const COMMON: ItemSeed[] = [
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
  }
];

type ItemSeed = {
  qno: string;
  text: string;
  guide: string | null;
  no_hint: string | null;
  parent_qno?: string;
  parent_answer?: 'yes' | 'no';
};

function aiToolItem(qno: string, name: string, url: string): ItemSeed {
  return {
    qno,
    text: `[AI 도구] ${name} 가입 완료하셨습니까?`,
    guide: url,
    no_hint: `${url} 접속 후 회원가입 진행 요청`
  };
}

function genericToolItem(qno: string, name: string, url: string, label = '도구'): ItemSeed {
  return {
    qno,
    text: `[${label}] ${name} 가입 / 접속 확인 완료하셨습니까?`,
    guide: url,
    no_hint: `${url} 접속 후 가입 / 확인 진행 요청`
  };
}

const COURSES: { cohortNamePartial: string; items: ItemSeed[] }[] = [
  {
    cohortNamePartial: 'AI 리터러시와 업무활용',
    items: [
      ...COMMON,
      aiToolItem('2', 'ChatGPT', 'https://chatgpt.com'),
      aiToolItem('3', 'Claude', 'https://claude.ai'),
      aiToolItem('4', 'Google Gemini', 'https://gemini.google.com/app'),
      aiToolItem('5', 'NotebookLM', 'https://notebooklm.google.com'),
      aiToolItem('6', 'Perplexity', 'https://www.perplexity.ai')
    ]
  },
  {
    cohortNamePartial: '데이터 리터러시',
    items: [
      ...COMMON,
      genericToolItem('2', '공공데이터포털', 'https://www.data.go.kr', '데이터'),
      genericToolItem('3', 'SGIS (통계지리정보서비스)', 'https://sgis.kostat.go.kr', '데이터'),
      aiToolItem('4', 'ChatGPT', 'https://chatgpt.com'),
      aiToolItem('5', 'Claude', 'https://claude.ai'),
      aiToolItem('6', 'Google Gemini', 'https://gemini.google.com/app')
    ]
  },
  {
    cohortNamePartial: '생성형 AI 활용 노코드 데이터분석',
    items: [
      ...COMMON,
      aiToolItem('2', 'ChatGPT', 'https://chatgpt.com'),
      aiToolItem('3', 'Claude', 'https://claude.ai'),
      aiToolItem('4', 'Google Gemini', 'https://gemini.google.com/app'),
      {
        qno: '5',
        text: '[실습 환경] Google Colab 접속 확인하셨습니까? (Google 계정 필요)',
        guide: 'https://colab.research.google.com',
        no_hint: 'Google 계정 로그인 후 https://colab.research.google.com 접속 확인'
      },
      {
        qno: '6',
        text: '[실습 환경] Python 3.x 설치하셨습니까? (Colab 사용 시 선택)',
        guide: 'https://www.python.org/downloads/',
        no_hint: 'Google Colab 사용 시 별도 설치 불필요. 로컬 실습 원하시면 Python 3.11+ 설치 권장.'
      }
    ]
  }
];

async function findCohort(namePartial: string) {
  const { data, error } = await s
    .from('cohorts')
    .select('id, name')
    .ilike('name', `%${namePartial}%`)
    .limit(3);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function seedFor(cohortId: string, cohortName: string, items: ItemSeed[]) {
  // 기존 동일 제목 체크리스트 — 응답 0건이면 삭제 후 재생성
  const { data: existing } = await s
    .from('pretraining_checklists')
    .select('id, share_code')
    .eq('cohort_id', cohortId)
    .eq('title', CHECKLIST_TITLE);
  const exRow = existing?.[0];

  if (exRow) {
    const { count } = await s
      .from('pretraining_checklist_responses')
      .select('id', { count: 'exact', head: true })
      .eq('checklist_id', exRow.id);
    if ((count ?? 0) > 0) {
      console.log(`  ⚠️ 응답 ${count}건 있어서 삭제 거부. 수동 처리 필요.`);
      return;
    }
    if (APPLY) {
      const { error: delErr } = await s
        .from('pretraining_checklists')
        .delete()
        .eq('id', exRow.id);
      if (delErr) throw new Error(delErr.message);
      console.log(`  · 기존 체크리스트 삭제: ${exRow.id}${exRow.share_code ? ` (share_code ${exRow.share_code} 도 같이 사라짐)` : ''}`);
    } else {
      console.log(`  [dry-run] 기존 체크리스트 삭제 예정: ${exRow.id}`);
    }
  }

  if (!APPLY) {
    console.log(`  [dry-run] 새 체크리스트 생성 예정 (${items.length}개 항목):`);
    for (const it of items) console.log(`     ${it.qno}. ${it.text}`);
    return;
  }

  const { data: cl, error: clErr } = await s
    .from('pretraining_checklists')
    .insert({
      cohort_id: cohortId,
      title: CHECKLIST_TITLE,
      description: DESC,
      guide_url: GUIDE_URL
    })
    .select('id')
    .single();
  if (clErr || !cl) throw new Error(clErr?.message ?? 'checklist insert 실패');

  const idByQno = new Map<string, string>();
  // 1차 패스 — parent 없는 항목 먼저
  for (const it of items.filter((x) => !x.parent_qno)) {
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
  // 2차 패스 — parent 있는 항목
  for (const it of items.filter((x) => x.parent_qno)) {
    const parentId = idByQno.get(it.parent_qno!);
    if (!parentId) throw new Error(`parent ${it.parent_qno} 못 찾음`);
    const baseOrder = parseInt(it.qno.split('-')[0]) * 10;
    const subOrder = parseInt(it.qno.split('-')[1] ?? '0');
    const { data: row, error } = await s
      .from('pretraining_checklist_items')
      .insert({
        checklist_id: cl.id,
        question_no: it.qno,
        text: it.text,
        guide_url: it.guide,
        no_hint: it.no_hint,
        parent_id: parentId,
        parent_answer: it.parent_answer ?? 'yes',
        display_order: baseOrder + subOrder
      })
      .select('id')
      .single();
    if (error || !row) throw new Error(error?.message ?? 'sub-item insert 실패');
    idByQno.set(it.qno, row.id);
  }

  console.log(`  ✓ 재시드 완료: ${cl.id} — 항목 ${items.length}개 (${cohortName})`);
}

async function main() {
  console.log(`\nmode: ${APPLY ? 'APPLY' : 'dry-run'}\n`);

  for (const c of COURSES) {
    console.log(`[${c.cohortNamePartial}]`);
    const matches = await findCohort(c.cohortNamePartial);
    if (matches.length === 0) {
      console.log(`  ⚠️ 매칭 안 됨`);
      continue;
    }
    const target = matches[0];
    console.log(`  → ${target.id} ${target.name}`);
    await seedFor(target.id, target.name, c.items);
  }

  console.log(`\n완료${APPLY ? '' : ' (dry-run — 실제 변경 안 함)'}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

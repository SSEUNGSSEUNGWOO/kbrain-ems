// 바이브 코딩 LLM 서비스 개발 (⑧) — 사전·사후 역량평가 20문항 seed.
//
// 대상 cohort:
//   1회차 64fe381e-3bf7-48b5-ac79-d052854c87cc
//   2회차 23270f14-79c8-47b5-a536-7aef00053f26
//
// 각 cohort × (pre/post) = diagnosis 4개, 각 20문항.
// 배점 5점 × 20 = 100점, 응답 제한 7분(default), 교재 참조 제거.
// 재실행 시: 같은 title + cohort + type 진단 wipe 후 재생성.

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const envPath = path.resolve(__dirname, '../.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const COHORTS = [
  { id: '64fe381e-3bf7-48b5-ac79-d052854c87cc', label: '1회차' },
  { id: '23270f14-79c8-47b5-a536-7aef00053f26', label: '2회차' }
];

type MC = {
  no: number;
  type: 'multiple_choice';
  text: string;
  choices: { key: '①' | '②' | '③' | '④'; text: string }[];
  correct: '①' | '②' | '③' | '④';
};
type OX = { no: number; type: 'ox'; text: string; correct: 'O' | 'X' };
type ST = { no: number; type: 'short_text'; text: string; correct_keywords: string[] };
type Q = MC | OX | ST;

const QUESTIONS: Q[] = [
  // ── 초급 (10) ──
  {
    no: 1,
    type: 'multiple_choice',
    text: '「폐쇄망 먼저, 클라우드 마지막」 원칙의 의미로 가장 적절한 것은?',
    choices: [
      { key: '①', text: '외부 클라우드 서비스를 절대 쓰지 말라는 뜻이다' },
      { key: '②', text: '가장 제약이 큰 환경을 기준선으로 삼아 설계하라는 뜻이다' },
      { key: '③', text: '항상 클라우드를 먼저 구축하라는 뜻이다' },
      { key: '④', text: '로컬 도구는 보안 검토를 생략해도 된다는 뜻이다' }
    ],
    correct: '②'
  },
  {
    no: 2,
    type: 'multiple_choice',
    text: "바이브 코딩에서 '사람의 역할' 변화로 옳은 것은?",
    choices: [
      { key: '①', text: '사람의 역할이 줄어들어 검수도 필요 없어진다' },
      { key: '②', text: '코드 타이핑에서 문제정의·검수·운영설계로 이동하며 검수 책임은 오히려 커진다' },
      { key: '③', text: '사람은 문법 구현에만 집중하게 된다' },
      { key: '④', text: '사람은 아무 역할도 하지 않는다' }
    ],
    correct: '②'
  },
  {
    no: 3,
    type: 'multiple_choice',
    text: "채팅형 LLM과 코딩에이전트의 '가장 큰 차이'는?",
    choices: [
      { key: '①', text: '응답 속도의 차이' },
      { key: '②', text: '프로젝트 내부 파일과 도구를 직접 다루는지 여부' },
      { key: '③', text: '사용료의 차이' },
      { key: '④', text: '한국어 지원 여부' }
    ],
    correct: '②'
  },
  {
    no: 4,
    type: 'multiple_choice',
    text: 'MCP를 설명하는 대표 비유로 옳은 것은?',
    choices: [
      { key: '①', text: '충전 규격을 통일한 USB-C처럼 AI 도구 연결을 표준화한다' },
      { key: '②', text: '인터넷 속도를 높이는 광케이블이다' },
      { key: '③', text: '모델을 더 똑똑하게 만드는 학습 알고리즘이다' },
      { key: '④', text: '화면을 그려 주는 디자인 도구이다' }
    ],
    correct: '①'
  },
  {
    no: 5,
    type: 'multiple_choice',
    text: 'RAG(검색 기반 응답)의 개념으로 옳은 것은?',
    choices: [
      { key: '①', text: '모델 내부 가중치를 다시 학습시키는 기법이다' },
      { key: '②', text: '질문에 답하기 전에 관련 정보를 검색하고, 그 정보를 바탕으로 답을 생성하는 방식이다' },
      { key: '③', text: '이미지를 텍스트로 변환하는 기술이다' },
      { key: '④', text: '서버 없이 브라우저에서만 작동하는 방식이다' }
    ],
    correct: '②'
  },
  {
    no: 6,
    type: 'ox',
    text: '로컬 LLM(Ollama)을 쓰면 외부 전송이 줄어들 수 있지만, 곧바로 "보안상 안전하다"로 단정할 수는 없다.',
    correct: 'O'
  },
  {
    no: 7,
    type: 'ox',
    text: 'OCR 정확도는 항상 100%가 아니므로, LLM 후처리나 사람이 검수하기 쉬운 형태로 다시 정리하는 단계가 중요하다.',
    correct: 'O'
  },
  {
    no: 8,
    type: 'ox',
    text: 'FastAPI의 /docs 자동 문서는 단순 편의 기능일 뿐, 검수나 인수인계와는 관련이 없다.',
    correct: 'X'
  },
  {
    no: 9,
    type: 'short_text',
    text: "에이전트가 도구를 호출하고 결과를 받아 다음 행동을 결정하는 반복 루프의 '메타 구조'를 무엇이라 하는가?",
    correct_keywords: ['하네스', 'harness']
  },
  {
    no: 10,
    type: 'short_text',
    text: "Supabase에서 데이터 저장 계층에서부터 '행(Row) 수준'으로 접근 권한을 선언적으로 통제하는 정책의 약자(영문 3글자)는?",
    correct_keywords: ['rls', 'row level security', 'row-level security']
  },
  // ── 중급 (6) ──
  {
    no: 11,
    type: 'multiple_choice',
    text: 'MCP의 세 구성요소(Tool·Resource·Prompt)에 대한 설명으로 옳은 것은?',
    choices: [
      { key: '①', text: 'Tool은 읽기·참조 중심의 정보이다' },
      { key: '②', text: 'Resource는 세상에 변화를 일으키는 실행 동작이다' },
      { key: '③', text: 'Tool은 실행·변경, Resource는 읽기·참조, Prompt는 행동 방식 표준화이다' },
      { key: '④', text: '세 요소는 위험 수준이 모두 동일하다' }
    ],
    correct: '③'
  },
  {
    no: 12,
    type: 'multiple_choice',
    text: "RAG의 품질을 '가장 크게' 좌우하는 것은?",
    choices: [
      { key: '①', text: '임베딩 모델의 종류 하나' },
      { key: '②', text: '문서 분할·메타데이터·검색 결과 선정·인용 설계 같은 파이프라인 설계' },
      { key: '③', text: '서버의 물리적 성능' },
      { key: '④', text: '프론트엔드 화면 디자인' }
    ],
    correct: '②'
  },
  {
    no: 13,
    type: 'multiple_choice',
    text: '바이브 코딩의 핵심 루프 3단계 순서로 옳은 것은?',
    choices: [
      { key: '①', text: '코드 생성 → 요구사항 설계 → 검수' },
      { key: '②', text: '요구사항 설계 → 코드 생성·수신 → 검수·실행·피드백' },
      { key: '③', text: '검수 → 배포 → 요구사항 설계' },
      { key: '④', text: '요구사항 설계 → 배포 → 유지보수' }
    ],
    correct: '②'
  },
  {
    no: 14,
    type: 'ox',
    text: 'Electron 데스크톱 앱은 웹앱보다 항상 우수하므로 모든 상황에서 Electron을 선택해야 한다.',
    correct: 'X'
  },
  {
    no: 15,
    type: 'ox',
    text: 'MCP는 프롬프트를 잘 쓰는 기술이라기보다, AI에게 연결할 도구와 자원을 표준화하는 인프라에 더 가깝다.',
    correct: 'O'
  },
  {
    no: 16,
    type: 'short_text',
    text: 'MCP 구조는 세 층으로 이해할 수 있다. 사용자가 쓰는 AI 앱(Host), 요청을 중개하는 연결 계층(Client), 그리고 실제 DB 조회·파일 읽기·API 호출을 수행하는 쪽을 무엇이라 하는가?',
    correct_keywords: ['서버', 'server']
  },
  // ── 고급 (4) ──
  {
    no: 17,
    type: 'multiple_choice',
    text: "'RAG·파인튜닝·MCP 선택 기준'에 대한 설명으로 옳은 것은?",
    choices: [
      { key: '①', text: '최신 문서 검색에는 파인튜닝이 가장 적합하다' },
      { key: '②', text: '실시간 DB 조회·실행 도구 호출에는 MCP(또는 직접 API)가 매우 적합하다' },
      { key: '③', text: '조직의 표현 스타일 일관화에는 RAG가 가장 적합하다' },
      { key: '④', text: '세 기술은 서로 경쟁 관계여서 하나만 선택해야 한다' }
    ],
    correct: '②'
  },
  {
    no: 18,
    type: 'multiple_choice',
    text: '파인튜닝 판단 기준으로 옳은 것은?',
    choices: [
      { key: '①', text: '파인튜닝은 지식 최신성을 높이는 데 가장 적합하다' },
      { key: '②', text: '파인튜닝은 행동 패턴·표현 방식의 일관성 강화에 유리하며, JSONL 데이터셋 품질이 모델보다 중요할 수 있다' },
      { key: '③', text: '문서 최신성이 자주 바뀌고 데이터셋이 불안정할수록 파인튜닝을 먼저 해야 한다' },
      { key: '④', text: 'LoRA·QLoRA는 전체 모델을 처음부터 다시 학습시키는 방식이다' }
    ],
    correct: '②'
  },
  {
    no: 19,
    type: 'ox',
    text: 'Supabase의 Edge Functions를 이용하면, 프론트엔드에서 직접 LLM API를 호출하는 대신 키를 보호하고 호출 로그를 남기며 입력을 검증할 수 있다.',
    correct: 'O'
  },
  {
    no: 20,
    type: 'short_text',
    text: "RAG에서 '문장을 숫자 좌표로 바꾸어' 벡터 DB에 저장하고 유사도로 검색할 수 있게 하는 과정을 무엇이라 하는가?",
    correct_keywords: ['임베딩', 'embedding']
  }
];

const WEIGHT = 5;

function buildOptions(q: Q): Record<string, unknown> {
  if (q.type === 'multiple_choice') return { choices: q.choices, correct: q.correct };
  if (q.type === 'ox') return { correct: q.correct };
  return { correct_keywords: q.correct_keywords };
}

async function seedOne(cohortId: string, cohortLabel: string, type: 'pre' | 'post') {
  const title = `⑧ 바이브 코딩 LLM 서비스 개발 - ${type === 'pre' ? '사전' : '사후'} 역량평가`;

  const { data: existing } = await sb
    .from('diagnoses')
    .select('id')
    .eq('cohort_id', cohortId)
    .eq('type', type)
    .ilike('title', '⑧%');
  if (existing && existing.length > 0) {
    const ids = existing.map((r) => r.id);
    console.log(`  기존 ${type} ${existing.length}개 삭제`);
    await sb.from('diagnoses').delete().in('id', ids);
  }

  const { data: created, error: createErr } = await sb
    .from('diagnoses')
    .insert({ cohort_id: cohortId, title, type })
    .select('id')
    .single();
  if (createErr) throw new Error(createErr.message);
  const diagnosisId = created.id;

  const rows = QUESTIONS.map((q) => ({
    diagnosis_id: diagnosisId,
    question_no: q.no,
    type: q.type,
    text: q.text,
    options: buildOptions(q),
    weight: WEIGHT,
    required: true
  }));

  const { error: qErr } = await sb.from('diagnosis_questions').insert(rows);
  if (qErr) throw new Error(qErr.message);

  console.log(`  ✓ ${cohortLabel} / ${type}: ${QUESTIONS.length}문항 삽입 (diagnosis_id=${diagnosisId})`);
}

async function main() {
  for (const c of COHORTS) {
    console.log(`\n===== ${c.label} =====`);
    await seedOne(c.id, c.label, 'pre');
    await seedOne(c.id, c.label, 'post');
  }
  console.log('\n완료.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

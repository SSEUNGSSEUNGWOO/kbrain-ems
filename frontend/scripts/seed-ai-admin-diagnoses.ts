// AI 행정 융합 기획 사전·사후 역량평가 등록
// 대상: 'AI 행정 융합 기획' cohort × (pre + post) = 2 diagnoses, 각 20문항
// 가중치: 모든 문항 5점 = 만점 100
// 출처: "⑤ AI 행정 융합 기획_역량평가_수정본.docx"
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

const APPLY = process.argv.includes('--apply');

function shortToken(len = 8): string {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

type Choice = { key: string; text: string };
type Question = {
  no: number;
  type: 'multiple_choice' | 'ox' | 'short_text';
  text: string;
  weight: number;
  choices?: Choice[];
  correct?: string;
  correct_keywords?: string[];
};

const W = 5;

const QUESTIONS: Question[] = [
  {
    no: 1,
    type: 'multiple_choice',
    text: '교재가 제시한 AI의 진화 단계에 대한 설명으로 옳은 것은?',
    weight: W,
    choices: [
      { key: '①', text: '2023년 AI는 공급처 선택·계약 초안까지 다루는 수준이었다' },
      { key: '②', text: '2025년 AI는 질문 하나에 답 하나를 주는 검색창형 도구였다' },
      { key: '③', text: "2025년 AI는 한 지시에 여러 단계를 계획·실행하는 '동료'에 가까워졌다" },
      { key: '④', text: '2026년 AI는 단일 질문–단일 응답 수준에 머물러 있다' }
    ],
    correct: '③'
  },
  {
    no: 2,
    type: 'multiple_choice',
    text: '교재(및 MCP 공식 문서)가 MCP를 비유한 표현으로 옳은 것은?',
    weight: W,
    choices: [
      { key: '①', text: 'AI 애플리케이션을 외부 시스템에 연결하는 USB-C 같은 표준' },
      { key: '②', text: '데이터를 저장하는 대용량 하드디스크' },
      { key: '③', text: '모델 성능을 높이는 새로운 학습 알고리즘' },
      { key: '④', text: '인터넷 속도를 높이는 통신 규약' }
    ],
    correct: '①'
  },
  {
    no: 3,
    type: 'multiple_choice',
    text: '교재가 설명하는 HTML과 Python의 역할 분담으로 옳은 것은?',
    weight: W,
    choices: [
      { key: '①', text: '보여주는 일은 Python, 처리하는 일은 HTML이 강하다' },
      { key: '②', text: '보여주는 일은 HTML, 처리(파일·엑셀·API)는 Python이 강하다' },
      { key: '③', text: 'HTML이 운영체제 위에서 PC 전체 작업을 자동화한다' },
      { key: '④', text: 'Python은 브라우저 안에서만 작동한다' }
    ],
    correct: '②'
  },
  {
    no: 4,
    type: 'multiple_choice',
    text: '온디바이스 1B~3B급 소형 모델(SLM)의 장점으로 옳지 않은 것은?',
    weight: W,
    choices: [
      { key: '①', text: '데이터가 기기 밖으로 나가지 않아 반출 통제에 유리' },
      { key: '②', text: '인터넷 연결이 불안정해도 동작 가능' },
      { key: '③', text: '긴 문서 생성과 복잡한 추론에서 대형 모델보다 뛰어남' },
      { key: '④', text: '반응 속도가 일정함' }
    ],
    correct: '③'
  },
  {
    no: 5,
    type: 'multiple_choice',
    text: "교재가 강조하는 '좋은 공공 AI 기획'의 출발점으로 가장 적절한 것은?",
    weight: W,
    choices: [
      { key: '①', text: '가장 성능이 좋은 최신 모델을 먼저 고르는 것' },
      { key: '②', text: '누구의 어떤 결핍(문제)을 풀 것인지 먼저 정의하는 것' },
      { key: '③', text: '예산을 최대한 크게 잡는 것' },
      { key: '④', text: '유행하는 도구를 빠르게 도입하는 것' }
    ],
    correct: '②'
  },
  {
    no: 6,
    type: 'ox',
    text: '교재는 "AI를 통한 행정 혁신은 전문 개발자만이 주체가 되며 일반 실무자는 어렵다"고 본다.',
    weight: W,
    correct: 'X'
  },
  {
    no: 7,
    type: 'ox',
    text: 'HTML/CSS/JS 단일 파일 도구는 설치·서버 없이 브라우저만으로 실행되어 폐쇄망(내부망) 도입에 유리하다.',
    weight: W,
    correct: 'O'
  },
  {
    no: 8,
    type: 'ox',
    text: '코딩 에이전트가 코드 생성·실행·수정을 자동 반복하므로, 사람이 결과를 검증할 필요는 사라진다.',
    weight: W,
    correct: 'X'
  },
  {
    no: 9,
    type: 'short_text',
    text: "AI(LLM)가 외부 도구를 표준 인터페이스로 호출할 수 있게 하는 'Model Context Protocol'의 약자(영문 3글자)는?",
    weight: W,
    correct_keywords: ['MCP', 'mcp', 'Mcp', 'Model Context Protocol', 'model context protocol']
  },
  {
    no: 10,
    type: 'short_text',
    text: '교재는 "AI 서비스 기획은 여러 기술 부품을 어떤 순서·세기로 조합할지 결정하는 ( )이다"라고 정의한다. ( )에 들어갈 말(지휘에 비유한 용어)을 쓰시오.',
    weight: W,
    correct_keywords: ['오케스트레이션', 'Orchestration', 'orchestration', 'ORCHESTRATION']
  },
  {
    no: 11,
    type: 'multiple_choice',
    text: 'Prompting · Workflow · Agent · Agentic AI 네 층위에 대한 설명으로 옳은 것은?',
    weight: W,
    choices: [
      { key: '①', text: 'Prompting은 도구를 호출·재시도하며 상태를 유지한다' },
      { key: '②', text: 'Workflow는 질문 1회·응답 1회에 가까운 구조다' },
      { key: '③', text: 'Agent는 도구를 호출하고 재시도하며 상태를 유지하는 구조다' },
      { key: '④', text: 'Agentic AI는 정해진 단계를 순서대로만 실행한다' }
    ],
    correct: '③'
  },
  {
    no: 12,
    type: 'multiple_choice',
    text: "교재의 '세 갈래 모델 공급 전략'에 해당하지 '않는' 것은?",
    weight: W,
    choices: [
      { key: '①', text: '프론티어 API 전략' },
      { key: '②', text: '빠른 추격형 저비용 전략' },
      { key: '③', text: '오픈웨이트·자체운영 전략' },
      { key: '④', text: '단일 모델 전사 통일 전략' }
    ],
    correct: '④'
  },
  {
    no: 13,
    type: 'multiple_choice',
    text: 'MCP를 구성하는 세 요소(Tool·Resource·Prompt)에 대한 설명으로 옳은 것은?',
    weight: W,
    choices: [
      { key: '①', text: "Tool은 읽을 수 있는 파일·DB 등 '자원'이다" },
      { key: '②', text: 'Resource는 LLM이 직접 호출하는 함수·명령이다' },
      { key: '③', text: 'Prompt는 도구를 어떤 맥락·규칙으로 쓸지 정의하는 지시문(운영 규칙)이다' },
      { key: '④', text: '세 요소는 모두 같은 기능을 다른 이름으로 부른 것이다' }
    ],
    correct: '③'
  },
  {
    no: 14,
    type: 'ox',
    text: "'제약 캐스케이드'란 네트워크(외부망/반폐쇄/폐쇄망) 등 제약 하나를 정하면 쓸 수 있는 기술·모델 조합이 함께 좁혀진다는 개념이다.",
    weight: W,
    correct: 'O'
  },
  {
    no: 15,
    type: 'ox',
    text: "교재는 조달 문서에서 '오픈소스', '오픈웨이트', 'API형 호스팅 모델'을 모두 같은 의미로 사용해도 무방하다고 본다.",
    weight: W,
    correct: 'X'
  },
  {
    no: 16,
    type: 'short_text',
    text: '교재가 강조하는 공공 AI 기획의 설계 순서는 ‘( ㉠ ) → WHAT → HOW’이며, 이 순서를 뒤집으면 기술 설명이 문제 정의를 압도하게 된다. ㉠에 들어갈 영문 단어를 쓰시오.',
    weight: W,
    correct_keywords: ['WHY', 'Why', 'why', '와이']
  },
  {
    no: 17,
    type: 'multiple_choice',
    text: "MCP 도구 권한 3단계(읽기 전용 / 제한적 쓰기 / 실행·변경) 설계에서 '단계–예시' 연결이 옳은 것은?",
    weight: W,
    choices: [
      { key: '①', text: '읽기 전용 — 메일 발송, DB 수정' },
      { key: '②', text: '제한적 쓰기 — 인구 조회, 규정 검색' },
      { key: '③', text: '제한적 쓰기 — 초안 파일 생성·임시 보고서 저장(되돌리기 쉬운 변경)' },
      { key: '④', text: '실행·변경 — 통계 조회, 예산 조회' }
    ],
    correct: '③'
  },
  {
    no: 18,
    type: 'multiple_choice',
    text: 'Ollama Modelfile의 하이퍼파라미터에 대한 설명으로 옳은 것은?',
    weight: W,
    choices: [
      { key: '①', text: "temperature는 출력의 '길이'를 결정한다" },
      { key: '②', text: "seed는 결과의 '재현성'에 영향을 준다" },
      { key: '③', text: "num_predict는 답변의 '창의성·변동성'을 조절한다" },
      { key: '④', text: '공공 실무에서는 창의성을 위해 temperature를 항상 높게 잡는 것이 안전하다' }
    ],
    correct: '②'
  },
  {
    no: 19,
    type: 'ox',
    text: 'NIST AI RMF는 Govern·Map·Measure·Manage의 흐름으로 책임자·맥락·측정지표·위험완화를 점검하도록 돕는 위험관리 프레임워크다.',
    weight: W,
    correct: 'O'
  },
  {
    no: 20,
    type: 'short_text',
    text: '빈 입력창 앞에서 막막한 사용자를 위해, LLM에게 "내가 답해야 할 질문을 먼저 해 달라"고 하여 모델이 필요한 구조를 질문으로 꺼내게 하는 기법을 무엇이라 하는가?',
    weight: W,
    correct_keywords: ['메타 프롬프트', '메타프롬프트', 'Meta Prompt', 'Meta-Prompt', 'meta prompt', 'meta-prompt', 'METAPROMPT']
  }
];

const COHORT_NAME = 'AI 행정 융합 기획';
const TITLE_BASE = 'AI 행정 융합 기획 - 사전·사후 역량평가';

async function buildShareCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const c = shortToken(8);
    const { data } = await supabase
      .from('diagnoses')
      .select('id')
      .eq('share_code', c)
      .maybeSingle();
    if (!data) return c;
  }
  throw new Error('share_code 충돌');
}

async function main() {
  console.log(`mode: ${APPLY ? 'APPLY' : 'dry-run'}\n========== ${COHORT_NAME} ==========`);

  const { data: cohort } = await supabase
    .from('cohorts')
    .select('id')
    .eq('name', COHORT_NAME)
    .maybeSingle();
  if (!cohort) {
    console.log('  cohort 없음');
    return;
  }

  for (const dxType of ['pre', 'post'] as const) {
    const title = `${TITLE_BASE} (${dxType === 'pre' ? '사전' : '사후'})`;

    const { data: existing } = await supabase
      .from('diagnoses')
      .select('id')
      .eq('cohort_id', cohort.id)
      .eq('type', dxType)
      .maybeSingle();
    if (existing) {
      console.log(`  [SKIP ${dxType}] 이미 존재`);
      continue;
    }

    if (!APPLY) {
      console.log(`  [dry-run ${dxType}] 생성 예정 — ${QUESTIONS.length}문항`);
      continue;
    }

    const share_code = await buildShareCode();
    const { data: diag, error: dErr } = await supabase
      .from('diagnoses')
      .insert({
        cohort_id: cohort.id,
        title,
        type: dxType,
        share_code
      })
      .select('id')
      .single();
    if (dErr || !diag) {
      console.log(`  [ERR ${dxType}] ${dErr?.message}`);
      continue;
    }

    const rows = QUESTIONS.map((q) => ({
      diagnosis_id: diag.id,
      question_no: q.no,
      type: q.type,
      text: q.text,
      options:
        q.type === 'multiple_choice'
          ? { choices: q.choices, correct: q.correct }
          : q.type === 'ox'
            ? { correct: q.correct }
            : { correct_keywords: q.correct_keywords },
      weight: q.weight,
      required: true
    }));
    const { error: qErr } = await supabase.from('diagnosis_questions').insert(rows);
    if (qErr) {
      console.log(`  [ERR ${dxType} questions] ${qErr.message}`);
      await supabase.from('diagnoses').delete().eq('id', diag.id);
      continue;
    }

    console.log(
      `  [OK ${dxType}] code=${share_code}  questions=${rows.length}  diag=${diag.id.slice(0, 8)}`
    );
  }

  console.log(`\n완료${APPLY ? '' : ' (dry-run)'}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

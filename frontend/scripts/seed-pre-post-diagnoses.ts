// 사전·사후 역량평가 등록 — 3개 cohort × (pre + post) = 6 diagnoses, 각 20문항.
// 가중치: 초급(1-10) 3점 / 중급(11-16) 5점 / 고급(17-20) 8점 → 만점 100점
// 자동 발급: share_code (운영자가 일정·출석연동은 추후 설정)
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

// 초급 1-10 → 3점, 중급 11-16 → 5점, 고급 17-20 → 10점 (= 만점 100)
const W = (no: number) => (no <= 10 ? 3 : no <= 16 ? 5 : 10);

// ── ① AI 리터러시와 업무활용 ──────────────────────────────────
const Q1: Question[] = [
  {
    no: 1,
    type: 'multiple_choice',
    text: 'AI의 발전 흐름을 시대순으로 바르게 나열한 것은?',
    weight: W(1),
    choices: [
      { key: '①', text: '머신러닝 → 규칙 기반 → 딥러닝 → 생성형 AI' },
      { key: '②', text: '규칙 기반 → 머신러닝 → 딥러닝 → 생성형 AI' },
      { key: '③', text: '규칙 기반 → 딥러닝 → 머신러닝 → 생성형 AI' },
      { key: '④', text: '딥러닝 → 머신러닝 → 규칙 기반 → 생성형 AI' }
    ],
    correct: '②'
  },
  {
    no: 2,
    type: 'multiple_choice',
    text: '대규모 언어모델(LLM)의 작동 원리를 가장 잘 설명한 것은?',
    weight: W(2),
    choices: [
      { key: '①', text: '정답을 데이터베이스에서 검색해 출력한다' },
      { key: '②', text: '다음에 올 토큰을 확률적으로 예측해 생성한다' },
      { key: '③', text: '모든 사실을 외워 저장해 두었다가 그대로 꺼내준다' },
      { key: '④', text: '사람이 입력한 규칙에 따라 문장을 조립한다' }
    ],
    correct: '②'
  },
  {
    no: 3,
    type: 'multiple_choice',
    text: 'AI가 사실과 다른 내용을 그럴듯하게 만들어내는 현상을 무엇이라 하는가?',
    weight: W(3),
    choices: [
      { key: '①', text: '토큰화(Tokenization)' },
      { key: '②', text: '임베딩(Embedding)' },
      { key: '③', text: '환각(Hallucination)' },
      { key: '④', text: '파인튜닝(Fine-Tuning)' }
    ],
    correct: '③'
  },
  {
    no: 4,
    type: 'multiple_choice',
    text: "'좋은 프롬프트의 기본 구조'에 해당하지 않는 것은?",
    weight: W(4),
    choices: [
      { key: '①', text: '역할' },
      { key: '②', text: '맥락' },
      { key: '③', text: '작업·형식·제약' },
      { key: '④', text: '모델의 파라미터 수' }
    ],
    correct: '④'
  },
  {
    no: 5,
    type: 'multiple_choice',
    text: 'LLM 서비스와 강점의 연결이 옳지 않은 것은?',
    weight: W(5),
    choices: [
      { key: '①', text: 'Perplexity — 출처 인용 기반 검색' },
      { key: '②', text: 'Claude — 긴 문서 처리·글쓰기·추론' },
      { key: '③', text: 'Gemini — 1M 토큰 대규모 컨텍스트' },
      { key: '④', text: 'Grok — 출처 인용 정확도 1위' }
    ],
    correct: '④'
  },
  {
    no: 6,
    type: 'ox',
    text: 'LLM은 사실을 정확히 저장해 둔 지식 데이터베이스이므로, 답변에 대한 사실 검증은 필요 없다.',
    weight: W(6),
    correct: 'X'
  },
  {
    no: 7,
    type: 'ox',
    text: '멀티모달 AI는 텍스트뿐 아니라 이미지·음성·영상 등도 함께 이해하고 생성할 수 있다.',
    weight: W(7),
    correct: 'O'
  },
  {
    no: 8,
    type: 'ox',
    text: '공공 영역에서 사실 검증이 중요한 경우에도, 하나의 모델 답변에만 의존하는 것이 가장 안전하다.',
    weight: W(8),
    correct: 'X'
  },
  {
    no: 9,
    type: 'short_text',
    text: "LLM이 텍스트를 처리할 때 다루는 '최소 단위'를 무엇이라 하는가?",
    weight: W(9),
    correct_keywords: ['토큰', 'token', 'Token', 'TOKEN']
  },
  {
    no: 10,
    type: 'short_text',
    text: '텍스트·이미지·코드 등 새로운 콘텐츠를 만들어내는 AI를 통칭하여 무엇이라 부르는가?',
    weight: W(10),
    correct_keywords: ['생성형 AI', '생성형AI', 'Generative AI', 'GenAI', '제너레이티브 AI']
  },
  {
    no: 11,
    type: 'multiple_choice',
    text: '머신러닝과 딥러닝의 차이로 옳은 것은?',
    weight: W(11),
    choices: [
      { key: '①', text: '머신러닝은 특징(feature)을 모델이 스스로 학습한다' },
      { key: '②', text: '딥러닝은 사람이 특징을 직접 설계해야 한다' },
      { key: '③', text: '머신러닝은 해석 가능성이 상대적으로 높고 정형 데이터 예측·분류에 강하다' },
      { key: '④', text: '딥러닝은 적은 데이터에서만 성능이 좋다' }
    ],
    correct: '③'
  },
  {
    no: 12,
    type: 'multiple_choice',
    text: '트랜스포머의 텍스트 생성 4단계 순서로 옳은 것은?',
    weight: W(12),
    choices: [
      { key: '①', text: '임베딩 → 토큰화 → 디코딩 → 트랜스포머' },
      { key: '②', text: '토큰화 → 임베딩 → 트랜스포머(Self-Attention) → 디코딩' },
      { key: '③', text: '디코딩 → 토큰화 → 임베딩 → 트랜스포머' },
      { key: '④', text: '토큰화 → 트랜스포머 → 디코딩 → 임베딩' }
    ],
    correct: '②'
  },
  {
    no: 13,
    type: 'multiple_choice',
    text: 'RAG(검색증강생성)에 대한 설명으로 옳은 것은?',
    weight: W(13),
    choices: [
      { key: '①', text: '모델 내부 가중치를 다시 학습시켜 지식을 바꾸는 기법이다' },
      { key: '②', text: '외부 문서를 검색해 맥락에 주입함으로써 환각을 줄이고 출처 기반 답변을 가능하게 한다' },
      { key: '③', text: '여러 에이전트가 서로 통신하는 협업 구조이다' },
      { key: '④', text: '이미지를 텍스트로 변환하는 멀티모달 기술이다' }
    ],
    correct: '②'
  },
  {
    no: 14,
    type: 'ox',
    text: 'Context Engineering 관점에서 프롬프트는 AI가 보는 맥락(System Prompt·Memory·RAG·도구 등) 전체 중 하나의 요소에 불과하다.',
    weight: W(14),
    correct: 'O'
  },
  {
    no: 15,
    type: 'ox',
    text: '메타프롬프트는 사용자가 전문 용어를 모두 외워 직접 정교한 프롬프트를 작성해야만 쓸 수 있는 기법이다.',
    weight: W(15),
    correct: 'X'
  },
  {
    no: 16,
    type: 'short_text',
    text: 'AI(LLM)가 외부 앱·도구와 연결되는 방식을 표준화한 개방형 프로토콜의 약자(영문 3글자)는 무엇인가?',
    weight: W(16),
    correct_keywords: ['MCP', 'mcp', 'Model Context Protocol']
  },
  {
    no: 17,
    type: 'multiple_choice',
    text: 'RAG와 파인튜닝(Fine-Tuning)의 선택 기준으로 가장 적절한 것은?',
    weight: W(17),
    choices: [
      { key: '①', text: '최신 문서와 근거 인용이 중요하면 파인튜닝이 유리하다' },
      { key: '②', text: '조직 특유의 표현 스타일·응답 구조의 일관성을 강화하려면 파인튜닝이 유리하다' },
      { key: '③', text: 'RAG와 파인튜닝은 항상 같은 문제를 푸는 경쟁 기술이다' },
      { key: '④', text: '자주 바뀌는 실시간 DB 값에는 항상 RAG가 최선이다' }
    ],
    correct: '②'
  },
  {
    no: 18,
    type: 'multiple_choice',
    text: '프롬프트 기법과 용도의 연결이 옳은 것은?',
    weight: W(18),
    choices: [
      { key: '①', text: 'CoT(Chain of Thought) — 보고서 압축 요약' },
      { key: '②', text: 'CoVe(Chain of Verification) — 초안 후 스스로 검증 질문을 만들어 팩트체크' },
      { key: '③', text: 'ReAct — 구체 질문 전에 상위 원칙부터 먼저 정리' },
      { key: '④', text: 'Step-Back — 추론을 코드로 바꿔 실행해 검증' }
    ],
    correct: '②'
  },
  {
    no: 19,
    type: 'ox',
    text: "'Receive Code, Run Local' 원칙은 민감 데이터를 외부 서비스에 올리지 않고, LLM에게는 코드만 받아 실제 실행은 로컬(내 PC)에서 수행하는 방식이다.",
    weight: W(19),
    correct: 'O'
  },
  {
    no: 20,
    type: 'short_text',
    text: 'AI 에이전트가 일반 챗봇과 구별되는 핵심은 목표를 바탕으로 스스로 계획을 세우고, 도구를 사용해 작업을 실행하며, 그 결과를 평가·보완하는 반복 과정을 수행한다는 점이다. 이러한 시스템을 무엇이라 하는가?',
    weight: W(20),
    correct_keywords: ['AI 에이전트', 'AI에이전트', 'AI agent', 'agent', '에이전트', '에이전틱 AI']
  }
];

// ── ② 데이터 리터러시 ────────────────────────────────────────
const Q2: Question[] = [
  {
    no: 1,
    type: 'multiple_choice',
    text: '데이터 리터러시는 무엇에서 출발한다고 보는가?',
    weight: W(1),
    choices: [
      { key: '①', text: '고급 통계 프로그램 사용 능력' },
      { key: '②', text: '인간의 인지편향을 인식하는 것' },
      { key: '③', text: '가능한 한 많은 데이터를 수집하는 것' },
      { key: '④', text: '프로그래밍 언어 학습' }
    ],
    correct: '②'
  },
  {
    no: 2,
    type: 'multiple_choice',
    text: '"뉴스에서 비행기 사고를 보면 자동차보다 비행기가 더 위험하다고 느끼는" 것처럼, 즉각 떠오르는 사례 중심으로 판단하는 인지편향은?',
    weight: W(2),
    choices: [
      { key: '①', text: '확증편향' },
      { key: '②', text: '앵커링 효과' },
      { key: '③', text: '가용성 휴리스틱' },
      { key: '④', text: '생존자 편향' }
    ],
    correct: '③'
  },
  {
    no: 3,
    type: 'multiple_choice',
    text: '자신의 기존 믿음을 확인해주는 정보만 선택적으로 수집하는 경향으로, 테라노스 사례에서 드러난 인지편향은?',
    weight: W(3),
    choices: [
      { key: '①', text: '확증편향' },
      { key: '②', text: '밴드웨건 효과' },
      { key: '③', text: '앵커링 효과' },
      { key: '④', text: '자동화편향' }
    ],
    correct: '①'
  },
  {
    no: 4,
    type: 'multiple_choice',
    text: "'데이터 분석의 본질'을 가장 잘 표현한 것은?",
    weight: W(4),
    choices: [
      { key: '①', text: '가능한 한 많은 차트를 만드는 것' },
      { key: '②', text: '현실의 현상(비디지털)을 데이터(디지털) 문제로 변환하는 것' },
      { key: '③', text: '통계 공식을 정확히 암기하는 것' },
      { key: '④', text: '최신 AI 도구를 구매하는 것' }
    ],
    correct: '②'
  },
  {
    no: 5,
    type: 'multiple_choice',
    text: '두 변수 간의 관계나 분포를 점으로 표현하여 상관관계를 분석할 때 가장 적합한 차트는?',
    weight: W(5),
    choices: [
      { key: '①', text: '원형 차트' },
      { key: '②', text: '꺾은선형 차트' },
      { key: '③', text: '산점도 차트' },
      { key: '④', text: '가로 막대형 차트' }
    ],
    correct: '③'
  },
  {
    no: 6,
    type: 'ox',
    text: "좋은 데이터 분석은 좋은 분석 '도구'보다 좋은 '질문(문제 정의)'에서 시작된다.",
    weight: W(6),
    correct: 'O'
  },
  {
    no: 7,
    type: 'ox',
    text: '행동경제학에 따르면 인간의 직감(휴리스틱)은 항상 정확하므로 데이터로 검증할 필요가 없다.',
    weight: W(7),
    correct: 'X'
  },
  {
    no: 8,
    type: 'ox',
    text: '공공데이터 포털에서는 파일 다운로드뿐 아니라 Open API 형태로도 데이터를 제공받을 수 있다.',
    weight: W(8),
    correct: 'O'
  },
  {
    no: 9,
    type: 'short_text',
    text: "대부분의 데이터를 구성하는 '기본 두 축(데이터 구조)'은 무엇과 무엇인가?",
    weight: W(9),
    correct_keywords: ['행과 열', '행, 열', '행/열', 'row column', 'Row Column', '행(Row)과 열(Column)', '열과 행', 'Row와 Column']
  },
  {
    no: 10,
    type: 'short_text',
    text: "엑셀에 내장된 자동화 언어로, 반복 업무 자동화 시 비개발자에게는 '매크로'로 체감되는 것의 명칭(영문 약자)은?",
    weight: W(10),
    correct_keywords: ['VBA', 'vba', 'Visual Basic for Applications']
  },
  {
    no: 11,
    type: 'multiple_choice',
    text: "머신러닝 '지도학습'에 대한 설명으로 옳은 것은?",
    weight: W(11),
    choices: [
      { key: '①', text: '맞춰야 할 Y값(정답)이 없을 때 사용한다' },
      { key: '②', text: '숫자값을 맞추면 분류, 카테고리를 맞추면 회귀이다' },
      { key: '③', text: '맞춰야 할 Y값이 있으며, 숫자값을 맞추면 회귀·카테고리를 맞추면 분류이다' },
      { key: '④', text: '열 데이터를 묶어 차원축소하는 것이 지도학습이다' }
    ],
    correct: '③'
  },
  {
    no: 12,
    type: 'multiple_choice',
    text: "머신러닝 '비지도학습'에 대한 설명으로 옳은 것은?",
    weight: W(12),
    choices: [
      { key: '①', text: '정답(Y값)을 기준으로 학습한다' },
      { key: '②', text: '유사한 관측값을 묶는 군집화나, 데이터의 정보를 최대한 보존하며 변수 수를 줄이는 차원축소를 수행한다' },
      { key: '③', text: '회귀와 분류가 대표적인 비지도학습이다' },
      { key: '④', text: '반드시 레이블(정답)이 있어야 한다' }
    ],
    correct: '②'
  },
  {
    no: 13,
    type: 'multiple_choice',
    text: '데이터를 합치는 방식에 대한 설명으로 옳은 것은?',
    weight: W(13),
    choices: [
      { key: '①', text: '열을 합치면 UNION, 행을 합치면 JOIN' },
      { key: '②', text: '열을 합치면 JOIN, 행을 합치면 UNION' },
      { key: '③', text: 'JOIN과 UNION은 모두 행을 늘리는 연산이다' },
      { key: '④', text: 'GROUP BY는 두 테이블을 연결하는 명령이다' }
    ],
    correct: '②'
  },
  {
    no: 14,
    type: 'ox',
    text: 'X-Y 게임은 막연한 현실의 궁금증을 "X라면 Y일 것이다" 형태의 검증 가능한 가설로 바꾸는 훈련이다.',
    weight: W(14),
    correct: 'O'
  },
  {
    no: 15,
    type: 'ox',
    text: 'X-Y 게임에서 X는 결과·목표 변수(종속변수)이고, Y는 원인·설명 변수(독립변수)이다.',
    weight: W(15),
    correct: 'X'
  },
  {
    no: 16,
    type: 'short_text',
    text: "'문제 정의가 출발하는 세 가지 관점'은 궁금하다(Curiosity), ( ㉠ ), 불편하다(Pain Point)이다. ㉠에 해당하는 관점을 쓰시오.",
    weight: W(16),
    correct_keywords: ['알 수 없다', 'Blind Spot', 'blind spot', '블라인드 스팟', '모른다', '알수없다']
  },
  {
    no: 17,
    type: 'multiple_choice',
    text: '롱 포맷(Long-Format)과 와이드 포맷(Wide-Format)에 대한 설명으로 옳은 것은?',
    weight: W(17),
    choices: [
      { key: '①', text: "와이드 포맷은 측정기준이 '열로만' 구성된다" },
      { key: '②', text: '롱 포맷은 측정기준이 행과 열로 구분되어 있다' },
      { key: '③', text: '롱 포맷은 각 관측값이 행 방향으로 쌓이며, 측정 항목과 측정값이 각각 별도의 열로 구성된다' },
      { key: '④', text: '두 포맷은 구조가 동일하여 상호 변환이 불필요하다' }
    ],
    correct: '③'
  },
  {
    no: 18,
    type: 'multiple_choice',
    text: "'딥러닝'의 작동 원리로 가장 적절한 것은?",
    weight: W(18),
    choices: [
      { key: '①', text: '사람이 모든 특징(feature)을 직접 설계해 입력한다' },
      { key: '②', text: '데이터를 여러 층(layer)에 통과시키며 각 층이 스스로 특징을 학습한다' },
      { key: '③', text: '규칙을 미리 정해두고 그 규칙대로만 판단한다' },
      { key: '④', text: '정답이 없는 데이터에서는 전혀 작동하지 않는다' }
    ],
    correct: '②'
  },
  {
    no: 19,
    type: 'ox',
    text: '자동화편향(Automation Bias)은 자동화 시스템(AI 등)이 사람보다 항상 더 나은 결과를 준다고 과신하는 경향으로, 데이터 리터러시 관점에서 경계해야 할 편향이다.',
    weight: W(19),
    correct: 'O'
  },
  {
    no: 20,
    type: 'short_text',
    text: '피벗 테이블에서 행·열에 배치해 "어떤 기준으로 나눌지"를 정하는 것을 ( ㉠ ), 값 영역에 넣어 합계·평균 등으로 집계하는 것을 측정값(측정항목)이라 한다. ㉠에 들어갈 용어를 쓰시오.',
    weight: W(20),
    correct_keywords: ['측정기준', 'Dimension', 'dimension', '디멘션', '차원']
  }
];

// ── ④ 생성형 AI 활용 노코드 데이터분석 ────────────────────────────
const Q4: Question[] = [
  {
    no: 1,
    type: 'multiple_choice',
    text: '생성형 AI 시대에 데이터 분석가의 역할 변화로 가장 적절한 것은?',
    weight: W(1),
    choices: [
      { key: '①', text: '데이터를 직접 입력하는 사람' },
      { key: '②', text: "코드를 직접 쓰는 사람에서 '설계하고 연결하는 사람'으로 변모" },
      { key: '③', text: '통계 공식을 암기하는 사람' },
      { key: '④', text: '서버를 관리하는 사람' }
    ],
    correct: '②'
  },
  {
    no: 2,
    type: 'multiple_choice',
    text: 'DX와 AX의 차이로 옳은 것은?',
    weight: W(2),
    choices: [
      { key: '①', text: 'DX는 생성형 AI, AX는 예측 AI 중심이다' },
      { key: '②', text: 'DX는 과학적 의사결정 기반, AX는 업무생산성·효율성 증대' },
      { key: '③', text: '둘은 동일한 개념이다' },
      { key: '④', text: 'DX는 디자인, AX는 액션을 의미한다' }
    ],
    correct: '②'
  },
  {
    no: 3,
    type: 'multiple_choice',
    text: "'바이브 코딩(vibe coding)'에 대한 설명으로 가장 적절한 것은?",
    weight: W(3),
    choices: [
      { key: '①', text: '코드를 한 줄도 쓰지 않는 노코드 도구만 사용하는 것' },
      { key: '②', text: '파이썬을 직접 작성하지 않고 LLM에게 코드를 받아 실행하는 것' },
      { key: '③', text: '음악을 들으며 코딩하는 방법' },
      { key: '④', text: '코드를 외워서 작성하는 방식' }
    ],
    correct: '②'
  },
  {
    no: 4,
    type: 'multiple_choice',
    text: 'Google Colab에 대한 설명으로 옳은 것은?',
    weight: W(4),
    choices: [
      { key: '①', text: '반드시 설치해야 하는 데스크톱 프로그램이다' },
      { key: '②', text: '구글 계정으로 브라우저에서 파이썬을 편집·실행하는 도구다' },
      { key: '③', text: '엑셀 전용 분석 도구다' },
      { key: '④', text: '데이터베이스 관리 시스템이다' }
    ],
    correct: '②'
  },
  {
    no: 5,
    type: 'multiple_choice',
    text: '데이터의 전체 구조(컬럼 타입·결측치 개수)를 빠르게 파악할 때 사용하는 것은?',
    weight: W(5),
    choices: [
      { key: '①', text: 'df.plot()' },
      { key: '②', text: 'df.info()' },
      { key: '③', text: 'df.merge()' },
      { key: '④', text: 'df.to_csv()' }
    ],
    correct: '②'
  },
  {
    no: 6,
    type: 'multiple_choice',
    text: "'항목별 크기 비교'에 가장 적합한 차트는?",
    weight: W(6),
    choices: [
      { key: '①', text: '막대 차트(bar)' },
      { key: '②', text: '산점도(scatter)' },
      { key: '③', text: '히스토그램(hist)' },
      { key: '④', text: '히트맵(heatmap)' }
    ],
    correct: '①'
  },
  {
    no: 7,
    type: 'ox',
    text: '생성형 AI 시대의 데이터 분석에서는 코드를 생성하고 분석 결과물을 해석하는 데 생성형 AI(LLM)를 활용한다.',
    weight: W(7),
    correct: 'O'
  },
  {
    no: 8,
    type: 'ox',
    text: '전체 데이터를 다 알지 못해도 데이터의 컬럼명과 유형만 인식하면 분석이 가능하다.',
    weight: W(8),
    correct: 'O'
  },
  {
    no: 9,
    type: 'ox',
    text: '시간에 따른 변화를 보여줄 때는 산점도(scatter)가 가장 적합하다.',
    weight: W(9),
    correct: 'X'
  },
  {
    no: 10,
    type: 'short_text',
    text: 'matplotlib 위에 얹어 쓰는 통계 전문 시각화 라이브러리로, 박스플롯·바이올린플롯·히트맵을 간결하게 그릴 수 있는 라이브러리의 이름을 쓰시오.',
    weight: W(10),
    correct_keywords: ['seaborn', 'Seaborn', '시본', 'SEABORN']
  },
  {
    no: 11,
    type: 'multiple_choice',
    text: "'분석 어시스트' 시스템 프롬프트 패턴의 규칙으로 적절하지 않은 것은?",
    weight: W(11),
    choices: [
      { key: '①', text: '요청한 작업에 대해서만 코드를 작성한다' },
      { key: '②', text: '필요한 라이브러리 설치 코드를 포함한다' },
      { key: '③', text: '결과 확인 전에 다음 단계를 한꺼번에 미리 제안한다' },
      { key: '④', text: '코드 → 실행 결과 확인 포인트 순서로 제시한다' }
    ],
    correct: '③'
  },
  {
    no: 12,
    type: 'multiple_choice',
    text: '두 범주형 변수를 동시에 보고 더 깊은 패턴을 파악할 때 쓰는 EDA 기법은?',
    weight: W(12),
    choices: [
      { key: '①', text: 'describe()' },
      { key: '②', text: '교차집계(crosstab)' },
      { key: '③', text: '히스토그램(hist)' },
      { key: '④', text: 'info()' }
    ],
    correct: '②'
  },
  {
    no: 13,
    type: 'multiple_choice',
    text: '박스플롯이 한 장에 동시에 보여주는 5가지 정보로 옳은 것은?',
    weight: W(13),
    choices: [
      { key: '①', text: '평균·분산·표준편차·왜도·첨도' },
      { key: '②', text: '최솟값·Q1·중앙값·Q3·최댓값' },
      { key: '③', text: '합계·평균·개수·최대·최소' },
      { key: '④', text: '빈도·비율·누적·순위·등급' }
    ],
    correct: '②'
  },
  {
    no: 14,
    type: 'ox',
    text: '상관계수가 0에 가까우면 두 변수는 서로 관계가 강하다는 뜻이다.',
    weight: W(14),
    correct: 'X'
  },
  {
    no: 15,
    type: 'ox',
    text: 'pd.read_html()은 HTML 내 <table> 태그를 자동으로 찾아 DataFrame으로 변환해 주므로, 테이블 형태의 데이터라면 BeautifulSoup으로 직접 파싱하는 것보다 간편하다.',
    weight: W(15),
    correct: 'O'
  },
  {
    no: 16,
    type: 'short_text',
    text: "박스플롯에 분포 곡선(커널 밀도 추정)을 겹쳐 그려, 데이터가 어디에 몰려 있는지 분포의 '형태'까지 보여주는 차트의 이름을 쓰시오.",
    weight: W(16),
    correct_keywords: ['바이올린플롯', '바이올린 플롯', 'violinplot', 'violin plot', 'Violinplot']
  },
  {
    no: 17,
    type: 'multiple_choice',
    text: "분석 자동화 난이도 최상위인 'AI 에이전트·서비스 연결' 단계로, 내부 문서를 벡터 DB에 저장하고 질의응답 서비스를 구축하는 파이프라인 기술은?",
    weight: W(17),
    choices: [
      { key: '①', text: 'RAG 파이프라인 (LangChain, ChromaDB)' },
      { key: '②', text: '엑셀 파일 합치기 (openpyxl)' },
      { key: '③', text: '이미지 일괄 처리 (Pillow)' },
      { key: '④', text: 'PDF 합치기 (PyPDF2)' }
    ],
    correct: '①'
  },
  {
    no: 18,
    type: 'ox',
    text: 'regplot은 일반 산점도와 달리 회귀 직선과 신뢰 구간을 자동으로 그려주어, "면적이 커지면 수용인원이 진짜 늘어나는가?" 같은 관계를 시각적으로 검증할 수 있다.',
    weight: W(18),
    correct: 'O'
  },
  {
    no: 19,
    type: 'short_text',
    text: '"서울은 유료 비율이 38%로 전국 1위"라는 메시지를 전달하려면, 절대 수 비교(카운트플롯)와 비율 비교 중 어떤 차트에 근거해야 하는지 쓰시오.',
    weight: W(19),
    correct_keywords: ['비율 비교', '비율비교', '비율 차트', '100% 누적 막대', '비율']
  },
  {
    no: 20,
    type: 'short_text',
    text: '같은 분석 결과라도 LLM마다 산출물이 다른데, 한국어 격식체(~임, ~함, ~됨) 보고서에 가장 강해 상사 대상 공식 서면보고에 추천되는 LLM의 이름을 쓰시오.',
    weight: W(20),
    correct_keywords: ['Claude', 'claude', '클로드', 'CLAUDE']
  }
];

type Eval = { cohortName: string; titleBase: string; questions: Question[] };
const EVALS: Eval[] = [
  {
    cohortName: 'AI 리터러시와 업무활용',
    titleBase: 'AI 리터러시와 업무활용 - 사전·사후 역량평가',
    questions: Q1
  },
  {
    cohortName: '데이터 리터러시',
    titleBase: '데이터 리터러시 - 사전·사후 역량평가',
    questions: Q2
  },
  {
    cohortName: '생성형 AI 활용 노코드 데이터분석',
    titleBase: '생성형 AI 활용 노코드 데이터분석 - 사전·사후 역량평가',
    questions: Q4
  }
];

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
  throw new Error('share_code 충돌 — 10회 재시도 실패');
}

async function main() {
  for (const e of EVALS) {
    console.log(`\n========== ${e.cohortName} ==========`);

    const { data: cohort } = await supabase
      .from('cohorts')
      .select('id')
      .eq('name', e.cohortName)
      .maybeSingle();
    if (!cohort) {
      console.log(`  [SKIP] cohort 없음`);
      continue;
    }

    for (const dxType of ['pre', 'post'] as const) {
      const title = `${e.titleBase} (${dxType === 'pre' ? '사전' : '사후'})`;

      // 이미 등록된 동일 type 진단이 있으면 skip
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

      const rows = e.questions.map((q) => ({
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
        // rollback diagnosis
        await supabase.from('diagnoses').delete().eq('id', diag.id);
        continue;
      }

      console.log(
        `  [OK ${dxType}] code=${share_code}  questions=${rows.length}  diag=${diag.id.slice(0, 8)}`
      );
    }
  }
  console.log('\n완료.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

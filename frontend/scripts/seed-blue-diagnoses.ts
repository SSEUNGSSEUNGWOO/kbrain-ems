// AI 챔피언 블루(중급) 사전·사후 역량진단 등록
// 대상: 블루 1~5회차 (일반과정) × (pre + post) = 10 diagnoses, 각 20문항
// 가중치: 초급(1-10) 3 / 중급(11-16) 5 / 고급(17-20) 10 = 만점 100
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

const W = (no: number) => (no <= 10 ? 3 : no <= 16 ? 5 : 10);

const QUESTIONS: Question[] = [
  {
    no: 1,
    type: 'multiple_choice',
    text: "AI의 발전 단계 중 '질문 1회, 응답 1회'에 가까운 가장 기본적인 활용 층위는?",
    weight: W(1),
    choices: [
      { key: '①', text: 'Prompting' },
      { key: '②', text: 'Workflow' },
      { key: '③', text: 'Agent' },
      { key: '④', text: 'Agentic AI' }
    ],
    correct: '①'
  },
  {
    no: 2,
    type: 'multiple_choice',
    text: "'바이브 코딩(Vibe Coding)'의 핵심 입력으로 가장 적절한 것은?",
    weight: W(2),
    choices: [
      { key: '①', text: '정확한 문법(syntax)' },
      { key: '②', text: '무엇을 만들지에 대한 의도(요구사항)' },
      { key: '③', text: '암기한 알고리즘' },
      { key: '④', text: '서버 설정 명령어' }
    ],
    correct: '②'
  },
  {
    no: 3,
    type: 'multiple_choice',
    text: "결과값이 '퇴직 여부(예/아니오)'처럼 범주형일 때 가장 적합한 분석 유형은?",
    weight: W(3),
    choices: [
      { key: '①', text: '회귀' },
      { key: '②', text: '분류' },
      { key: '③', text: '군집' },
      { key: '④', text: '차원 축소' }
    ],
    correct: '②'
  },
  {
    no: 4,
    type: 'multiple_choice',
    text: '외부 반출이 어려운 완전 폐쇄망에서 로컬 PC로 오픈 모델(SLM)을 실행할 때 가장 적합한 도구는?',
    weight: W(4),
    choices: [
      { key: '①', text: 'Ollama' },
      { key: '②', text: 'FastAPI' },
      { key: '③', text: 'Supabase' },
      { key: '④', text: 'LangChain' }
    ],
    correct: '①'
  },
  {
    no: 5,
    type: 'multiple_choice',
    text: "단일 HTML 도구에서 서버 없이 '할 일 목록·폼 임시저장' 같은 간단한 키-값 데이터를 브라우저에 저장할 때 쓰는 것은?",
    weight: W(5),
    choices: [
      { key: '①', text: 'localStorage' },
      { key: '②', text: 'PostgreSQL' },
      { key: '③', text: 'vectorDB' },
      { key: '④', text: 'GitHub' }
    ],
    correct: '①'
  },
  {
    no: 6,
    type: 'multiple_choice',
    text: 'HTML/CSS/JS와 Python의 역할 분담으로 옳은 것은?',
    weight: W(6),
    choices: [
      { key: '①', text: '둘 다 브라우저 안에서만 동작한다' },
      { key: '②', text: 'HTML은 보여주는 것, Python은 처리(파일·엑셀·API)에 강하다' },
      { key: '③', text: 'Python은 화면 표시, HTML은 데이터 처리에 강하다' },
      { key: '④', text: '둘은 서로 대체 관계다' }
    ],
    correct: '②'
  },
  {
    no: 7,
    type: 'ox',
    text: "'AI 전환은 전문 개발자만이 주체'라고 본다.",
    weight: W(7),
    correct: 'X'
  },
  {
    no: 8,
    type: 'ox',
    text: '폐쇄망 우선 전략은 외부 AI 도구를 전혀 쓰지 말자는 의미가 아니라, 외부 지식과 내부 데이터를 분리하는 것이 핵심이다.',
    weight: W(8),
    correct: 'O'
  },
  {
    no: 9,
    type: 'ox',
    text: "군집 분석은 정답 레이블이 있는 상태에서 '누가 퇴직할 것인가'를 맞히는 분류 작업이다.",
    weight: W(9),
    correct: 'X'
  },
  {
    no: 10,
    type: 'short_text',
    text: "Model Context Protocol(MCP)을 공식 문서가 비유한 표현으로, 'AI 애플리케이션을 외부 시스템에 연결하는 ○○○ 같은 표준'의 ○○○에 들어갈 단어를 쓰시오.",
    weight: W(10),
    correct_keywords: ['USB-C', 'USB C', 'usb-c', 'usb c', 'USBC', 'usbc', 'USB']
  },
  {
    no: 11,
    type: 'multiple_choice',
    text: "이미 작동하는 서비스를 보고 '어떤 기술 조합으로 만들어졌는지' 역추적하는 리버스 엔지니어링에서 반복하는 네 가지 질문에 해당하지 않는 것은?",
    weight: W(11),
    choices: [
      { key: '①', text: '사용자 입력은 무엇인가' },
      { key: '②', text: '입력이 어디로 저장되는가' },
      { key: '③', text: 'LLM·분류 모델이 어느 시점에 개입하는가' },
      { key: '④', text: '개발자의 연봉은 얼마인가' }
    ],
    correct: '④'
  },
  {
    no: 12,
    type: 'multiple_choice',
    text: "퇴직 '위험자를 놓치지 않는 것'이 가장 중요한 상황에서 우선적으로 보아야 할 분류 평가지표는?",
    weight: W(12),
    choices: [
      { key: '①', text: 'Precision(정밀도)' },
      { key: '②', text: 'Recall(재현율)' },
      { key: '③', text: '학습 시간' },
      { key: '④', text: '데이터 용량' }
    ],
    correct: '②'
  },
  {
    no: 13,
    type: 'multiple_choice',
    text: "'좋은 도구'의 정의로 가장 적절한 것은?",
    weight: W(13),
    choices: [
      { key: '①', text: '가장 최신·강력한 도구' },
      { key: '②', text: '현재 조직에서 가장 적은 저항으로 문제를 해결하는 도구' },
      { key: '③', text: '가장 많은 기능을 가진 도구' },
      { key: '④', text: '가장 널리 알려진 도구' }
    ],
    correct: '②'
  },
  {
    no: 14,
    type: 'ox',
    text: '데이터가 불균형한 상황에서는 Accuracy(정확도) 하나만으로 모델을 판단해도 충분하다.',
    weight: W(14),
    correct: 'X'
  },
  {
    no: 15,
    type: 'ox',
    text: '단일 HTML 한 파일이나 짧은 VBA 매크로 수준은 채팅형 LLM만으로도 충분할 수 있으나, 다중 파일 웹앱·배포 구조처럼 범위가 넓어지면 코딩 에이전트의 효율이 크게 올라간다.',
    weight: W(15),
    correct: 'O'
  },
  {
    no: 16,
    type: 'short_text',
    text: "AI 활용 층위 중 '도구를 호출하고 재시도하며 상태를 유지'하는 단계로, 코딩 에이전트·리서치 에이전트가 대표 예시인 층위의 이름을 쓰시오.",
    weight: W(16),
    correct_keywords: ['Agent', 'agent', 'AGENT', '에이전트', 'Agent(에이전트)']
  },
  {
    no: 17,
    type: 'multiple_choice',
    text: '트리 기반 모델의 피처 중요도와 SHAP에 대한 해석 태도로 가장 적절한 것은?',
    weight: W(17),
    choices: [
      { key: '①', text: '중요 변수는 곧 인과적 원인으로 해석한다' },
      { key: '②', text: '중요도·SHAP는 예측 기여를 요약·설명할 뿐 인과적 설명은 아니다' },
      { key: '③', text: 'SHAP 값이 높으면 통계적 인과관계가 증명된다' },
      { key: '④', text: '피처 중요도는 전처리 단계에서만 의미가 있다' }
    ],
    correct: '②'
  },
  {
    no: 18,
    type: 'ox',
    text: 'PCA로 만든 축은 시각화를 위한 보조 축으로 보아야 하며, PCA 축 자체를 원래 변수처럼 해석해서는 안 된다.',
    weight: W(18),
    correct: 'O'
  },
  {
    no: 19,
    type: 'short_text',
    text: '공공조직 보고서의 신뢰도를 위해, 같은 데이터를 다시 분할해도 동일한 train/test 분할 결과가 나오도록 결과를 고정하는 옵션(파라미터)의 이름을 쓰시오.',
    weight: W(19),
    correct_keywords: ['random_state', 'randomstate', 'random state', '랜덤 시드', '랜덤시드', 'random_seed', '시드']
  },
  {
    no: 20,
    type: 'short_text',
    text: '공공분야에서 성능이 우수한 부스팅 모델을 쓰더라도, 변수의 방향성·한계를 설명하고 결과를 조직 개입 관점으로 번역할 수 있어야 한다는, 2026년에도 핵심 조건으로 강조되는 개념을 쓰시오.',
    weight: W(20),
    correct_keywords: ['설명가능성', 'Explainability', 'explainability', 'XAI', '설명 가능성', 'Explainable AI']
  }
];

const COHORT_NAMES = [
  'AI 챔피언 블루 1회차',
  'AI 챔피언 블루 2회차',
  'AI 챔피언 블루 3회차',
  'AI 챔피언 블루 4회차',
  'AI 챔피언 블루 5회차'
];

const TITLE_BASE = 'AI 챔피언 블루(중급) 종합과정 - 사전·사후 역량진단';

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
  for (const cohortName of COHORT_NAMES) {
    console.log(`\n========== ${cohortName} ==========`);

    const { data: cohort } = await supabase
      .from('cohorts')
      .select('id')
      .eq('name', cohortName)
      .maybeSingle();
    if (!cohort) {
      console.log(`  [SKIP] cohort 없음`);
      continue;
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
  }
  console.log('\n완료.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

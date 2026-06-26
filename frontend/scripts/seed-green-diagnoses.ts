// AI 챔피언 그린(초급) 종합과정 사전·사후 역량진단 등록
// 대상: 그린 1~6회차 (일반과정) × (pre + post) = 12 diagnoses, 각 20문항
// 가중치: 모든 문항 5점 = 만점 100
// 출처: "AI챔피언 그린(초급) 종합과정_역량진단_수정본.docx"
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

const W = 5; // 모든 문항 5점 (그린)

const QUESTIONS: Question[] = [
  {
    no: 1,
    type: 'multiple_choice',
    text: '일반적인 데이터 분석 프로세스의 순서로 가장 적절한 것은?',
    weight: W,
    choices: [
      { key: '①', text: '데이터 수집 → 데이터 정제 → 탐색적 분석 → 시각화 → 해석' },
      { key: '②', text: '시각화 → 데이터 수집 → 해석 → 데이터 정제 → 분석' },
      { key: '③', text: '해석 → 시각화 → 분석 → 데이터 수집 → 데이터 정제' },
      { key: '④', text: '데이터 정제 → 해석 → 데이터 수집 → 시각화 → 분석' }
    ],
    correct: '①'
  },
  {
    no: 2,
    type: 'multiple_choice',
    text: "생성형 AI 중심의 'AX(AI Transformation)'에 대한 설명으로 가장 적절한 것은?",
    weight: W,
    choices: [
      { key: '①', text: '기존 머신러닝(예측·분류) 중심의 데이터 분석 기반 마련에 초점을 둔다' },
      { key: '②', text: '업무 생산성과 효율성 향상에 초점을 둔다' },
      { key: '③', text: '데이터 정제 자동화만을 의미한다' },
      { key: '④', text: '머신러닝 모델의 성능 튜닝만을 의미한다' }
    ],
    correct: '②'
  },
  {
    no: 3,
    type: 'multiple_choice',
    text: "프롬프트 엔지니어링 '5요소'에 해당하지 않는 것은?",
    weight: W,
    choices: [
      { key: '①', text: '역할(Role)' },
      { key: '②', text: '맥락(Context)' },
      { key: '③', text: '작업(Task)' },
      { key: '④', text: '예산(Budget)' }
    ],
    correct: '④'
  },
  {
    no: 4,
    type: 'multiple_choice',
    text: '노코드·로우코드 자동화 워크플로우의 기본 구성요소로 가장 적절한 것은?',
    weight: W,
    choices: [
      { key: '①', text: '트리거(Trigger) · 액션(Action) · 조건 분기(Condition)' },
      { key: '②', text: '컴파일 · 링크 · 빌드' },
      { key: '③', text: '정규화 · 역정규화 · 인덱싱' },
      { key: '④', text: '학습 · 검증 · 배포' }
    ],
    correct: '①'
  },
  {
    no: 5,
    type: 'multiple_choice',
    text: "데이터에서 '두 수치(연속형 변수) 간의 관계'를 살펴보기에 가장 적합한 차트는?",
    weight: W,
    choices: [
      { key: '①', text: '막대 차트' },
      { key: '②', text: '산점도(Scatter)' },
      { key: '③', text: '파이 차트' },
      { key: '④', text: '워드클라우드' }
    ],
    correct: '②'
  },
  {
    no: 6,
    type: 'multiple_choice',
    text: '두 개의 범주형 변수를 동시에 교차하여 빈도를 보고자 할 때 가장 적절한 분석 방법은?',
    weight: W,
    choices: [
      { key: '①', text: 'describe() 요약통계' },
      { key: '②', text: '단일 변수 groupby() 집계' },
      { key: '③', text: 'crosstab() 교차집계' },
      { key: '④', text: 'corr() 상관분석' }
    ],
    correct: '③'
  },
  {
    no: 7,
    type: 'multiple_choice',
    text: '정적 이미지(PNG)가 아니라 마우스 hover·zoom 등 상호작용이 가능한 인터랙티브 차트를 만드는 데 가장 적합한 라이브러리는?',
    weight: W,
    choices: [
      { key: '①', text: 'matplotlib' },
      { key: '②', text: 'seaborn' },
      { key: '③', text: 'plotly' },
      { key: '④', text: 'NumPy' }
    ],
    correct: '③'
  },
  {
    no: 8,
    type: 'multiple_choice',
    text: '생성형 AI가 외부 문서·지식을 검색하여 답변 생성에 활용함으로써 환각(hallucination)을 줄이는 기법은?',
    weight: W,
    choices: [
      { key: '①', text: 'RAG(검색 증강 생성)' },
      { key: '②', text: 'OCR(광학문자인식)' },
      { key: '③', text: 'ETL' },
      { key: '④', text: 'SQL 조인' }
    ],
    correct: '①'
  },
  {
    no: 9,
    type: 'multiple_choice',
    text: '상관계수에 대한 설명으로 옳은 것은?',
    weight: W,
    choices: [
      { key: '①', text: '절대값이 1에 가까울수록 두 변수의 선형 관계가 강하다' },
      { key: '②', text: '0에 가까울수록 관계가 강하다' },
      { key: '③', text: '값이 음수이면 분석에서 무조건 제외해야 한다' },
      { key: '④', text: '상관계수가 높으면 항상 인과관계가 성립한다' }
    ],
    correct: '①'
  },
  {
    no: 10,
    type: 'multiple_choice',
    text: 'AI 서비스 기획·구현 단계의 순서로 가장 적절한 것은?',
    weight: W,
    choices: [
      { key: '①', text: '문제 정의 → 페르소나·요구사항 → 해결방안 → MVP(프로토타입) 구현' },
      { key: '②', text: 'MVP 구현 → 문제 정의 → 배포 → 페르소나' },
      { key: '③', text: '배포 → 해결방안 → 문제 정의 → 요구사항' },
      { key: '④', text: '요구사항 → 배포 → MVP → 문제 정의' }
    ],
    correct: '①'
  },
  {
    no: 11,
    type: 'ox',
    text: '바이브코딩은 분석가가 코드를 직접 외워 작성하는 대신, LLM에게 지시하여 코드를 받아 실행·검증하는 방식이다.',
    weight: W,
    correct: 'O'
  },
  {
    no: 12,
    type: 'ox',
    text: '공공데이터포털에서 내려받은 CSV 파일은 대부분 UTF-8 전용이며, cp949 인코딩은 사용되지 않는다.',
    weight: W,
    correct: 'X'
  },
  {
    no: 13,
    type: 'ox',
    text: '노코드 도구를 활용하면 코드를 직접 작성하지 않고도 행정 서비스 프로토타입을 만들 수 있다.',
    weight: W,
    correct: 'O'
  },
  {
    no: 14,
    type: 'ox',
    text: 'pd.read_html()은 웹 페이지의 HTML <table> 태그를 자동으로 찾아 DataFrame으로 변환해 준다.',
    weight: W,
    correct: 'O'
  },
  {
    no: 15,
    type: 'ox',
    text: 'Netlify, Vercel 등은 노코드·로우코드로 만든 AI 서비스 프로토타입을 배포·공유하는 데 활용할 수 있다.',
    weight: W,
    correct: 'O'
  },
  {
    no: 16,
    type: 'ox',
    text: '두 변수의 상관계수가 높게 나오면, 한 변수가 다른 변수의 원인이라는 인과관계가 항상 성립한다.',
    weight: W,
    correct: 'X'
  },
  {
    no: 17,
    type: 'short_text',
    text: "AI 서비스 기획에서 핵심 기능만 담아 빠르게 만들어 검증하는 '최소 기능 제품'을 뜻하는 영문 약어(3글자)를 쓰시오.",
    weight: W,
    correct_keywords: ['MVP', 'mvp', 'Minimum Viable Product', 'minimum viable product', '최소 기능 제품', '최소기능제품']
  },
  {
    no: 18,
    type: 'short_text',
    text: '분류·회귀·군집 중에서, 연속적인 수치(예: 사용료, 수용인원수)를 예측하는 데 사용하는 분석 기법의 이름을 쓰시오.',
    weight: W,
    correct_keywords: ['회귀', '회귀분석', 'Regression', 'regression', 'REGRESSION']
  },
  {
    no: 19,
    type: 'short_text',
    text: '시도별·유료여부처럼 두 범주형 변수를 교차하여 빈도표를 만들 때 사용하는 pandas 함수명을 영문으로 쓰시오.',
    weight: W,
    correct_keywords: ['crosstab', 'Crosstab', 'CROSSTAB', 'pd.crosstab', 'crosstab()', 'pd.crosstab()']
  },
  {
    no: 20,
    type: 'short_text',
    text: "박스플롯에서 상자(박스)의 높이에 해당하며, 제3사분위수(Q3)에서 제1사분위수(Q1)를 뺀 '사분위 범위'를 뜻하는 영문 약어를 쓰시오.",
    weight: W,
    correct_keywords: ['IQR', 'iqr', 'Iqr', '사분위 범위', '사분위범위', 'Interquartile Range', 'interquartile range']
  }
];

const COHORT_NAMES = [
  'AI 챔피언 그린 1회차',
  'AI 챔피언 그린 2회차',
  'AI 챔피언 그린 3회차',
  'AI 챔피언 그린 4회차',
  'AI 챔피언 그린 5회차',
  'AI 챔피언 그린 6회차'
];

const TITLE_BASE = 'AI 챔피언 그린(초급) 종합과정 - 사전·사후 역량진단';

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
  console.log(`mode: ${APPLY ? 'APPLY' : 'dry-run'}\n`);

  for (const cohortName of COHORT_NAMES) {
    console.log(`========== ${cohortName} ==========`);

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
  }
  console.log(`\n완료${APPLY ? '' : ' (dry-run)'}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

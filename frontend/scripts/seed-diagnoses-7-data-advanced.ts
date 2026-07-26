// 생성형 AI 활용 데이터분석 심화 (⑦) — 사전·사후 역량평가 20문항 seed.
//
// 대상 cohort:
//   1회차 70a3fc72-0af0-473b-9745-0f39ecaeae9f
//   2회차 2911af2c-cc7c-4f45-9e04-9a058fffd7da
//
// 각 cohort × (pre/post) = diagnosis 4개, 각 20문항.
// 배점 균등 5점 × 20 = 100점, 응답 제한 7분(default), 교재 참조 제거.
//
// 재실행 시: 같은 title + cohort_id + type 인 diagnosis 를 wipe 후 재생성.

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
  { id: '70a3fc72-0af0-473b-9745-0f39ecaeae9f', label: '1회차' },
  { id: '2911af2c-cc7c-4f45-9e04-9a058fffd7da', label: '2회차' }
];

// ---------- 문항 정의 (검수 후) ----------
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
    text: "데이터 분석(모델링)에서 '가장 먼저' 해야 하는 일은?",
    choices: [
      { key: '①', text: '가장 최신 알고리즘을 고르는 것' },
      { key: '②', text: '문제를 정의하고 문제 구조(회귀/분류/군집)를 파악하는 것' },
      { key: '③', text: '딥러닝 모델을 먼저 학습시키는 것' },
      { key: '④', text: '하이퍼파라미터를 먼저 튜닝하는 것' }
    ],
    correct: '②'
  },
  {
    no: 2,
    type: 'multiple_choice',
    text: "분류 모델에서 실제 양성(예: 퇴직 위험자)을 '놓치지 않는 것'이 중요할 때 특히 주목해야 할 지표는?",
    choices: [
      { key: '①', text: '정밀도(Precision)' },
      { key: '②', text: '재현율(Recall)' },
      { key: '③', text: '학습 시간' },
      { key: '④', text: '파라미터 수' }
    ],
    correct: '②'
  },
  {
    no: 3,
    type: 'multiple_choice',
    text: '군집 분석(클러스터링)에 대한 설명으로 옳은 것은?',
    choices: [
      { key: '①', text: '정답 레이블을 맞히는 지도학습이다' },
      { key: '②', text: '정답이 없는 상태에서 집단을 유형으로 나누는 비지도학습이다' },
      { key: '③', text: '회귀 문제의 한 종류이다' },
      { key: '④', text: '반드시 정답(Y)이 있어야 수행할 수 있다' }
    ],
    correct: '②'
  },
  {
    no: 4,
    type: 'multiple_choice',
    text: "복잡한 모델에 앞서 '기준선(baseline) 모델'을 먼저 세우라고 하는 이유로 가장 적절한 것은?",
    choices: [
      { key: '①', text: '기준선 모델이 항상 가장 성능이 좋기 때문' },
      { key: '②', text: '복잡한 모델의 추가 성능이 의미 있는지 판단할 비교 기준이 필요하기 때문' },
      { key: '③', text: '기준선 모델은 설명이 불가능하기 때문' },
      { key: '④', text: '최신 모델을 쓰지 않기 위해서' }
    ],
    correct: '②'
  },
  {
    no: 5,
    type: 'multiple_choice',
    text: '채팅형 AI 도구와 에이전트형 도구의 차이로 옳은 것은?',
    choices: [
      { key: '①', text: '채팅형은 파일 읽기·실행·수정 반복 루프를 자동화하는 데 강하다' },
      { key: '②', text: '에이전트형은 파일을 읽고 실행하고 오류를 고치는 반복 루프를 더 많이 자동화한다' },
      { key: '③', text: '두 도구는 기능이 완전히 동일하다' },
      { key: '④', text: '에이전트형은 개념 설명 외에는 아무것도 못 한다' }
    ],
    correct: '②'
  },
  {
    no: 6,
    type: 'ox',
    text: '상관관계 히트맵에서 두 변수의 상관이 높게 나타나면, 한 변수가 다른 변수의 원인이라고 바로 단정할 수 있다.',
    correct: 'X'
  },
  {
    no: 7,
    type: 'ox',
    text: '생성형 AI가 코드·보고서 초안을 빠르게 만들어 주더라도, 결과에 대한 기관 내부의 책임소재는 여전히 사람과 조직에 남는다.',
    correct: 'O'
  },
  {
    no: 8,
    type: 'ox',
    text: 'EDA(탐색적 데이터분석)는 단지 모델 전에 잠깐 차트를 그리는 절차가 아니라, 분석 질문(가설)을 다듬는 핵심 단계이다.',
    correct: 'O'
  },
  {
    no: 9,
    type: 'short_text',
    text: "학습 정확도는 계속 오르는데 검증 성능은 멈추거나 나빠지는, 즉 모델이 데이터를 '외우기' 시작하는 현상을 무엇이라 하는가?",
    correct_keywords: ['과적합', 'overfitting', 'over fitting']
  },
  {
    no: 10,
    type: 'short_text',
    text: 'Gemini API 실습에서 API 키를 코드에 직접 넣지 않고 안전하게 관리하기 위해 사용하는 저장 방식은 무엇인가?',
    correct_keywords: ['환경변수', 'environment variable', 'env ']
  },
  // ── 중급 (6) ──
  {
    no: 11,
    type: 'multiple_choice',
    text: '범주형 변수 인코딩에 대한 설명으로 옳은 것은?',
    choices: [
      { key: '①', text: '순서가 없는 부서 변수는 레이블 인코딩이 자연스럽다' },
      { key: '②', text: '순서가 있는 직급 변수는 원-핫 인코딩만 써야 한다' },
      { key: '③', text: '순서 없는 범주(부서)는 원-핫, 순서 있는 범주(직급)는 레이블·사용자 정의 순서를 고려한다' },
      { key: '④', text: '인코딩 방식은 결과에 영향을 주지 않는다' }
    ],
    correct: '③'
  },
  {
    no: 12,
    type: 'multiple_choice',
    text: "양성·음성 비율이 크게 치우친 '불균형 데이터'에서 유의할 점으로 옳은 것은?",
    choices: [
      { key: '①', text: 'Accuracy만 보면 아무것도 안 하는 모델이 오히려 높게 보일 수 있다' },
      { key: '②', text: '불균형 상황에서도 Accuracy는 항상 신뢰할 수 있는 지표다' },
      { key: '③', text: 'balanced accuracy는 다수 클래스만 반영한다' },
      { key: '④', text: 'DummyClassifier 같은 기준선 비교는 불필요하다' }
    ],
    correct: '①'
  },
  {
    no: 13,
    type: 'multiple_choice',
    text: '앙상블 기법에 대한 설명으로 옳은 것은?',
    choices: [
      { key: '①', text: '배깅은 이전 모델이 틀린 부분을 다음 모델이 보완하는 방식이다' },
      { key: '②', text: '부스팅은 여러 모델의 결과를 단순 투표로만 합친다' },
      { key: '③', text: '부스팅은 이전 모델의 오류를 다음 모델이 보완하며, XGBoost·LightGBM이 대표적이다' },
      { key: '④', text: '앙상블은 항상 단일 모델보다 설명이 쉽다' }
    ],
    correct: '③'
  },
  {
    no: 14,
    type: 'ox',
    text: "퇴직사유처럼 결과 발생 '이후'에만 생기는 정보를 입력 변수로 넣으면, 성능은 높아 보여도 실제로는 예측이 아닌 '사후 정보 학습(누설)'일 수 있다.",
    correct: 'O'
  },
  {
    no: 15,
    type: 'ox',
    text: '평균 대체값 계산이나 표준화(스케일링)는 데이터 누수를 막기 위해 전체 데이터가 아니라 학습(train) 데이터 기준으로 맞추는 것이 안전하다.',
    correct: 'O'
  },
  {
    no: 16,
    type: 'short_text',
    text: '검증 지표가 더 이상 개선되지 않을 때 학습을 멈춰 과적합을 막고 일반화 성능을 보호하는 딥러닝(Keras) 콜백(장치)의 이름은?',
    correct_keywords: ['earlystopping', 'early stopping', '조기 종료', '조기종료']
  },
  // ── 고급 (4) ──
  {
    no: 17,
    type: 'multiple_choice',
    text: '분류 모델의 확률 예측(predict_proba)과 의사결정에 대한 설명으로 옳은 것은?',
    choices: [
      { key: '①', text: '확률 0.5 이상이면 기계적으로 위험군으로 확정하는 것이 항상 최선이다' },
      { key: '②', text: '예측 확률과 임계값(threshold) 결정은 분리해서 봐야 하며, 오류 비용에 따라 임계값을 조절한다' },
      { key: '③', text: '확률값 자체가 곧 최종 의사결정이다' },
      { key: '④', text: '임계값은 어떤 경우에도 조정하면 안 된다' }
    ],
    correct: '②'
  },
  {
    no: 18,
    type: 'multiple_choice',
    text: "같은 직원의 월별 기록처럼 관측치가 서로 독립이 아닌 데이터에서 '무작위 분할'만 쓸 때의 문제와 대응으로 옳은 것은?",
    choices: [
      { key: '①', text: '문제가 전혀 없으므로 항상 무작위 분할이 최선이다' },
      { key: '②', text: '같은 개체가 train·test에 나뉘어 성능이 부풀려질 수 있어 GroupKFold·TimeSeriesSplit 등을 고려한다' },
      { key: '③', text: '무작위 분할은 성능을 항상 낮게 만든다' },
      { key: '④', text: '시계열 자료는 미래 데이터를 과거 학습에 넣는 것이 원칙이다' }
    ],
    correct: '②'
  },
  {
    no: 19,
    type: 'ox',
    text: '트리 모델의 피처 중요도나 SHAP 값은 예측 기여도를 보여 주지만, 그 자체가 곧 인과적(원인) 설명은 아니다.',
    correct: 'O'
  },
  {
    no: 20,
    type: 'short_text',
    text: "Gemini API의 비율 제한에서 '분당 입력 토큰 수'를 뜻하는 약어(영문 3글자)는 무엇인가?",
    correct_keywords: ['tpm', 'tokens per minute']
  }
];

const WEIGHT = 5;

function buildOptions(q: Q): Record<string, unknown> {
  if (q.type === 'multiple_choice') return { choices: q.choices, correct: q.correct };
  if (q.type === 'ox') return { correct: q.correct };
  return { correct_keywords: q.correct_keywords };
}

async function seedOne(cohortId: string, cohortLabel: string, type: 'pre' | 'post') {
  const title = `⑦ 생성형 AI 활용 데이터분석 심화 - ${type === 'pre' ? '사전' : '사후'} 역량평가`;

  // 기존 같은 (cohort, type) 진단 삭제 (재실행 시 wipe)
  const { data: existing } = await sb
    .from('diagnoses')
    .select('id')
    .eq('cohort_id', cohortId)
    .eq('type', type)
    .ilike('title', '⑦%');
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

// 노코드 AI 서비스 구현 — 사전·사후 역량평가 등록
// 대상 cohort: '노코드 AI 서비스 구현' × (pre + post) = 2 diagnoses, 각 20문항
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
    text: "'바이브 코딩'의 본질로 가장 적절한 것은?",
    weight: W(1),
    choices: [
      { key: '①', text: '프로그래밍 문법을 정확히 암기해 코드를 직접 타이핑하는 것' },
      { key: '②', text: '무엇을 만들지 자연어로 설명하고 결과를 검수·반복 보정하는 것' },
      { key: '③', text: 'AI가 사람 대신 문제까지 알아서 정의해 주는 것' },
      { key: '④', text: '코드 없이 마우스로만 앱을 조립하는 것' }
    ],
    correct: '②'
  },
  {
    no: 2,
    type: 'multiple_choice',
    text: "'문제 분해 4요소'에 해당하지 '않는' 것은?",
    weight: W(2),
    choices: [
      { key: '①', text: '누구를 위한 도구인가' },
      { key: '②', text: '무엇을 넣는가(입력)' },
      { key: '③', text: '무엇이 나와야 하는가(출력)' },
      { key: '④', text: '어떤 프로그래밍 언어로 만들 것인가' }
    ],
    correct: '④'
  },
  {
    no: 3,
    type: 'multiple_choice',
    text: '단일 HTML 웹앱에서 각 기술의 역할 연결이 옳은 것은?',
    weight: W(3),
    choices: [
      { key: '①', text: 'HTML–동작, CSS–구조, JavaScript–디자인' },
      { key: '②', text: 'HTML–구조, CSS–디자인, JavaScript–동작' },
      { key: '③', text: 'HTML–디자인, CSS–동작, JavaScript–구조' },
      { key: '④', text: '세 가지 모두 화면 디자인만 담당한다' }
    ],
    correct: '②'
  },
  {
    no: 4,
    type: 'multiple_choice',
    text: "'도구 선택의 네 가지 기준'에 해당하지 '않는' 것은?",
    weight: W(4),
    choices: [
      { key: '①', text: '사용자 수' },
      { key: '②', text: '데이터 민감도' },
      { key: '③', text: '운영 기간' },
      { key: '④', text: '최신 유행 여부' }
    ],
    correct: '④'
  },
  {
    no: 5,
    type: 'multiple_choice',
    text: "'폐쇄망 우선 전략'에서 외부 LLM에게 코드를 요청할 때 권장되는 방식은?",
    weight: W(5),
    choices: [
      { key: '①', text: '실제 민원·인사 데이터를 그대로 붙여 넣어 요청한다' },
      { key: '②', text: '파일 구조·컬럼명·가짜 샘플 몇 줄만 설명하고 코드를 받는다' },
      { key: '③', text: '외부 도구는 어떤 경우에도 절대 사용하지 않는다' },
      { key: '④', text: '데이터 전체를 압축해 업로드한다' }
    ],
    correct: '②'
  },
  {
    no: 6,
    type: 'ox',
    text: '바이브 코딩의 작업 루프는 한 번에 완성된 결과를 기대하기보다, 짧은 단위로 실행·검수·재요청을 반복하는 것이 효율적이다.',
    weight: W(6),
    correct: 'O'
  },
  {
    no: 7,
    type: 'ox',
    text: 'localStorage 같은 브라우저 저장소는 공식 기록 시스템이므로 법정 보관 데이터의 장기 보관 용도로 적합하다.',
    weight: W(7),
    correct: 'X'
  },
  {
    no: 8,
    type: 'ox',
    text: '단일 HTML 도구는 서버·데이터베이스·설치 없이 브라우저에서 파일 하나로 실행되어 내부망 배포에 유리하다.',
    weight: W(8),
    correct: 'O'
  },
  {
    no: 9,
    type: 'short_text',
    text: "파일 읽기·표 정리·문서 생성 등 반복 업무를 스크립트로 바꾸는 '접착제' 같은 프로그래밍 언어는?",
    weight: W(9),
    correct_keywords: ['파이썬', 'Python', 'python', 'PYTHON', '파이썬(Python)', 'Python(파이썬)']
  },
  {
    no: 10,
    type: 'short_text',
    text: '로컬 PC에서 오픈(소형) 언어모델을 간편하게 실행하여 데이터를 외부로 보내지 않고 활용하게 해 주는 도구의 이름은?',
    weight: W(10),
    correct_keywords: ['Ollama', 'ollama', 'OLLAMA', '올라마']
  },
  {
    no: 11,
    type: 'multiple_choice',
    text: '브라우저 저장소 localStorage와 IndexedDB에 대한 설명으로 옳은 것은?',
    weight: W(11),
    choices: [
      { key: '①', text: 'localStorage는 구조화된 객체 저장·인덱스 검색에 적합하다' },
      { key: '②', text: 'IndexedDB는 단순 키-값 저장에만 쓰인다' },
      { key: '③', text: '단순 설정값·임시 폼은 localStorage, 검색·다건·대용량은 IndexedDB가 적합하다' },
      { key: '④', text: '두 저장소 모두 서버 기반이라 공유 서비스에 바로 적합하다' }
    ],
    correct: '③'
  },
  {
    no: 12,
    type: 'multiple_choice',
    text: '채팅형 LLM과 코딩 에이전트의 차이에 대한 설명으로 옳은 것은?',
    weight: W(12),
    choices: [
      { key: '①', text: '채팅형 LLM은 프로젝트 전체를 읽고 여러 파일을 동시에 수정하는 데 강하다' },
      { key: '②', text: '코딩 에이전트는 IDE 안에서 프로젝트 문맥을 다루며 다중 파일 구현에 유리하다' },
      { key: '③', text: '단일 HTML·짧은 VBA에도 반드시 코딩 에이전트가 필요하다' },
      { key: '④', text: '두 방식은 기능이 완전히 동일하다' }
    ],
    correct: '②'
  },
  {
    no: 13,
    type: 'multiple_choice',
    text: "'노코드 AI 도구 지형을 읽는 다섯 축'에 해당하지 '않는' 것은?",
    weight: W(13),
    choices: [
      { key: '①', text: '코드 소유권' },
      { key: '②', text: '백엔드 자동화 수준' },
      { key: '③', text: '핸드오프(인수인계) 용이성' },
      { key: '④', text: '모델 파라미터 수' }
    ],
    correct: '④'
  },
  {
    no: 14,
    type: 'ox',
    text: '"로그인을 붙였다(인증)"와 "권한이 통제된다(권한 부여)"는 전혀 다른 문제이다.',
    weight: W(14),
    correct: 'O'
  },
  {
    no: 15,
    type: 'ox',
    text: '매크로가 포함된 엑셀 파일은 일반 .xlsx로 저장해도 매크로가 그대로 유지된다.',
    weight: W(15),
    correct: 'X'
  },
  {
    no: 16,
    type: 'short_text',
    text: "프로젝트마다 인터프리터·패키지 집합을 격리해 버전 충돌을 막는 파이썬의 '가상환경' 도구(명령어)는 무엇인가?",
    weight: W(16),
    correct_keywords: ['venv', 'python-venv', 'python -m venv', 'python_venv', 'VENV', 'Venv']
  },
  {
    no: 17,
    type: 'multiple_choice',
    text: 'Supabase의 RLS(Row Level Security)에 대한 설명으로 옳은 것은?',
    weight: W(17),
    choices: [
      { key: '①', text: '화면에서 버튼을 숨기기만 하면 데이터 접근도 자동으로 차단된다' },
      {
        key: '②',
        text: "모든 질의에 자동으로 붙는 '보이지 않는 WHERE 절'처럼 행 단위 접근을 제어한다"
      },
      { key: '③', text: '인증(로그인)만 담당하고 데이터 접근과는 무관하다' },
      { key: '④', text: 'service key를 브라우저에 노출해도 안전하다' }
    ],
    correct: '②'
  },
  {
    no: 18,
    type: 'multiple_choice',
    text: 'VBA 객체 모델에 대한 설명으로 옳은 것은?',
    weight: W(18),
    choices: [
      {
        key: '①',
        text: 'Application·Document·Worksheet·Range 등이 계층으로 연결되며 객체에 속성·메서드를 적용한다'
      },
      { key: '②', text: 'VBA는 객체 개념 없이 순수 텍스트 명령만으로 동작한다' },
      { key: '③', text: 'Range는 통합 문서 전체를 가리키는 최상위 객체다' },
      { key: '④', text: '객체 모델은 Python 전용 개념이다' }
    ],
    correct: '①'
  },
  {
    no: 19,
    type: 'ox',
    text: 'API 키·DB 키 같은 비밀정보는 코드·저장소에 직접 넣지 않고 환경변수로 분리하며, 문서에는 키 값이 아니라 설정 위치만 적는 것이 원칙이다.',
    weight: W(19),
    correct: 'O'
  },
  {
    no: 20,
    type: 'short_text',
    text: "Ollama에서 시스템 프롬프트와 하이퍼파라미터(temperature 등)를 지정해 팀 단위 '업무 규칙'을 고정·재사용하는 운영 문서(파일)의 이름은?",
    weight: W(20),
    correct_keywords: ['Modelfile', 'modelfile', 'MODELFILE', '모델파일', '모델 파일']
  }
];

const COHORT_NAME = '노코드 AI 서비스 구현';
const TITLE_BASE = '노코드 AI 서비스 구현 — 사전·사후 역량평가';

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
  console.log(`\n========== ${COHORT_NAME} ==========`);

  const { data: cohort } = await supabase
    .from('cohorts')
    .select('id')
    .eq('name', COHORT_NAME)
    .maybeSingle();
  if (!cohort) {
    console.log(`  [ERR] cohort 없음`);
    process.exit(1);
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
      console.log(`  [SKIP ${dxType}] 이미 존재  id=${existing.id.slice(0, 8)}`);
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
  console.log('\n완료.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * 테스트용 CBT 시험 등록 (객관식·단답·작업형 각 1문항).
 * HTML 파일에서 T-P-001 (객관식), T-P-081 (단답), 원본 9번 (작업형) 발췌.
 * 섹션 시간: 5분 / 3분 / 5분 — 승우님 검토 편의.
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

const BANK_NAME = '테스트 CBT 문제은행';
const EXAM_NAME = '테스트 CBT (연습용)';

function shortToken(len = 8): string {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

const QUESTIONS = [
  {
    code: 'TEST-MC-001',
    type: 'multiple_choice' as const,
    category: '데이터분석',
    difficulty: '중',
    score: 5,
    text: `분류 모델을 빠르게 시험할 때는 학습 도구 자체보다 입력 데이터 구성, 검증 방식, 실행 환경이 결과 품질을 좌우한다. 다음 중 '클래스 불균형'에 대한 설명으로 가장 적절한 것은?`,
    choices: [
      { key: 'A', text: '업무 목적과 무관하게 최신 기술을 우선 적용하는 방식' },
      { key: 'B', text: '도구 이름이나 브랜드만 바꾸면 검증 없이 같은 효과를 얻는다는 관점' },
      { key: 'C', text: '특정 클래스의 표본이 지나치게 많거나 적어 모델 판단이 왜곡되는 문제' },
      { key: 'D', text: '보안, 성능, 품질 기준을 별도로 두지 않고 결과만 확인하는 방식' }
    ],
    correct: { key: 'C' }
  },
  {
    code: 'TEST-ST-001',
    type: 'short_text' as const,
    category: '생성형AI활용',
    difficulty: '중',
    score: 10,
    text: `문서 검색형 AI를 설계할 때, 검색된 근거 문서를 LLM 입력에 결합해 답변의 정확성과 근거성을 높이는 대표 기법을 3글자로 답하시오.`,
    correct: { keywords: ['RAG', 'rag'] }
  },
  {
    code: 'TEST-TB-001',
    type: 'task_based' as const,
    category: '서비스구현',
    difficulty: '상',
    score: 20,
    text: `[업무량 통계 대시보드 HTML 프로그램 제작]

관리자는 부서별 업무 접수량, 처리 건수, 지연 건수를 매주 확인해야 한다. 엑셀 피벗 없이 CSV를 업로드하면 부서별 업무량과 지연 현황을 자동 시각화하는 오프라인 HTML 대시보드를 만드시오.

[수행 과제]
1) CSV 업로드 후 부서별 접수·완료·지연 건수를 계산한다.
2) 담당자별 처리량을 표와 그래프로 표시한다.
3) 처리기한 초과 건을 자동 분류한다.
4) 업무유형별 비중을 시각화한다.
5) 필터링 결과를 내려받을 수 있게 한다.

[제출물]
- HTML/CSS/JS 대시보드
- 샘플 CSV
- 계산 기준 설명
- 화면 캡처 또는 사용 가이드`
  }
];

async function buildShareCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const c = shortToken(8);
    const { data } = await s.from('exams').select('id').eq('share_code', c).maybeSingle();
    if (!data) return c;
  }
  throw new Error('share_code 충돌');
}

(async () => {
  // bank
  const { data: existBank } = await s.from('exam_banks').select('id').eq('name', BANK_NAME).maybeSingle();
  if (existBank) {
    console.log(`⚠ 이미 존재: bank ${BANK_NAME}`);
    process.exit(1);
  }
  const { data: bank, error: bErr } = await s
    .from('exam_banks')
    .insert({ name: BANK_NAME, description: '연습용 모의평가에서 발췌한 유형별 각 1문항' })
    .select('id')
    .single();
  if (bErr || !bank) throw new Error(`bank: ${bErr?.message}`);
  console.log(`✓ bank ${bank.id.slice(0, 8)}`);

  // questions
  const qRows = QUESTIONS.map((q) => ({
    bank_id: bank.id,
    code: q.code,
    category: q.category,
    difficulty: q.difficulty,
    type: q.type,
    text: q.text,
    score: q.score,
    tags: ['테스트 CBT'],
    choices: (q as { choices?: unknown }).choices ?? null,
    correct: (q as { correct?: unknown }).correct ?? null,
    allow_file_upload: q.type === 'task_based',
    time_limit_seconds: null
  }));
  const { data: insQ, error: qErr } = await s.from('exam_questions').insert(qRows).select('id, code');
  if (qErr || !insQ) throw new Error(`questions: ${qErr?.message}`);
  console.log(`✓ questions ${insQ.length}건`);

  // exam
  const share = await buildShareCode();
  const { data: exam, error: eErr } = await s
    .from('exams')
    .insert({
      name: EXAM_NAME,
      description: 'HTML 연습 시험지에서 발췌한 3문항(객관식/단답/작업형) 테스트용',
      time_limit_mc: 300, // 5분
      time_limit_st: 180, // 3분
      time_limit_task: 300, // 5분
      fullscreen_required: true,
      share_code: share
    })
    .select('id')
    .single();
  if (eErr || !exam) throw new Error(`exam: ${eErr?.message}`);
  console.log(`✓ exam ${exam.id.slice(0, 8)}  share_code=${share}`);

  // 순서: 객관식(order 1) → 단답(order 2) → 작업형(order 3)
  const codeToId = new Map(insQ.map((q) => [q.code, q.id]));
  const orderMap = ['TEST-MC-001', 'TEST-ST-001', 'TEST-TB-001'];
  const qie = orderMap.map((code, idx) => ({
    exam_id: exam.id,
    question_id: codeToId.get(code)!,
    order_no: idx + 1
  }));
  const { error: qieErr } = await s.from('exam_questions_in_exam').insert(qie);
  if (qieErr) throw new Error(`qie: ${qieErr.message}`);
  console.log(`✓ 매핑 3건`);

  console.log(`\n공유 URL: /exam/share/${share}`);
  console.log(`(단, 이 시험은 cohort_id 없음 — 공유 URL 진입 매칭 불가)`);
  console.log(`직접 개별 세션 발급 후 개별 토큰으로 진입 필요:`);
  console.log(`  bun run scripts/create-exam-sessions.ts --exam=${exam.id} --name=승우 --email=test@example.com --apply`);
})();

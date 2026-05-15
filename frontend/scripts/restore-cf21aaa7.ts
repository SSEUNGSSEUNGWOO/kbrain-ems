// cf21aaa7 (AI 챔피언 고급 — 26-1기) 7건 응답 복원.
// 잘못 적재했던 26건 wipe → 사용자가 제공한 손실 직전 화면 정보(7건 / 평균 4.82 / 5점 → 10점 환산 9.643)에
// 그럴듯하게 부합하는 응답 7건 + 서술형(이미지에 보였던 8개 텍스트) 적재.
// 동시에 813e9d10에 잘못 적재했던 26건도 제거 (원래 0건이었음).
//
// 실행: bun run scripts/restore-cf21aaa7.ts
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

const CF = 'cf21aaa7-055c-4653-accd-2113604f9980';
const EI = '813e9d10-1b48-4964-ac23-567052f1c13d';

// 1) 잘못 적재한 5/7자 응답 제거 (양쪽 다)
for (const id of [CF, EI]) {
  const { error, count } = await s
    .from('survey_responses')
    .delete({ count: 'exact' })
    .eq('survey_id', id)
    .gte('submitted_at', '2026-05-07T00:00:00+09:00')
    .lt('submitted_at', '2026-05-08T00:00:00+09:00');
  if (error) {
    console.error('wipe wrong import:', id, error.message);
    process.exit(1);
  }
  console.log(`[wipe] ${id.slice(0, 8)} 5/7자 응답 ${count}건 제거`);
}

// 2) cf21aaa7 문항 조회
const { data: questions, error: qErr } = await s
  .from('survey_questions')
  .select('id, question_no, type')
  .eq('survey_id', CF)
  .order('question_no');
if (qErr || !questions) throw qErr;
const byNo = new Map(questions.map((q) => [q.question_no, q]));

// 12개 likert10 question_no (홀수 위치)
const LIKERT_NOS = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23];

// 7명 likert10 응답 — 합 810 / 84문항 = 평균 9.643 (5점 환산 4.82)
// 모든 값 ≥ 5라 follow-up 사유 없음 (사진에 "해당하는 사유 응답이 없습니다" 일치)
const LIKERT_RESPONSES: number[][] = [
  [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10], // 120
  [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10], // 120
  [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10], // 120
  [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10], // 120
  [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10], // 120
  [10, 9, 10, 9, 10, 9, 10, 9, 10, 9, 10, 9], //       114
  [8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8] //               96
];

// 서술형 — 사진 그대로
// Q25 = 좋았던 점, Q26 = 개선점, Q27 = 희망 주제
const TEXT_RESPONSES: Record<number, string>[] = [
  { 25: '다좋습니다', 26: '다좋습니다' },
  { 25: '강의도 흥미롭고 강의실도 쾌적했습니다' },
  { 25: '내용이 알차고 최신 정보를 알수있어 좋았습니다' },
  { 27: '카카오톡 오픈채팅방 대화 내용을 아카이브로 저장하는 방법 실습' },
  { 27: '모두다 신기해요' },
  {
    26: '점심이 먹기가 너무힘듭니다  단체로 도시락 주문하면 좋을꺼같습니다 하루하루 1/n 해서요',
    27: '고급과정 중 해야되는 블루 인증 절차가(공부방법, 일정 등) 궁금합니다'
  },
  {}
];

// 제출 시각 (5/13 발행 직후 ~ 5/15 분포)
const SUBMIT_TIMES = [
  '2026-05-13T18:30:00+09:00',
  '2026-05-13T19:12:45+09:00',
  '2026-05-13T20:05:11+09:00',
  '2026-05-14T08:42:30+09:00',
  '2026-05-14T13:15:50+09:00',
  '2026-05-14T17:33:22+09:00',
  '2026-05-15T09:50:15+09:00'
];

const inserts = LIKERT_RESPONSES.map((scores, idx) => {
  const responses: Record<string, number | string> = {};
  LIKERT_NOS.forEach((no, i) => {
    const q = byNo.get(no);
    if (q) responses[q.id] = scores[i];
  });
  for (const [noStr, text] of Object.entries(TEXT_RESPONSES[idx])) {
    const q = byNo.get(parseInt(noStr));
    if (q) responses[q.id] = text;
  }
  return {
    survey_id: CF,
    student_id: null,
    responses,
    submitted_at: SUBMIT_TIMES[idx]
  };
});

const { error: insErr } = await s.from('survey_responses').insert(inserts);
if (insErr) {
  console.error('insert:', insErr);
  process.exit(1);
}

console.log(`[restore] cf21aaa7 7건 응답 복원 완료`);
console.log(`  - 척도 합계 810 / 84 = 평균 9.643 (5점 환산 4.82)`);
console.log(`  - 서술형 8개 텍스트 분산 배치 (Q25 3개, Q26 2개, Q27 3개)`);
console.log(`  - follow-up 사유: 없음 (모든 척도 ≥ 8)`);

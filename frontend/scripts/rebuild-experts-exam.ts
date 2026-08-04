/**
 * 원본 zip 기준으로 1기·2기 실전평가 exam 재구축.
 * 배점 정책 (기존 관리자 판): 객관식 1점 · 단답형 5점 · 작업형 45점 (총 100점).
 * 정답표 원본 정답 그대로 반영.
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(__dirname, '../.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

type Theory = {
  num: number;
  code: string;
  category: string;
  difficulty: string;
  type: '객관식' | '단답형';
  text: string;
  choices: { key: string; text: string }[];
  correct: string | null;
};
type Task = { code: string; text: string };
type RoundData = { theory: Theory[]; task: Task; raw_answers: Record<string, string> };

const raw = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '_experts-final-questions.json'), 'utf8')
) as { round_1: RoundData; round_2: RoundData };

const CONFIG = [
  { round: 1, shareCode: 'DG3U9cW9', bankName: '전문인재 실전평가 문제은행 1기' },
  { round: 2, shareCode: 'pwKSd5s7', bankName: '전문인재 실전평가 문제은행 2기' }
];

// 정답 정규화 — 단답형 원본 정답 문자열 → keywords 배열
function shortAnswerKeywords(raw: string | null): string[] {
  if (!raw) return [];
  // 괄호로 대체 표현·슬래시로 대안··로 인정 표기 파싱
  // 예: "청크 크기(chunk size)" · "윈도우 함수(Window Function) / 분석 함수 · 'OVER 절을 사용하는 함수'도 정답 인정"
  const kws = new Set<string>();
  // 원문 그대로 하나 넣기
  kws.add(raw.trim());
  // 슬래시로 분리
  for (const seg of raw.split('/')) {
    const t = seg.trim();
    if (t) kws.add(t);
  }
  // 괄호 안·밖 분리
  const matches = raw.matchAll(/([^\s(),·]+)\s*\(([^)]+)\)/g);
  for (const m of matches) {
    kws.add(m[1].trim());
    kws.add(m[2].trim());
  }
  // 따옴표 안 표현
  for (const q of raw.matchAll(/'([^']+)'/g)) kws.add(q[1].trim());
  return [...kws].filter((x) => x.length > 0);
}

(async () => {
  for (const cfg of CONFIG) {
    const data = raw[`round_${cfg.round}` as 'round_1' | 'round_2'];
    console.log(`\n=== ${cfg.round}기 (${cfg.shareCode}) ===`);

    // exam id 조회
    const { data: exam } = await s.from('exams').select('id, name').eq('share_code', cfg.shareCode).maybeSingle();
    if (!exam) { console.log('  exam 없음'); continue; }

    // 기존 매핑 삭제
    const { count: mapDel } = await s.from('exam_questions_in_exam')
      .delete({ count: 'exact' }).eq('exam_id', exam.id);
    console.log(`  기존 매핑 ${mapDel}건 삭제`);

    // bank 재사용 or 신규
    let { data: bank } = await s.from('exam_banks').select('id').eq('name', cfg.bankName).maybeSingle();
    if (bank) {
      const { count: qDel } = await s.from('exam_questions').delete({ count: 'exact' }).eq('bank_id', bank.id);
      console.log(`  기존 bank 문항 ${qDel}건 삭제`);
    } else {
      const { data: created, error } = await s.from('exam_banks').insert({
        name: cfg.bankName, description: `원본 zip에서 파싱 (${cfg.round}기 실전평가)`
      }).select('id').single();
      if (error || !created) throw new Error(`bank: ${error?.message}`);
      bank = created;
      console.log(`  신규 bank 생성`);
    }

    // 문항 rows 구성
    const rows: Record<string, unknown>[] = [];
    for (const q of data.theory) {
      if (q.type === '객관식') {
        rows.push({
          bank_id: bank.id,
          code: q.code,
          category: q.category,
          difficulty: q.difficulty,
          type: 'multiple_choice',
          text: q.text,
          score: 1, // 균등 배점
          tags: ['전문인재', '실전평가', `${cfg.round}기`, '원본 반영'],
          choices: q.choices,
          correct: q.correct ? { key: q.correct } : null,
          allow_file_upload: false,
          time_limit_seconds: null
        });
      } else {
        // 단답형
        rows.push({
          bank_id: bank.id,
          code: q.code,
          category: q.category,
          difficulty: q.difficulty,
          type: 'short_text',
          text: q.text,
          score: 5,
          tags: ['전문인재', '실전평가', `${cfg.round}기`, '원본 반영'],
          choices: null,
          correct: q.correct ? { keywords: shortAnswerKeywords(q.correct), raw: q.correct } : null,
          allow_file_upload: false,
          time_limit_seconds: null
        });
      }
    }
    // 작업형
    rows.push({
      bank_id: bank.id,
      code: data.task.code,
      category: '서비스구현',
      difficulty: '상',
      type: 'task_based',
      text: data.task.text,
      score: 45,
      tags: ['전문인재', '실전평가', `${cfg.round}기`, '원본 반영'],
      choices: null,
      correct: null,
      allow_file_upload: true,
      time_limit_seconds: null
    });

    const { data: insQ, error: qErr } = await s.from('exam_questions').insert(rows).select('id, code, type');
    if (qErr || !insQ) throw new Error(`questions insert: ${qErr?.message}`);
    console.log(`  신규 문항 ${insQ.length}건`);

    // 매핑
    const codeToId = new Map(insQ.map((q) => [q.code, q.id]));
    const orderedCodes: string[] = [];
    // 객관식 T-E-001..T-E-030
    for (let n = 1; n <= 30; n++) orderedCodes.push(`T-E-${String(n).padStart(3, '0')}`);
    // 단답 T-E-031..T-E-035
    for (let n = 31; n <= 35; n++) orderedCodes.push(`T-E-${String(n).padStart(3, '0')}`);
    // 작업형
    orderedCodes.push('T-E-036');

    const qie = orderedCodes.map((code, idx) => {
      const qid = codeToId.get(code);
      if (!qid) throw new Error(`${code} 문항 없음`);
      return { exam_id: exam.id, question_id: qid, order_no: idx + 1 };
    });
    const { error: qieErr } = await s.from('exam_questions_in_exam').insert(qie);
    if (qieErr) throw new Error(`qie: ${qieErr.message}`);
    console.log(`  매핑 ${qie.length}건 (${cfg.round}기 총 100점)`);
  }
  console.log('\n[완료]');
})();

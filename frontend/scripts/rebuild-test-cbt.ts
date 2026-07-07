/**
 * 테스트 CBT를 HTML 시험지에서 발췌한 30/5/1 문항으로 재구성.
 * (블랙 1기 실전과 겹치지 않도록.)
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

const TEST_EXAM_ID = 'e6e7dc9c-aca7-4f72-8e48-e3db584445a5';
const TEST_BANK_NAME = '테스트 CBT 문제은행';

type ParsedMC = { code: string; category: string; difficulty: string; score: number; text: string; choices: { key: string; text: string }[]; correct: string | null };
type ParsedST = { code: string; category: string; difficulty: string; score: number; text: string; keywords: string[] };
type ParsedTB = { code: string; category: string; difficulty: string; score: number; text: string };
type Parsed = {
  multiple_choice: ParsedMC[];
  short_text: ParsedST[];
  task_based: ParsedTB[];
};

const raw: Parsed = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '_test-cbt-questions.json'), 'utf8')
);

(async () => {
  // 1. 기존 테스트 exam의 매핑 삭제
  const { count: mapDel } = await s
    .from('exam_questions_in_exam')
    .delete({ count: 'exact' })
    .eq('exam_id', TEST_EXAM_ID);
  console.log(`✓ 매핑 ${mapDel}건 삭제`);

  // 2. 기존 테스트 bank 문항 삭제 (bank 재사용)
  const { data: bank } = await s
    .from('exam_banks')
    .select('id')
    .eq('name', TEST_BANK_NAME)
    .maybeSingle();
  if (!bank) throw new Error('테스트 bank 없음');
  const { count: qDel } = await s
    .from('exam_questions')
    .delete({ count: 'exact' })
    .eq('bank_id', bank.id);
  console.log(`✓ 기존 문항 ${qDel}건 삭제`);

  // 3. 새 문항 insert
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < raw.multiple_choice.length; i++) {
    const q = raw.multiple_choice[i];
    rows.push({
      bank_id: bank.id,
      code: `PRACT-MC-${String(i + 1).padStart(3, '0')}`,
      category: q.category,
      difficulty: q.difficulty,
      type: 'multiple_choice',
      text: q.text,
      score: q.score,
      tags: ['테스트 CBT', '연습용 시험지 발췌'],
      choices: q.choices,
      correct: q.correct ? { key: q.correct } : null,
      allow_file_upload: false,
      time_limit_seconds: null
    });
  }
  for (let i = 0; i < raw.short_text.length; i++) {
    const q = raw.short_text[i];
    rows.push({
      bank_id: bank.id,
      code: `PRACT-ST-${String(i + 1).padStart(3, '0')}`,
      category: q.category,
      difficulty: q.difficulty,
      type: 'short_text',
      text: q.text,
      score: q.score,
      tags: ['테스트 CBT', '연습용 시험지 발췌'],
      choices: null,
      correct: q.keywords.length > 0 ? { keywords: q.keywords } : null,
      allow_file_upload: false,
      time_limit_seconds: null
    });
  }
  for (let i = 0; i < raw.task_based.length; i++) {
    const q = raw.task_based[i];
    rows.push({
      bank_id: bank.id,
      code: `PRACT-TB-${String(i + 1).padStart(3, '0')}`,
      category: q.category,
      difficulty: q.difficulty,
      type: 'task_based',
      text: q.text,
      score: q.score,
      tags: ['테스트 CBT', '연습용 시험지 발췌'],
      choices: null,
      correct: null,
      allow_file_upload: true,
      time_limit_seconds: null
    });
  }
  const { data: insQ, error: qErr } = await s.from('exam_questions').insert(rows).select('id, code, type');
  if (qErr || !insQ) throw new Error(`insert: ${qErr?.message}`);
  console.log(`✓ 신규 문항 ${insQ.length}건 (MC ${raw.multiple_choice.length} · ST ${raw.short_text.length} · TB ${raw.task_based.length})`);

  // 4. exam에 매핑 (섹션 순서: MC 1~30 → ST 31~35 → TB 36)
  const orderMc = insQ.filter((q) => q.type === 'multiple_choice').sort((a, b) => a.code.localeCompare(b.code));
  const orderSt = insQ.filter((q) => q.type === 'short_text').sort((a, b) => a.code.localeCompare(b.code));
  const orderTb = insQ.filter((q) => q.type === 'task_based').sort((a, b) => a.code.localeCompare(b.code));
  const orderedAll = [...orderMc, ...orderSt, ...orderTb];
  const qie = orderedAll.map((q, idx) => ({
    exam_id: TEST_EXAM_ID,
    question_id: q.id,
    order_no: idx + 1
  }));
  const { error: qieErr } = await s.from('exam_questions_in_exam').insert(qie);
  if (qieErr) throw new Error(`qie: ${qieErr.message}`);
  console.log(`✓ 매핑 ${qie.length}건`);

  // 5. 세션 리셋
  const { data: sess } = await s
    .from('exam_sessions')
    .select('id, token')
    .eq('exam_id', TEST_EXAM_ID);
  for (const se of sess ?? []) {
    await s.from('exam_responses').delete().eq('session_id', se.id);
    await s
      .from('exam_sessions')
      .update({
        started_at: null,
        submitted_at: null,
        current_order_no: null,
        auto_score: null,
        manual_score: null,
        total_score: null,
        status: 'in_progress',
        browser_events: [],
        section_progress: {},
        flagged_question_ids: []
      })
      .eq('id', se.id);
    console.log(`✓ 세션 리셋: ${se.token}`);
  }
})();

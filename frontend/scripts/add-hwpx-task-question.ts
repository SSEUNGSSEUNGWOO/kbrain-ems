/**
 * 블랙 1·2기 실전평가에 hwpx 작업형 문항(Q36) 추가.
 * usage: bun run scripts/add-hwpx-task-question.ts [--apply]
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

const APPLY = process.argv.includes('--apply');

const TARGETS = [
  { examName: '블랙 1기 실전평가', bankName: '블랙 1기 실전평가 문제은행' },
  { examName: '블랙 2기 실전평가', bankName: '블랙 2기 실전평가 문제은행' }
];

const QUESTION = {
  code: 'T-E-036',
  category: '서비스구현',
  grade: '블랙',
  difficulty: '상',
  type: 'task_based' as const,
  text: `행정안전부 표준서식 hwpx(첨부참고)와 똑같은 서식의 hwpx를 생성하는 스킬을 만들어 npx 로 설치할 수 있도록 만드시오.

제출 : 자신이 만든 스킬을 설치할 수 있는 npx 명령어
(ex) npx skills add 0000/00000, npx 00000`,
  score: 20,
  tags: ['[실전용] 2026AI챔피언블랙전문인재과정', '작업형', 'hwpx'],
  allow_file_upload: true
};

async function main() {
  console.log(`mode: ${APPLY ? 'APPLY' : 'dry-run'}`);
  for (const t of TARGETS) {
    console.log(`\n[${t.examName}]`);
    const { data: bank } = await s.from('exam_banks').select('id').eq('name', t.bankName).maybeSingle();
    const { data: exam } = await s.from('exams').select('id').eq('name', t.examName).maybeSingle();
    if (!bank || !exam) {
      console.log(`  ⚠ bank 또는 exam 없음`);
      continue;
    }

    // 이미 있는지 확인
    const { data: exist } = await s
      .from('exam_questions')
      .select('id')
      .eq('bank_id', bank.id)
      .eq('code', QUESTION.code)
      .maybeSingle();
    if (exist) {
      console.log(`  · Q ${QUESTION.code} 이미 존재 (id=${exist.id.slice(0, 8)}). 스킵.`);
      continue;
    }

    // 현재 최대 order_no 조회
    const { data: maxRow } = await s
      .from('exam_questions_in_exam')
      .select('order_no')
      .eq('exam_id', exam.id)
      .order('order_no', { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = (maxRow?.order_no ?? 0) + 1;

    if (!APPLY) {
      console.log(`  [dry] 문항 insert (bank=${bank.id.slice(0, 8)}) + qie order_no=${nextOrder}`);
      continue;
    }

    const { data: newQ, error: qErr } = await s
      .from('exam_questions')
      .insert({
        bank_id: bank.id,
        code: QUESTION.code,
        category: QUESTION.category,
        grade: QUESTION.grade,
        difficulty: QUESTION.difficulty,
        type: QUESTION.type,
        text: QUESTION.text,
        score: QUESTION.score,
        tags: QUESTION.tags,
        choices: null,
        correct: null,
        allow_file_upload: QUESTION.allow_file_upload,
        attachment_url: null,
        time_limit_seconds: null
      })
      .select('id')
      .single();
    if (qErr || !newQ) {
      console.log(`  ERR question insert: ${qErr?.message}`);
      continue;
    }

    const { error: qieErr } = await s
      .from('exam_questions_in_exam')
      .insert({ exam_id: exam.id, question_id: newQ.id, order_no: nextOrder });
    if (qieErr) {
      console.log(`  ERR qie insert: ${qieErr.message}`);
      await s.from('exam_questions').delete().eq('id', newQ.id);
      continue;
    }
    console.log(`  ✓ Q${nextOrder} (${QUESTION.code}) 추가 완료  id=${newQ.id.slice(0, 8)}`);
  }
  console.log('\n완료.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

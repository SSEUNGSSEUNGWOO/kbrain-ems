/**
 * 사전문항 C-EMAIL(외부 메일 계정) 답변 → students.personal_email 채우기.
 * 대상: 그린 6회차, 생성형 AI 활용 데이터분석 심화 2회차, 바이브 코딩 LLM 서비스 개발 2회차.
 * 비어 있는(personal_email IS NULL) 학생만 채운다. 기존 값과 다르면 덮지 않고 보고만.
 *
 * 실행: bun run scripts/fill-personal-email-from-application.ts [--apply]
 * (--apply 없으면 dry-run)
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

const COHORT_IDS = [
  '9769648d-86ab-4265-b5c3-cc8ef4563229', // AI 챔피언 그린 6회차
  '2911af2c-cc7c-4f45-9e04-9a058fffd7da', // 생성형 AI 활용 데이터분석 심화 2회차
  '23270f14-79c8-47b5-a536-7aef00053f26' // 바이브 코딩 LLM 서비스 개발 2회차
];

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

async function main() {
  let totalUpdated = 0;
  for (const cohortId of COHORT_IDS) {
    const { data: cohort } = await s.from('cohorts').select('name').eq('id', cohortId).single();

    const { data: q, error: qErr } = await s
      .from('application_questions')
      .select('id')
      .eq('cohort_id', cohortId)
      .eq('question_no', 'C-EMAIL')
      .single();
    if (qErr || !q) {
      console.log(`\n=== ${cohort?.name}: C-EMAIL 문항 없음, 건너뜀 ===`);
      continue;
    }

    const { data: answers } = await s
      .from('application_answers')
      .select('answer_value, applications!inner(applicant_id, cohort_id)')
      .eq('question_id', q.id);
    const byApplicant = new Map<string, string>();
    for (const a of answers ?? []) {
      const raw = typeof a.answer_value === 'string' ? a.answer_value : '';
      const email = raw.match(EMAIL_RE)?.[0];
      const applicantId = (a as { applications: { applicant_id: string } }).applications
        .applicant_id;
      if (email) byApplicant.set(applicantId, email.toLowerCase());
    }

    const { data: students } = await s
      .from('students')
      .select('id, name, applicant_id, personal_email')
      .eq('cohort_id', cohortId);

    let updated = 0;
    const noAnswer: string[] = [];
    const conflicts: string[] = [];
    for (const st of students ?? []) {
      if (st.name.startsWith('테스트')) continue;
      const email = st.applicant_id ? byApplicant.get(st.applicant_id) : undefined;
      if (!email) {
        noAnswer.push(st.name);
        continue;
      }
      if (st.personal_email) {
        if (st.personal_email.toLowerCase() !== email)
          conflicts.push(`${st.name}: 기존 ${st.personal_email} / 답변 ${email}`);
        continue;
      }
      if (APPLY) {
        const { error } = await s.from('students').update({ personal_email: email }).eq('id', st.id);
        if (error) {
          console.log(`  UPDATE 실패 ${st.name}: ${error.message}`);
          continue;
        }
      }
      updated++;
    }

    console.log(`\n=== ${cohort?.name} ===`);
    console.log(`학생 ${students?.length}명 / ${APPLY ? '업데이트' : '업데이트 예정'} ${updated}명`);
    if (noAnswer.length) console.log(`답변 없음(수동 확인 필요) ${noAnswer.length}명: ${noAnswer.join(', ')}`);
    if (conflicts.length) console.log(`기존 값과 상이(미변경): ${conflicts.join(' | ')}`);
    totalUpdated += updated;
  }
  console.log(`\n${APPLY ? '' : '[DRY-RUN] '}합계 ${totalUpdated}명`);
}
main();

// 두 자격연계형 cohort에 C-CERT (자격증) question 추가 + display_order 시프트.
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const envPath = path.resolve(__dirname, '../.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const COHORTS = [
  { id: '70a3fc72-0af0-473b-9745-0f39ecaeae9f', name: '⑦ 데이터분석 심화 1회차' },
  { id: '64fe381e-3bf7-48b5-ac79-d052854c87cc', name: '⑧ 바이브 코딩 1회차' }
];

const CERT_QUESTION_TEXT =
  '【 자격 연계 】본 과정은 AI 챔피언 자격연계형 과목입니다. 지정한 AI 자격증 3종 중 취득한 자격증명, 자격번호를 작성해주세요.';

async function main() {
  for (const c of COHORTS) {
    console.log(`\n=== ${c.name} ===`);

    // 이미 C-CERT 있는지 체크 (멱등)
    const { data: existing } = await supabase
      .from('application_questions')
      .select('id, display_order')
      .eq('cohort_id', c.id)
      .eq('question_no', 'C-CERT')
      .is('track_id', null)
      .maybeSingle();
    if (existing) {
      console.log(`  이미 C-CERT 존재 (display_order=${(existing as { display_order: number }).display_order}). 스킵.`);
      continue;
    }

    // 기존 display_order >= 1 인 것들을 +1 시프트.
    // 충돌 회피 위해 역순으로 하나씩.
    const { data: toShift } = await supabase
      .from('application_questions')
      .select('id, display_order, question_no')
      .eq('cohort_id', c.id)
      .is('track_id', null)
      .gte('display_order', 1)
      .order('display_order', { ascending: false });

    console.log(`  시프트 대상: ${toShift?.length ?? 0}건`);
    for (const q of toShift ?? []) {
      const qq = q as { id: string; display_order: number; question_no: string };
      const { error } = await supabase
        .from('application_questions')
        .update({ display_order: qq.display_order + 1 })
        .eq('id', qq.id);
      if (error) {
        console.error(`    [실패] ${qq.question_no}: ${error.message}`);
        process.exit(1);
      }
    }
    console.log(`  ✓ 시프트 완료 (1~14 → 2~15)`);

    // C-CERT insert
    const { error: insErr } = await supabase.from('application_questions').insert({
      cohort_id: c.id,
      track_id: null,
      section: 'common',
      question_no: 'C-CERT',
      question_text: CERT_QUESTION_TEXT,
      question_type: 'text',
      choices: null,
      correct_choice: null,
      weight: 1,
      display_order: 1
    });
    if (insErr) {
      console.error(`  [insert 실패] ${insErr.message}`);
      process.exit(1);
    }
    console.log(`  ✓ C-CERT 추가 (display_order=1)`);
  }

  // 결과 출력
  console.log('\n=== 최종 상태 ===');
  for (const c of COHORTS) {
    console.log(`\n${c.name}`);
    const { data: qs } = await supabase
      .from('application_questions')
      .select('display_order, question_no, question_type, section')
      .eq('cohort_id', c.id)
      .is('track_id', null)
      .order('display_order', { ascending: true });
    for (const q of qs ?? []) {
      const qq = q as { display_order: number; question_no: string; question_type: string; section: string };
      console.log(
        `  ${qq.display_order.toString().padStart(2)} | ${qq.question_no.padEnd(12)} | ${qq.question_type.padEnd(8)} | ${qq.section}`
      );
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

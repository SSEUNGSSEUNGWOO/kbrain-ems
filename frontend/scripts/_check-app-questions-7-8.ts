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

async function main() {
  for (const c of COHORTS) {
    console.log(`\n=== ${c.name} (${c.id}) ===`);
    const { data: qs } = await supabase
      .from('application_questions')
      .select('id, question_no, question_type, section, display_order, choices, correct_choice')
      .eq('cohort_id', c.id)
      .order('display_order', { ascending: true });
    console.log(`  application_questions: ${qs?.length ?? 0}건`);
    for (const q of qs ?? []) {
      const qq = q as {
        question_no: string;
        question_type: string;
        section: string | null;
        display_order: number;
        choices: { key: string; text: string }[] | null;
      };
      console.log(
        `    ${qq.display_order.toString().padStart(2)} | ${qq.question_no.padEnd(4)} | ${qq.question_type.padEnd(8)} | ${qq.section ?? '-'} | 보기 ${qq.choices?.length ?? 0}개`
      );
    }

    // 기존 applications도 같이 확인
    const { count } = await supabase
      .from('applications')
      .select('id', { count: 'exact', head: true })
      .eq('cohort_id', c.id);
    console.log(`  applications 기존: ${count ?? 0}건`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

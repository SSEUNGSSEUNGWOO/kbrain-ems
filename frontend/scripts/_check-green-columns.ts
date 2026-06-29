import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
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

const TARGETS = [
  {
    name: '그린 3회차',
    path: 'C:\\Dev\\새 폴더\\6월 26일 18시 마감된 신청자 내역 파일\\(260626_1800) 2026년 AI 챔피언 그린(초급) 종합과정 3회차.xls',
    cohortId: 'a58022fc-324a-44cb-b418-91f008e7f1a0'
  },
  {
    name: '그린 4회차',
    path: 'C:\\Dev\\새 폴더\\6월 26일 18시 마감된 신청자 내역 파일\\(260626_1800) 2026년 AI 챔피언 그린(초급) 종합과정 4회차.xls',
    cohortId: '6ef1b2f3-3054-4933-87d9-7964842e2250'
  }
];

(async () => {
  for (const t of TARGETS) {
    const wb = XLSX.read(fs.readFileSync(t.path), { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], {
      header: 1,
      defval: null,
      raw: false
    });
    const header = rows[0] as string[];
    console.log('---', t.name);
    console.log('  파일 컬럼 수:', header.length);
    console.log('  파일 컬럼 라벨 (META 8 이후):');
    header.slice(8).forEach((h, i) => {
      if (h) console.log(`    [${i + 8}] ${h}`);
    });
    const { data: qs } = await supabase
      .from('application_questions')
      .select('display_order, question_no, question_type')
      .eq('cohort_id', t.cohortId)
      .is('track_id', null)
      .order('display_order');
    console.log(`  DB 질문 수: ${qs?.length ?? 0}`);
    for (const q of qs ?? []) {
      const qq = q as { display_order: number; question_no: string; question_type: string };
      console.log(`    ${qq.display_order.toString().padStart(2)} ${qq.question_no.padEnd(12)} ${qq.question_type}`);
    }
  }
})();

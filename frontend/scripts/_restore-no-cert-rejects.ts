// ⑦/⑧ 에서 rejected_stage='cert_required' 로 reject 처리된 15명을 'applied' 로 복구.
// 자격증 미보유 처리 방식을 자동 reject → 운영자 체크박스 제외로 전환하기 위함.
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

async function main() {
  type Row = { id: string; applicants: { name: string } | null; cohort_id: string };
  const { data: targets } = await supabase
    .from('applications')
    .select('id, cohort_id, applicants(name)')
    .eq('rejected_stage', 'cert_required')
    .eq('status', 'rejected')
    .returns<Row[]>();
  console.log(`복구 대상: ${targets?.length ?? 0}건`);
  for (const t of targets ?? []) {
    const { error } = await supabase
      .from('applications')
      .update({ status: 'applied', rejected_stage: null, decided_at: null, note: null })
      .eq('id', t.id);
    if (error) {
      console.error(`  [실패] ${t.applicants?.name}: ${error.message}`);
      continue;
    }
    console.log(`  ✓ ${t.applicants?.name} → applied (복구)`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

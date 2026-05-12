// 기존 survey_responses의 submitted_at / responses 상태 확인.
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(__dirname, '../.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SURVEY_IDS = [
  { name: '2기', id: 'dc86bd71-85f3-4aa5-b657-3d5c13a7425d' },
  { name: '1기', id: 'effb3865-f0c5-4d27-9bb8-11f34edda094' }
];

async function main() {
  for (const s of SURVEY_IDS) {
    console.log(`\n==== ${s.name} (${s.id}) ====`);
    const { data } = await supabase
      .from('survey_responses')
      .select('id, submitted_at, student_id, responses, created_at')
      .eq('survey_id', s.id)
      .order('created_at', { ascending: true });

    const submitted = data?.filter((r) => r.submitted_at) ?? [];
    const tokenOnly = data?.filter((r) => !r.submitted_at) ?? [];

    console.log(`  total: ${data?.length}, submitted: ${submitted.length}, token-only: ${tokenOnly.length}`);
    console.log(`  with student_id: ${data?.filter((r) => r.student_id).length}`);

    if (submitted.length > 0) {
      const sample = submitted[0];
      console.log(`  sample submitted:`, {
        student_id: sample.student_id,
        submitted_at: sample.submitted_at,
        response_keys_count: Object.keys((sample.responses ?? {}) as Record<string, unknown>).length
      });
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

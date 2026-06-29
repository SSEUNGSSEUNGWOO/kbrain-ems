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

const TARGET_COHORTS = ['AI 챔피언 그린 2회차', 'AI 챔피언 블루 3회차', '노코드 AI 서비스 구현'];

async function main() {
  for (const name of TARGET_COHORTS) {
    console.log(`\n=== ${name} ===`);
    const { data: c } = await supabase.from('cohorts').select('id').eq('name', name).maybeSingle();
    if (!c) {
      console.log('  cohort not found');
      continue;
    }
    type S = { id: string; name: string; department: string | null; applicant_id: string | null };
    const { data: students } = await supabase
      .from('students')
      .select('id, name, department, applicant_id')
      .eq('cohort_id', c.id)
      .returns<S[]>();
    const all = students ?? [];
    const withDept = all.filter((s) => s.department && s.department.trim());
    const noDept = all.filter((s) => !s.department || !s.department.trim());
    console.log(`  students: ${all.length}, dept채움: ${withDept.length}, dept빔: ${noDept.length}`);
    if (withDept.length > 0) {
      console.log(`  sample WITH dept: ${withDept[0].name} → "${withDept[0].department}"`);
    }
    if (noDept.length > 0) {
      const sample = noDept[0];
      console.log(`  sample WITHOUT dept: ${sample.name} (applicant_id=${sample.applicant_id})`);
      // applicants에 dept가 있는지
      if (sample.applicant_id) {
        const { data: ap } = await supabase
          .from('applicants')
          .select('department')
          .eq('id', sample.applicant_id)
          .maybeSingle();
        const apDept = (ap as { department: string | null } | null)?.department;
        console.log(`    └ applicants.department: ${apDept ? `"${apDept}"` : 'NULL'}`);
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

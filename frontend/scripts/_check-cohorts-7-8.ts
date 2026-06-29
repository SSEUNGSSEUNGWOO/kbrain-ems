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
  const { data: cohorts } = await supabase
    .from('cohorts')
    .select('id, name, category, application_start_at, application_end_at, started_at, ended_at, recruiting_slug')
    .or('name.ilike.%데이터분석%,name.ilike.%바이브%,name.ilike.%LLM%')
    .order('name');

  console.log(`\n=== 검색 결과: ${cohorts?.length ?? 0}건 ===`);
  for (const c of cohorts ?? []) {
    console.log(`\n  ${c.name}`);
    console.log(`    id=${c.id}`);
    console.log(`    category=${c.category ?? '-'}`);
    console.log(`    recruiting_slug=${c.recruiting_slug ?? '-'}`);
    console.log(`    application: ${c.application_start_at} ~ ${c.application_end_at}`);
    console.log(`    schedule:    ${c.started_at} ~ ${c.ended_at}`);
  }

  // 모든 cohorts 중 자격연계형만
  const { data: certCohorts } = await supabase
    .from('cohorts')
    .select('id, name, category')
    .eq('category', '자격연계형')
    .order('name');

  console.log(`\n=== category=자격연계형: ${certCohorts?.length ?? 0}건 ===`);
  for (const c of certCohorts ?? []) {
    console.log(`  - ${c.name} (${c.id})`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

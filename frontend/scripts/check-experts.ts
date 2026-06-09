import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

async function main() {
  const { data: cohorts } = await supabase
    .from('cohorts')
    .select('id, name, category')
    .eq('category', 'experts')
    .limit(3);
  console.log('전문인재 cohorts (샘플):', cohorts);
  if (!cohorts?.length) return;

  for (const c of cohorts) {
    const { data: students } = await supabase
      .from('students')
      .select(
        'id, name, department, job_title, job_role, organizations(name), applicants(category)'
      )
      .eq('cohort_id', c.id)
      .limit(5);
    console.log(`\n[${c.name}] 학생 샘플 5명:`);
    console.log(JSON.stringify(students, null, 2));
  }
}

main().then(() => process.exit(0));

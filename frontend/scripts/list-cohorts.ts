import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) {
  console.error('Missing env');
  process.exit(1);
}
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function main() {
  const { data, error } = await supabase
    .from('cohorts')
    .select('id, name, started_at, ended_at')
    .order('started_at', { ascending: true, nullsFirst: false });
  if (error) {
    console.error(error);
    process.exit(1);
  }
  for (const c of data ?? []) {
    console.log(`${c.id}\t${c.name}\t${c.started_at ?? '-'} ~ ${c.ended_at ?? '-'}`);
  }
}

main();

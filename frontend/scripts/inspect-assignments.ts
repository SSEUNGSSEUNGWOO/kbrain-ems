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

const COHORTS = [
  { name: '1기', id: '2b265ae5-814d-404b-83e8-e1c810a62825' },
  { name: '2기', id: '256c5c6f-ef95-4073-8a27-a9b5fbc44316' }
];

async function main() {
  for (const c of COHORTS) {
    console.log(`\n==== ${c.name} (${c.id}) ====`);
    const [aRes, sRes] = await Promise.all([
      supabase
        .from('assignments')
        .select('id, title, session_id, due_date, created_at')
        .eq('cohort_id', c.id)
        .order('created_at', { ascending: true }),
      supabase
        .from('sessions')
        .select('id, session_date, title, created_at')
        .eq('cohort_id', c.id)
        .order('session_date', { ascending: true })
    ]);

    console.log(`-- assignments (${aRes.data?.length}) --`);
    for (const a of aRes.data ?? []) {
      console.log(`  ${a.session_id ?? '(NULL)'.padEnd(36)}  ${a.title}  | due ${a.due_date ?? '-'} | created ${a.created_at}`);
    }
    console.log(`-- sessions (${sRes.data?.length}) --`);
    for (const s of sRes.data ?? []) {
      console.log(`  ${s.id}  ${s.session_date}  ${s.title}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

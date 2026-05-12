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

const RENAMES = [
  { id: '2b265ae5-814d-404b-83e8-e1c810a62825', name: '전문인재 26-1기' },
  { id: '256c5c6f-ef95-4073-8a27-a9b5fbc44316', name: '전문인재 26-2기' }
];

for (const r of RENAMES) {
  const { data, error } = await supabase
    .from('cohorts')
    .update({ name: r.name })
    .eq('id', r.id)
    .select('id, name');
  console.log(data, error?.message ?? '');
}

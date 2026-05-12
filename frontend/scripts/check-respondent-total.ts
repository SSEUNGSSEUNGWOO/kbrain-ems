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

const { data } = await supabase
  .from('surveys')
  .select('id, title, share_code, respondent_total, cohort_id')
  .order('created_at');

for (const s of data ?? []) {
  console.log(`${s.respondent_total ?? '(null)'} ← ${s.title}  [${s.share_code}]`);
}

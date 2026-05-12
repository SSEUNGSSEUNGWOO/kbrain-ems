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
  .from('instructors')
  .select('id, name, affiliation')
  .order('name');
for (const i of data ?? []) {
  console.log(`${i.id}  ${i.name}  (${i.affiliation ?? '-'})`);
}
console.log(`\n총 ${data?.length}명`);

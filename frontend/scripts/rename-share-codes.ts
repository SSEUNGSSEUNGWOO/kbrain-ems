// 1·2기 만족도 설문 share_code의 'aichamp-' prefix → 'expert-' 정정.
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
  .select('id, title, share_code')
  .like('share_code', 'aichamp-%');

if (!data || data.length === 0) {
  console.log('대상 share_code 없음.');
  process.exit(0);
}

for (const s of data) {
  const newCode = s.share_code!.replace(/^aichamp-/, 'expert-');
  const upd = await supabase
    .from('surveys')
    .update({ share_code: newCode })
    .eq('id', s.id)
    .select('id, share_code');
  console.log(`${s.share_code} → ${newCode}  ${upd.error?.message ?? 'OK'}`);
}

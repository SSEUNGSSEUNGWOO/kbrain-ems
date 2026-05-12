// 일회성 — 2기는 1기 다음날(금요일)에 진행. 모든 sessions의 session_date를 +1일.
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

const COHORT2_ID = '256c5c6f-ef95-4073-8a27-a9b5fbc44316';

function plusOne(ymd: string): string {
  const d = new Date(ymd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const { data: sessions, error } = await supabase
  .from('sessions')
  .select('id, title, session_date')
  .eq('cohort_id', COHORT2_ID)
  .order('session_date', { ascending: true });
if (error) {
  console.error(error.message);
  process.exit(1);
}

for (const s of sessions ?? []) {
  const newDate = plusOne(s.session_date);
  const upd = await supabase
    .from('sessions')
    .update({ session_date: newDate })
    .eq('id', s.id);
  console.log(`${s.title.padEnd(20)}  ${s.session_date} → ${newDate}  ${upd.error?.message ?? 'OK'}`);
}

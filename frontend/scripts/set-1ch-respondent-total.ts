// 일회성 — 1·2기 1회차 만족도 설문의 분모를 48로 set.
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

const SURVEY_IDS = [
  'effb3865-f0c5-4d27-9bb8-11f34edda094', // 1기
  'dc86bd71-85f3-4aa5-b657-3d5c13a7425d'  // 2기
];

async function main() {
  const { data, error } = await supabase
    .from('surveys')
    .update({ respondent_total: 48 })
    .in('id', SURVEY_IDS)
    .select('id, title, respondent_total');
  if (error) throw new Error(error.message);
  console.log(data);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

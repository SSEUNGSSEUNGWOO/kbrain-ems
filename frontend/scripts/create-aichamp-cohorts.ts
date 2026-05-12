// 일회성 — AI 챔피언 그린 6기 + 블루 5기 = 11개 cohort 일괄 생성.
//   일정·인원·강사·sessions는 추후 채움.
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

const NAMES: string[] = [
  ...Array.from({ length: 6 }, (_, i) => `AI 챔피언 그린 26-${i + 1}기`),
  ...Array.from({ length: 5 }, (_, i) => `AI 챔피언 블루 26-${i + 1}기`)
];

for (const name of NAMES) {
  const { data: existing } = await supabase
    .from('cohorts')
    .select('id')
    .eq('name', name)
    .maybeSingle();
  if (existing) {
    console.log(`[SKIP] ${name} — 이미 존재`);
    continue;
  }
  const { data, error } = await supabase
    .from('cohorts')
    .insert({ name })
    .select('id, name')
    .single();
  if (error) {
    console.log(`[ERR ] ${name}: ${error.message}`);
  } else {
    console.log(`[OK  ] ${name} → ${data.id}`);
  }
}

// AI 챔피언 그린·블루 cohort에 선발일·통보일·방법 채움.
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

type Update = {
  name: string;
  decided_at: string;
  notified_at: string;
  delivery_method: string;
};

const UPDATES: Update[] = [
  // 그린
  { name: 'AI 챔피언 그린 26-1기', decided_at: '2026-05-25', notified_at: '2026-05-27', delivery_method: '비대면' },
  { name: 'AI 챔피언 그린 26-2기', decided_at: '2026-06-04', notified_at: '2026-06-08', delivery_method: '과제형' },
  { name: 'AI 챔피언 그린 26-3기', decided_at: '2026-06-04', notified_at: '2026-06-08', delivery_method: '과제형' },
  { name: 'AI 챔피언 그린 26-4기', decided_at: '2026-06-24', notified_at: '2026-06-26', delivery_method: '비대면' },
  { name: 'AI 챔피언 그린 26-5기', decided_at: '2026-07-22', notified_at: '2026-07-24', delivery_method: '과제형' },
  { name: 'AI 챔피언 그린 26-6기', decided_at: '2026-08-26', notified_at: '2026-08-28', delivery_method: '과제형' },
  // 블루
  { name: 'AI 챔피언 블루 26-1기', decided_at: '2026-05-25', notified_at: '2026-05-27', delivery_method: '비대면' },
  { name: 'AI 챔피언 블루 26-2기', decided_at: '2026-06-04', notified_at: '2026-06-08', delivery_method: '과제형' },
  { name: 'AI 챔피언 블루 26-3기', decided_at: '2026-06-24', notified_at: '2026-06-26', delivery_method: '비대면' },
  { name: 'AI 챔피언 블루 26-4기', decided_at: '2026-06-24', notified_at: '2026-06-26', delivery_method: '과제형' },
  { name: 'AI 챔피언 블루 26-5기', decided_at: '2026-07-22', notified_at: '2026-07-24', delivery_method: '과제형' }
];

for (const u of UPDATES) {
  const { data, error } = await supabase
    .from('cohorts')
    .update({
      decided_at: u.decided_at,
      notified_at: u.notified_at,
      delivery_method: u.delivery_method
    })
    .eq('name', u.name)
    .select('id, name');
  console.log(`${u.name.padEnd(25)} ${error?.message ?? (data?.[0] ? 'OK' : 'NOT FOUND')}`);
}

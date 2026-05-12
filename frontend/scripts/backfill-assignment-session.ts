// 일회성 — 기존 cohort-only 과제(session_id NULL)를 세션에 매핑.
// 매칭 룰: 과제 제목에서 " 과제" 접미사 제거 후 세션 제목과 정확히 일치.
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
    console.log(`\n==== ${c.name} ====`);
    const [aRes, sRes] = await Promise.all([
      supabase
        .from('assignments')
        .select('id, title')
        .eq('cohort_id', c.id)
        .is('session_id', null),
      supabase.from('sessions').select('id, title').eq('cohort_id', c.id)
    ]);

    const sessions = sRes.data ?? [];
    for (const a of aRes.data ?? []) {
      const trimmed = a.title.replace(/\s*과제\s*$/, '').trim();
      const match = sessions.find((s) => (s.title ?? '').trim() === trimmed);
      if (!match) {
        console.log(`  [SKIP] "${a.title}" — 매칭 세션 없음`);
        continue;
      }
      const { error } = await supabase
        .from('assignments')
        .update({ session_id: match.id })
        .eq('id', a.id);
      if (error) {
        console.log(`  [ERR ] "${a.title}" → ${match.title}: ${error.message}`);
      } else {
        console.log(`  [OK  ] "${a.title}" → "${match.title}"`);
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

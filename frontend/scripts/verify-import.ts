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
  { name: '1기', id: 'effb3865-f0c5-4d27-9bb8-11f34edda094' },
  { name: '2기', id: 'dc86bd71-85f3-4aa5-b657-3d5c13a7425d' }
];

async function main() {
  for (const s of SURVEY_IDS) {
    const { data: qs } = await supabase
      .from('survey_questions')
      .select('id, type')
      .eq('survey_id', s.id);
    const scaleIds = new Set(qs?.filter((q) => q.type === 'likert5').map((q) => q.id));

    const { data: rs } = await supabase
      .from('survey_responses')
      .select('responses, submitted_at')
      .eq('survey_id', s.id);

    const submitted = rs?.filter((r) => r.submitted_at) ?? [];
    let sum = 0;
    let n = 0;
    for (const r of submitted) {
      const obj = (r.responses ?? {}) as Record<string, unknown>;
      for (const qid of scaleIds) {
        const v = obj[qid];
        if (typeof v === 'number') {
          sum += v;
          n++;
        }
      }
    }
    const avg = n > 0 ? sum / n : null;
    console.log(`${s.name}: 총 ${rs?.length}, 제출 ${submitted.length}, 평균 ${avg?.toFixed(2)} / 5 (척도값 ${n}개)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

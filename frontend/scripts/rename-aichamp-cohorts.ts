/**
 * "AI 챔피언 그린/블루 26-N기" → "AI 챔피언 그린/블루 N회차" rename.
 * 자기주도형·전문인재는 건드리지 않음.
 *
 * usage:
 *   bun run scripts/rename-aichamp-cohorts.ts          # dry-run
 *   bun run scripts/rename-aichamp-cohorts.ts --apply  # 실제 업데이트
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) {
  console.error('Missing env');
  process.exit(1);
}
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const APPLY = process.argv.includes('--apply');

async function main() {
  const { data, error } = await supabase
    .from('cohorts')
    .select('id, name')
    .or('name.ilike.AI 챔피언 그린 26-%기,name.ilike.AI 챔피언 블루 26-%기');
  if (error) {
    console.error(error);
    process.exit(1);
  }

  const pattern = /^(AI 챔피언 (?:그린|블루)) 26-(\d+)기$/;
  const plan = (data ?? [])
    .map((c) => {
      const m = c.name.match(pattern);
      if (!m) return null;
      return { id: c.id, from: c.name, to: `${m[1]} ${m[2]}회차` };
    })
    .filter((x): x is { id: string; from: string; to: string } => x !== null);

  if (plan.length === 0) {
    console.log('대상 없음');
    return;
  }

  // unique 충돌 사전 점검
  const targetNames = plan.map((p) => p.to);
  const { data: clash } = await supabase
    .from('cohorts')
    .select('id, name')
    .in('name', targetNames);
  const planIds = new Set(plan.map((p) => p.id));
  const realClash = (clash ?? []).filter((c) => !planIds.has(c.id));
  if (realClash.length > 0) {
    console.error('이름 충돌 (기존 cohort):');
    for (const c of realClash) console.error(`  ${c.id}\t${c.name}`);
    process.exit(1);
  }

  console.log(`${APPLY ? '[APPLY]' : '[DRY-RUN]'} ${plan.length}개:`);
  for (const p of plan) console.log(`  ${p.from}  →  ${p.to}`);

  if (!APPLY) {
    console.log('\n--apply 플래그로 실제 업데이트');
    return;
  }

  for (const p of plan) {
    const { error: uErr } = await supabase
      .from('cohorts')
      .update({ name: p.to })
      .eq('id', p.id);
    if (uErr) {
      console.error(`FAIL  ${p.id}  ${p.from}: ${uErr.message}`);
      process.exit(1);
    }
    console.log(`OK    ${p.to}`);
  }
}

main();

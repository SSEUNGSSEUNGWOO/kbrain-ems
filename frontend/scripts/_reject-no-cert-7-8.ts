// ⑦, ⑧ 자격증 미보유자 자동 reject 처리.
//   status='rejected', rejected_stage='cert_required', note='자격연계형 자격증 미보유'
// _list-no-cert-7-8.ts 와 동일한 판단 로직.
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

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
  { id: '70a3fc72-0af0-473b-9745-0f39ecaeae9f', name: '⑦ 데이터분석 심화' },
  { id: '64fe381e-3bf7-48b5-ac79-d052854c87cc', name: '⑧ 바이브 코딩' }
];

const NO_CERT_RE = /^(없음|미보유|해당\s*없음|보유\s*[하않]|x|X|-+|n\/?a|N\/?A|\.{2,})\s*[.,!?]?\s*$/;

function isNoCert(answer: string | null | undefined): boolean {
  const v = (answer ?? '').trim();
  if (!v) return true;
  if (NO_CERT_RE.test(v)) return true;
  if (/^없음/.test(v.split(/[\s(]/)[0])) return true;
  if (/^자격증\s*없/.test(v)) return true;
  if (/^미보유/.test(v)) return true;
  return false;
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  let totalRejected = 0;
  for (const c of COHORTS) {
    console.log(`\n=== ${c.name} ===`);
    const { data: certQ } = await supabase
      .from('application_questions')
      .select('id')
      .eq('cohort_id', c.id)
      .eq('question_no', 'C-CERT')
      .is('track_id', null)
      .maybeSingle();
    if (!certQ) {
      console.log('  C-CERT 없음, 스킵');
      continue;
    }
    type Row = { id: string; status: string; applicants: { name: string } | null };
    const { data: apps } = await supabase
      .from('applications')
      .select('id, status, applicants(name)')
      .eq('cohort_id', c.id)
      .is('track_id', null)
      .returns<Row[]>();
    const appIds = (apps ?? []).map((a) => a.id);
    const { data: answers } = await supabase
      .from('application_answers')
      .select('application_id, answer_value')
      .in('application_id', appIds)
      .eq('question_id', (certQ as { id: string }).id);
    const answerMap = new Map<string, string>();
    for (const a of answers ?? []) {
      const aa = a as { application_id: string; answer_value: unknown };
      answerMap.set(aa.application_id, typeof aa.answer_value === 'string' ? aa.answer_value : '');
    }

    const targets = (apps ?? []).filter((a) => isNoCert(answerMap.get(a.id) ?? ''));
    console.log(`  reject 대상: ${targets.length}명`);
    for (const t of targets) {
      const { error } = await supabase
        .from('applications')
        .update({
          status: 'rejected',
          rejected_stage: 'cert_required',
          decided_at: today,
          note: '자격연계형 자격증 미보유'
        })
        .eq('id', t.id);
      if (error) {
        console.error(`    [실패] ${t.applicants?.name}: ${error.message}`);
        continue;
      }
      console.log(`    ✓ ${t.applicants?.name} → rejected (cert_required)`);
      totalRejected++;
    }
  }
  console.log(`\n총 reject 처리: ${totalRejected}건`);
}

main().catch((e) => { console.error(e); process.exit(1); });

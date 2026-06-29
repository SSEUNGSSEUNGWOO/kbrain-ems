// ⑦, ⑧ 자격증 미보유자 명단 — 자동 reject 대상 사전 검토용.
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

// "없음", "미보유", "X", "-", "N/A", "보유하지 않음" 등 명시적 미보유 패턴
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
  for (const c of COHORTS) {
    console.log('\n' + '='.repeat(80));
    console.log(`${c.name}`);
    console.log('='.repeat(80));

    // C-CERT 질문 id
    const { data: certQ } = await supabase
      .from('application_questions')
      .select('id')
      .eq('cohort_id', c.id)
      .eq('question_no', 'C-CERT')
      .is('track_id', null)
      .maybeSingle();
    if (!certQ) {
      console.log('  C-CERT 질문 없음 (자격연계형 아님)');
      continue;
    }

    // 해당 cohort의 applications + applicant + C-CERT 답변
    type Row = {
      id: string;
      status: string;
      applicants: { name: string; phone: string | null; email: string | null; organization_id: string | null } | null;
    };
    const { data: apps } = await supabase
      .from('applications')
      .select('id, status, applicants(name, phone, email, organization_id)')
      .eq('cohort_id', c.id)
      .is('track_id', null)
      .returns<Row[]>();

    if (!apps || apps.length === 0) {
      console.log('  applications 없음');
      continue;
    }

    // 각 application의 C-CERT 답변 조회
    const appIds = apps.map((a) => a.id);
    const { data: answers } = await supabase
      .from('application_answers')
      .select('application_id, answer_value')
      .in('application_id', appIds)
      .eq('question_id', (certQ as { id: string }).id);
    const answerMap = new Map<string, string>();
    for (const a of answers ?? []) {
      const aa = a as { application_id: string; answer_value: unknown };
      answerMap.set(aa.application_id, typeof aa.answer_value === 'string' ? aa.answer_value : JSON.stringify(aa.answer_value));
    }

    // 조직 이름 조회
    const orgIds = Array.from(
      new Set(apps.map((a) => a.applicants?.organization_id).filter((x): x is string => !!x))
    );
    const { data: orgs } = await supabase
      .from('organizations')
      .select('id, name')
      .in('id', orgIds);
    const orgMap = new Map<string, string>();
    for (const o of orgs ?? []) {
      orgMap.set((o as { id: string }).id, (o as { name: string }).name);
    }

    // 미보유자 분류
    type Item = { appId: string; name: string; org: string; answer: string; status: string };
    const noCertList: Item[] = [];
    const hasCertList: Item[] = [];
    for (const a of apps) {
      const ans = answerMap.get(a.id) ?? '';
      const org = a.applicants?.organization_id ? orgMap.get(a.applicants.organization_id) ?? '-' : '-';
      const item: Item = {
        appId: a.id,
        name: a.applicants?.name ?? '?',
        org,
        answer: ans,
        status: a.status
      };
      if (isNoCert(ans)) noCertList.push(item);
      else hasCertList.push(item);
    }

    console.log(`\n  총 ${apps.length}명: 자격증 보유 ${hasCertList.length} / 미보유 ${noCertList.length}`);
    console.log(`\n  ── 자동 reject 대상 (자격증 미보유) ${noCertList.length}명 ──`);
    for (const n of noCertList) {
      console.log(`    [${n.status}] ${n.name} | ${n.org} | "${n.answer}"`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

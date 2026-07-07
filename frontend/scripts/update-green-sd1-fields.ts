/**
 * 그린 자기주도형 1회차 신청 데이터 보정.
 * 파일 361명 전체:
 *  - applications.status = 'applied' (신청)
 *  - applications.motivation = 설문항목 23 (활용계획 서술형)
 *  - applications.self_diagnosis = { agree, category, department, office_phone, office_email,
 *      job_role, job_title, prior_courses, knowledge: {q9..q21}, multi_select }
 *  - applicants.department / job_role / job_title 도 채움
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(__dirname, '../.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const COHORT_ID = '77af39f8-2012-4c88-b213-6631ca942e33';

type Rec = {
  name: string;
  email: string;
  phone: string;
  organization: string | null;
  organization_category: string | null;
  login_id: string | null;
  survey: Record<string, string>;
};

// "설문항목 N( ... )" → N
function itemNo(key: string): number | null {
  const m = key.match(/설문항목\s*(\d+)/);
  return m ? Number(m[1]) : null;
}

function buildPayload(survey: Record<string, string>) {
  const g = (n: number) => {
    for (const [k, v] of Object.entries(survey)) if (itemNo(k) === n) return v;
    return null;
  };
  const knowledge: Record<string, string | null> = {};
  for (let n = 9; n <= 21; n++) knowledge[`q${n}`] = g(n);

  const motivation = g(23);
  const self_diagnosis = {
    agree: g(1),
    organization_category: g(2),
    department: g(3),
    office_phone: g(4),
    office_email: g(5),
    job_role: g(6),
    job_title: g(7),
    prior_courses: g(8),
    knowledge,
    multi_select: g(22)
  };
  return { motivation, self_diagnosis };
}

(async () => {
  const raw: Rec[] = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '_green-sd1-applicants.json'), 'utf8')
  );
  console.log(`파일: ${raw.length}건`);

  // 이 cohort의 email → application id 매핑
  const { data: apps } = await s
    .from('applications')
    .select('id, applicant_id, applicants(id, email)')
    .eq('cohort_id', COHORT_ID);
  const emailToApp = new Map<string, { appId: string; applicantId: string }>();
  for (const a of apps ?? []) {
    const em = (a as unknown as { applicants: { email: string; id: string } | null }).applicants;
    if (!em) continue;
    emailToApp.set(em.email.toLowerCase(), { appId: a.id, applicantId: em.id });
  }
  console.log(`DB 매칭 후보: ${emailToApp.size}건`);

  let updatedApp = 0;
  let updatedAppl = 0;
  let notFound = 0;
  for (const r of raw) {
    const match = emailToApp.get(r.email);
    if (!match) {
      notFound++;
      continue;
    }
    const { motivation, self_diagnosis } = buildPayload(r.survey);

    const { error: e1 } = await s
      .from('applications')
      .update({ status: 'applied', motivation, self_diagnosis })
      .eq('id', match.appId);
    if (e1) {
      console.log(`  ✗ app ${r.email}: ${e1.message}`);
      continue;
    }
    updatedApp++;

    const { error: e2 } = await s
      .from('applicants')
      .update({
        department: self_diagnosis.department,
        job_role: self_diagnosis.job_role,
        job_title: self_diagnosis.job_title
      })
      .eq('id', match.applicantId);
    if (!e2) updatedAppl++;
  }
  console.log(`\napplications 갱신: ${updatedApp}`);
  console.log(`applicants 갱신: ${updatedAppl}`);
  console.log(`매칭 실패: ${notFound}`);

  const { data: check } = await s
    .from('applications')
    .select('status')
    .eq('cohort_id', COHORT_ID);
  const cnt: Record<string, number> = {};
  for (const c of check ?? []) cnt[c.status] = (cnt[c.status] ?? 0) + 1;
  console.log('status counts:', cnt);
})();

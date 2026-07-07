/**
 * 그린 자기주도형 1회차 미등록자 삽입 (지금까지 실패한 부분 이어서).
 * cohort 77af39f8 · 파일 361건 · 이미 등록 203건 → 미등록만 신규 삽입.
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

async function findOrCreateApplicant(rec: Rec): Promise<string> {
  // 이메일 기준으로 기존 applicant 찾기
  const { data: found } = await s
    .from('applicants')
    .select('id')
    .eq('email', rec.email)
    .maybeSingle();
  if (found) return found.id;

  const { data: created, error } = await s
    .from('applicants')
    .insert({
      name: rec.name,
      email: rec.email,
      phone: rec.phone,
      notes: rec.organization ? `소속기관: ${rec.organization}` : null
    })
    .select('id')
    .single();
  if (error || !created) throw new Error(`applicant insert (${rec.name}): ${error?.message}`);
  return created.id;
}

(async () => {
  const raw: Rec[] = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '_green-sd1-applicants.json'), 'utf8')
  );
  console.log(`파일 전체: ${raw.length}건`);

  // 이 cohort에 이미 등록된 이메일 조회
  const existingEmails = new Set<string>();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data } = await s
      .from('applications')
      .select('applicants(email)')
      .eq('cohort_id', COHORT_ID)
      .range(from, from + pageSize - 1);
    if (!data || data.length === 0) break;
    for (const row of data) {
      const em = (row as unknown as { applicants: { email: string } | null }).applicants?.email;
      if (em) existingEmails.add(em.toLowerCase());
    }
    if (data.length < pageSize) break;
  }
  console.log(`기존 등록: ${existingEmails.size}건`);

  const toImport = raw.filter((r) => !existingEmails.has(r.email));
  console.log(`신규 삽입 대상: ${toImport.length}건\n`);

  let ok = 0;
  let fail = 0;
  for (const [i, rec] of toImport.entries()) {
    try {
      const applicantId = await findOrCreateApplicant(rec);
      const { error } = await s.from('applications').insert({
        cohort_id: COHORT_ID,
        applicant_id: applicantId,
        status: 'pending',
        applied_at: new Date().toISOString(),
        self_diagnosis: rec.survey
      });
      if (error) throw new Error(error.message);
      ok++;
      if ((i + 1) % 20 === 0) console.log(`  진행 ${i + 1}/${toImport.length}`);
    } catch (e) {
      fail++;
      console.log(`  ✗ ${rec.name} (${rec.email}): ${(e as Error).message}`);
    }
  }
  console.log(`\n완료: 성공 ${ok} · 실패 ${fail}`);
  const { count: after } = await s
    .from('applications')
    .select('*', { count: 'exact', head: true })
    .eq('cohort_id', COHORT_ID);
  console.log(`cohort 최종 applications: ${after}`);
})();

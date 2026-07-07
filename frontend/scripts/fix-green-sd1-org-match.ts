/**
 * 그린 자기주도형 1회차 118명 organization_id 매칭.
 * 1) 미매칭 14개 org 신규 생성 (category 포함)
 * 2) 파일 기준 118명 applicant → organization_id 세팅
 * 3) notes 필드에서 임시로 박아둔 "소속기관: xxx" 문자열 제거
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

type Rec = {
  name: string;
  email: string;
  phone: string;
  organization: string | null;
  organization_category: string | null;
};

(async () => {
  const raw: Rec[] = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '_green-sd1-applicants.json'), 'utf8')
  );

  // 1. 기존 organizations 로드
  const { data: allOrgs } = await s.from('organizations').select('id, name, category');
  const byName = new Map<string, { id: string; category: string | null }>();
  for (const o of allOrgs ?? []) byName.set(o.name, { id: o.id, category: o.category });

  // 2. 파일 unique org + category (첫 등장 category 사용)
  const uniqOrgs = new Map<string, string | null>();
  for (const r of raw) {
    if (!r.organization) continue;
    if (!uniqOrgs.has(r.organization)) uniqOrgs.set(r.organization, r.organization_category);
  }
  const missing = [...uniqOrgs.entries()].filter(([n]) => !byName.has(n));
  console.log(`신규 생성 대상: ${missing.length}개`);
  for (const [name, cat] of missing) {
    const { data, error } = await s
      .from('organizations')
      .insert({ name, category: cat })
      .select('id, name, category')
      .single();
    if (error || !data) {
      console.log(`  ✗ ${name}: ${error?.message}`);
      continue;
    }
    byName.set(data.name, { id: data.id, category: data.category });
    console.log(`  ✓ ${name} (${cat ?? '분류없음'})`);
  }

  // 3. 이 cohort의 organization_id 미세팅 applicants 조회
  const { data: apps } = await s
    .from('applications')
    .select('applicants(id, email, organization_id, notes)')
    .eq('cohort_id', '77af39f8-2012-4c88-b213-6631ca942e33');
  const emailToOrgFromFile = new Map<string, string>();
  for (const r of raw) if (r.organization) emailToOrgFromFile.set(r.email, r.organization);

  let updated = 0;
  let skipped = 0;
  let noMatch = 0;
  for (const row of apps ?? []) {
    const a = (row as unknown as { applicants: { id: string; email: string; organization_id: string | null; notes: string | null } | null }).applicants;
    if (!a) continue;
    if (a.organization_id) {
      skipped++;
      continue;
    }
    const orgName = emailToOrgFromFile.get(a.email.toLowerCase());
    if (!orgName) {
      noMatch++;
      continue;
    }
    const org = byName.get(orgName);
    if (!org) {
      noMatch++;
      continue;
    }
    // notes에서 "소속기관: xxx" 임시 문자열 제거
    const cleanedNotes = a.notes?.startsWith('소속기관: ') ? null : a.notes;
    const { error } = await s
      .from('applicants')
      .update({ organization_id: org.id, notes: cleanedNotes })
      .eq('id', a.id);
    if (error) {
      console.log(`  ✗ ${a.email}: ${error.message}`);
      continue;
    }
    updated++;
  }
  console.log(`\n업데이트: ${updated} · 이미매칭: ${skipped} · 매칭실패: ${noMatch}`);
})();

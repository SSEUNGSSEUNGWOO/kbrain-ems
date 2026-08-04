/**
 * 특화 그린 종합과정 학생 명단 import.
 * 파일: 행정안전부 직원 대상 AI 챔피언 그린 종합과정 신청자 명단(67명).xlsx
 * 헤더 R4: 연번 | 소속 | 직위/직급 | 성명 | 전화번호 | 이메일  (데이터 R5~)
 * 매핑:
 *   organization = 소속의 첫 공백 앞 (예: '국가정보자원관리원')
 *   department   = 소속의 첫 공백 뒤 (예: '광주센터 정보시스템2과')
 *   category     = '중앙부처'
 */
import ExcelJS from 'exceljs';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(__dirname, '../.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const FILE = 'C:/Users/USER/Downloads/행안부 직원 대상 AI 챔피언 그린 종합과정 신청자 명단(67명).xlsx';
const COHORT_NAME = 'AI 챔피언 그린(중급) 종합과정 (특화)';

const text = (v: ExcelJS.CellValue): string => {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'object' && 'text' in (v as object)) return String((v as { text: unknown }).text).trim();
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object' && 'result' in (v as object)) return String((v as { result: unknown }).result).trim();
  if (typeof v === 'object' && 'richText' in (v as object)) return (v as { richText: { text: string }[] }).richText.map((r) => r.text).join('');
  return String(v).trim();
};

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return raw.trim();
}

function splitOrg(fullOrg: string): { org: string; dept: string } {
  const idx = fullOrg.indexOf(' ');
  if (idx < 0) return { org: fullOrg, dept: '' };
  return { org: fullOrg.slice(0, idx).trim(), dept: fullOrg.slice(idx + 1).trim() };
}

async function getOrCreateOrg(name: string): Promise<string> {
  const { data: existing } = await s.from('organizations').select('id').eq('name', name).maybeSingle();
  if (existing) return existing.id;
  const { data: created, error } = await s
    .from('organizations')
    .insert({ name, category: 'central' }) // 행안부는 중앙부처 계열
    .select('id')
    .single();
  if (error || !created) throw new Error(`org insert 실패: ${name} - ${error?.message}`);
  return created.id;
}

async function main() {
  const { data: cohort } = await s.from('cohorts').select('id').eq('name', COHORT_NAME).maybeSingle();
  if (!cohort) throw new Error(`cohort 없음: ${COHORT_NAME}`);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);
  const sh = wb.worksheets[0];

  let created = 0, skipped = 0, errors = 0;
  for (let r = 5; r <= sh.rowCount; r++) {
    const row = sh.getRow(r);
    const name = text(row.getCell(4).value);
    if (!name) continue;

    const orgFull = text(row.getCell(2).value);
    const jobTitle = text(row.getCell(3).value);
    const phoneRaw = text(row.getCell(5).value);
    const email = text(row.getCell(6).value);
    const phone = phoneRaw ? normalizePhone(phoneRaw) : '';

    // 중복 방지 (name + phone)
    const { data: existing } = await s
      .from('students')
      .select('id')
      .eq('cohort_id', cohort.id)
      .eq('name', name)
      .eq('phone', phone)
      .maybeSingle();
    if (existing) {
      console.log(`  · SKIP ${name} (${phone})`);
      skipped++;
      continue;
    }

    try {
      const { org, dept } = splitOrg(orgFull);
      const orgId = org ? await getOrCreateOrg(org) : null;

      // applicant 생성
      const { data: app, error: aErr } = await s
        .from('applicants')
        .insert({
          name,
          phone: phone || null,
          email: email || null,
          organization_id: orgId,
          department: dept || null,
          job_title: jobTitle || null,
          category: '중앙부처'
        })
        .select('id')
        .single();
      if (aErr || !app) throw new Error(`applicant: ${aErr?.message}`);

      // student 생성
      const { error: sErr } = await s.from('students').insert({
        cohort_id: cohort.id,
        applicant_id: app.id,
        name,
        phone: phone || null,
        email: email || null,
        organization_id: orgId,
        department: dept || null,
        job_title: jobTitle || null
      });
      if (sErr) throw new Error(`student: ${sErr.message}`);

      console.log(`  ✓ ${name} · ${org}${dept ? ' > ' + dept : ''} · ${jobTitle} · ${phone}`);
      created++;
    } catch (e) {
      console.log(`  ✗ ERR ${name}: ${e instanceof Error ? e.message : e}`);
      errors++;
    }
  }

  console.log(`\n완료: 신규 ${created}, 스킵 ${skipped}, 실패 ${errors}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

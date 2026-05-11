/**
 * 일회용 — 시드 1기·2기 cohort 삭제 + Excel 진짜 명단으로 다시 채움.
 *
 * 실행:
 *   PowerShell에서 .env.local 환경변수 로드 후:
 *   bun run scripts/seed-real-cohorts.ts
 */

import ExcelJS from 'exceljs';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/lib/supabase/types';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('환경변수 누락: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

type StudentRow = {
  no: number;
  name: string;
  bucheo: string | null; // 부처(구분)
  org: string | null;    // 소속(기관)
  jobTitle: string | null;
  phone: string | null;
  email: string | null;
  gmail: string | null;
};

const cellText = (v: ExcelJS.CellValue): string => {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object' && 'text' in (v as object)) {
    return String((v as { text: unknown }).text).trim();
  }
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object' && 'result' in (v as object)) {
    return String((v as { result: unknown }).result).trim();
  }
  return String(v).trim();
};

function normalizePhone(s: string): string {
  const digits = s.replace(/\D/g, '');
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  return s;
}

async function readSheet(path: string, sheetName: string): Promise<StudentRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const sheet = wb.getWorksheet(sheetName);
  if (!sheet) throw new Error(`Sheet not found: ${sheetName}`);

  const rows: StudentRow[] = [];
  // R5부터 데이터 (R4=헤더). 빈 row 만나도 다음 row 가능성 있으니 100 row까지 검사.
  for (let r = 5; r <= 100; r++) {
    const row = sheet.getRow(r);
    const no = parseInt(cellText(row.getCell(2).value), 10);
    const name = cellText(row.getCell(3).value);
    if (!name || isNaN(no)) continue; // 빈 row 건너뛰기

    rows.push({
      no,
      name,
      bucheo: cellText(row.getCell(4).value) || null,
      org: cellText(row.getCell(5).value) || null,
      jobTitle: cellText(row.getCell(6).value) || null,
      phone: cellText(row.getCell(7).value) || null,
      email: cellText(row.getCell(8).value) || null,
      gmail: cellText(row.getCell(9).value) || null
    });
  }
  return rows;
}

async function deleteSeedCohort(name: string): Promise<void> {
  const { data: cohort } = await sb.from('cohorts').select('id').eq('name', name).maybeSingle();
  if (!cohort) {
    console.log(`  ${name} — 이미 없음, 스킵`);
    return;
  }

  // 1. students 삭제 (cascade: attendance_records, assignment_submissions, survey_responses, diagnosis_responses)
  await sb.from('students').delete().eq('cohort_id', cohort.id);
  // 2. applications 삭제 (cascade: evaluations)
  await sb.from('applications').delete().eq('cohort_id', cohort.id);
  // 3. cohort 삭제 (cascade: sessions, surveys, assignments, tracks, evaluators, cohort_reports, diagnoses)
  const { error } = await sb.from('cohorts').delete().eq('id', cohort.id);
  if (error) throw new Error(`cohort 삭제 실패 (${name}): ${error.message}`);
  console.log(`  ${name} 삭제됨 (id=${cohort.id})`);
}

async function createCohort(name: string, startedAt: string, endedAt: string): Promise<string> {
  const { data, error } = await sb
    .from('cohorts')
    .insert({ name, started_at: startedAt, ended_at: endedAt })
    .select('id')
    .single();
  if (error || !data) throw new Error(`cohort 생성 실패 (${name}): ${error?.message}`);
  console.log(`  ${name} 생성됨 (id=${data.id})`);
  return data.id;
}

async function getOrCreateOrg(name: string): Promise<string | null> {
  if (!name) return null;
  const { data: existing } = await sb.from('organizations').select('id').eq('name', name).maybeSingle();
  if (existing) return existing.id;
  const { data, error } = await sb.from('organizations').insert({ name }).select('id').single();
  if (error || !data) {
    console.warn(`  org 생성 실패 ${name}: ${error?.message}`);
    return null;
  }
  return data.id;
}

async function importStudents(cohortId: string, rows: StudentRow[], cohortLabel: string): Promise<void> {
  let ok = 0;
  let fail = 0;
  for (const r of rows) {
    try {
      const orgId = r.org ? await getOrCreateOrg(r.org) : null;
      const email = r.email || r.gmail || null;
      const phone = r.phone ? normalizePhone(r.phone) : null;

      // applicants — 같은 이메일/전화 있으면 재사용
      let applicantId: string | undefined;
      if (email) {
        const { data: byEmail } = await sb.from('applicants').select('id').eq('email', email).maybeSingle();
        if (byEmail) applicantId = byEmail.id;
      }
      if (!applicantId && phone) {
        const { data: byPhone } = await sb.from('applicants').select('id').eq('phone', phone).maybeSingle();
        if (byPhone) applicantId = byPhone.id;
      }
      if (!applicantId) {
        const { data: created, error: aErr } = await sb
          .from('applicants')
          .insert({
            name: r.name,
            email,
            phone,
            organization_id: orgId,
            job_title: r.jobTitle,
            department: r.bucheo // "부처" 컬럼이 department 자리에 들어감 (구분)
          })
          .select('id')
          .single();
        if (aErr || !created) throw new Error(`applicant 생성 실패: ${aErr?.message}`);
        applicantId = created.id;
      }

      // applications (selected) — 이미 있으면 스킵
      const { data: existingApp } = await sb
        .from('applications')
        .select('id')
        .eq('applicant_id', applicantId)
        .eq('cohort_id', cohortId)
        .maybeSingle();
      if (!existingApp) {
        const { error: appErr } = await sb.from('applications').insert({
          applicant_id: applicantId,
          cohort_id: cohortId,
          status: 'selected',
          decided_at: '2026-05-07'
        });
        if (appErr) throw new Error(`application 생성 실패: ${appErr.message}`);
      }

      // students — id에 applicantId 사용
      const { error: stuErr } = await sb.from('students').insert({
        id: applicantId,
        cohort_id: cohortId,
        organization_id: orgId,
        name: r.name,
        email,
        phone,
        job_title: r.jobTitle,
        department: r.bucheo
      });
      if (stuErr && !stuErr.message.toLowerCase().includes('duplicate')) {
        throw new Error(`student 생성 실패: ${stuErr.message}`);
      }

      ok++;
    } catch (e) {
      fail++;
      console.warn(`  ✗ [${r.no}] ${r.name}: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`  ${cohortLabel}: 성공 ${ok}건 / 실패 ${fail}건`);
}

(async () => {
  console.log('▶ Excel 읽는 중...');
  const rows1 = await readSheet('C:/Users/USER/Downloads/★ 1기 운영시트.xlsx', '명단(1기)_운영진용');
  const rows2 = await readSheet('C:/Users/USER/Downloads/★ 2기 운영시트.xlsx', '명단(2기)_운영진용');
  console.log(`  1기: ${rows1.length}명 / 2기: ${rows2.length}명`);

  console.log('\n▶ 시드 cohort 삭제 중...');
  await deleteSeedCohort('전문인재 26-1기');
  await deleteSeedCohort('전문인재 26-2기');

  console.log('\n▶ 새 cohort 생성 중...');
  const cohort1Id = await createCohort('AI 챔피언 26-1기', '2026-05-07', '2026-10-22');
  const cohort2Id = await createCohort('AI 챔피언 26-2기', '2026-05-07', '2026-10-23');

  console.log('\n▶ 1기 명단 INSERT 중...');
  await importStudents(cohort1Id, rows1, 'AI 챔피언 26-1기');

  console.log('\n▶ 2기 명단 INSERT 중...');
  await importStudents(cohort2Id, rows2, 'AI 챔피언 26-2기');

  console.log('\n✓ 완료');
})();

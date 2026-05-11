/**
 * "★전문인재 서면심사 리스트.xlsx > 전체 리스트" 시트에서
 * 학생들의 생년월일·부서명·직책·직렬·담당업무를 가져와 db update.
 *
 * 매칭 키: 이름.
 * 우리 db 학생 48명(1기 24 + 2기 24) 대상.
 */

import ExcelJS from 'exceljs';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/lib/supabase/types';

const FILE = 'C:/Users/USER/Downloads/★전문인재 서면심사 리스트.xlsx';
const SHEET = '전체 리스트';

const sb = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const text = (v: ExcelJS.CellValue): string => {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object' && 'text' in (v as object)) return String((v as { text: unknown }).text).trim();
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object' && 'result' in (v as object)) return String((v as { result: unknown }).result).trim();
  return String(v).trim();
};

/** "1979.03.09" / "1979-03-09" / "1979/3/9" → "1979-03-09" 또는 null */
function parseBirthDate(raw: string): string | null {
  if (!raw) return null;
  const m = raw.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

type Enrich = {
  birthDate: string | null;
  department: string | null;
  jobTitle: string | null;
  jobRole: string | null;
  notes: string | null;
};

async function readEnrichments(): Promise<Map<string, Enrich>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);
  const sh = wb.getWorksheet(SHEET);
  if (!sh) throw new Error(`sheet not found: ${SHEET}`);

  // R2 헤더, R3부터 데이터
  const map = new Map<string, Enrich>();
  for (let r = 3; r <= 100; r++) {
    const row = sh.getRow(r);
    const name = text(row.getCell(3).value); // [3] 성명
    if (!name) continue;

    const department = text(row.getCell(7).value) || null; // [7] 부서명
    const jobTitle = text(row.getCell(8).value) || null;   // [8] (현)직책
    const duty = text(row.getCell(9).value) || null;       // [9] 담당업무
    const jobRole = text(row.getCell(10).value) || null;   // [10] 직렬
    const birthRaw = text(row.getCell(11).value);          // [11] 생년월일
    const birthDate = parseBirthDate(birthRaw);

    map.set(name, {
      birthDate,
      department,
      jobTitle,
      jobRole,
      notes: duty // 담당업무를 notes에
    });
  }
  return map;
}

async function enrichCohort(cohortName: string, enrichments: Map<string, Enrich>) {
  const { data: cohort } = await sb.from('cohorts').select('id').eq('name', cohortName).maybeSingle();
  if (!cohort) {
    console.log(`  ${cohortName} — cohort 없음`);
    return;
  }

  const { data: students } = await sb
    .from('students')
    .select('id, name')
    .eq('cohort_id', cohort.id);

  let updated = 0;
  let missing = 0;
  for (const s of students ?? []) {
    const e = enrichments.get(s.name);
    if (!e) {
      missing++;
      console.log(`  ⊘ ${s.name}: Excel '전체 리스트'에서 매칭 안 됨`);
      continue;
    }

    const patch = {
      birth_date: e.birthDate,
      department: e.department,
      job_title: e.jobTitle,
      job_role: e.jobRole,
      notes: e.notes
    };

    const { error: stuErr } = await sb.from('students').update(patch).eq('id', s.id);
    const { error: appErr } = await sb.from('applicants').update(patch).eq('id', s.id);
    if (stuErr || appErr) {
      console.warn(`  ✗ ${s.name}: ${(stuErr || appErr)?.message}`);
      continue;
    }
    updated++;
  }
  console.log(`  ${cohortName}: 보강 ${updated}명 / 매칭 안 됨 ${missing}명`);
}

(async () => {
  console.log('▶ Excel "전체 리스트" 시트 읽는 중...');
  const enrich = await readEnrichments();
  console.log(`  매핑 ${enrich.size}건`);

  console.log('\n▶ 1기 보강...');
  await enrichCohort('AI 챔피언 26-1기', enrich);

  console.log('\n▶ 2기 보강...');
  await enrichCohort('AI 챔피언 26-2기', enrich);

  console.log('\n✓ 완료');
})();

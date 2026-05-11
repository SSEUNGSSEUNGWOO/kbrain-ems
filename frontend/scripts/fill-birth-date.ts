/**
 * 1기·2기 학생들의 생년월일만 채움.
 * "전체 리스트" sheet 전체 row(R3~R250) 검사 + 이름 매칭.
 * 다른 컬럼은 손대지 않음.
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
  if (typeof v === 'object' && 'text' in (v as object)) return String((v as { text: unknown }).text).trim();
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object' && 'result' in (v as object)) return String((v as { result: unknown }).result).trim();
  return String(v).trim();
};

function parseBirthDate(raw: string): string | null {
  if (!raw) return null;
  const m = raw.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

async function readBirthMap(): Promise<Map<string, string>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);
  const sh = wb.getWorksheet(SHEET)!;
  const map = new Map<string, string>();
  for (let r = 3; r <= 250; r++) {
    const name = text(sh.getRow(r).getCell(3).value);
    if (!name) continue;
    const birth = parseBirthDate(text(sh.getRow(r).getCell(11).value));
    if (birth) map.set(name, birth);
  }
  return map;
}

async function fillForCohort(cohortName: string, birthMap: Map<string, string>) {
  const { data: cohort } = await sb.from('cohorts').select('id').eq('name', cohortName).maybeSingle();
  if (!cohort) return;
  const { data: students } = await sb
    .from('students')
    .select('id, name, birth_date')
    .eq('cohort_id', cohort.id);

  let updated = 0, missing = 0;
  for (const s of students ?? []) {
    const birth = birthMap.get(s.name);
    if (!birth) {
      missing++;
      console.log(`  ⊘ ${s.name}: 매칭 안 됨`);
      continue;
    }
    const { error: e1 } = await sb.from('students').update({ birth_date: birth }).eq('id', s.id);
    const { error: e2 } = await sb.from('applicants').update({ birth_date: birth }).eq('id', s.id);
    if (e1 || e2) {
      console.warn(`  ✗ ${s.name}: ${(e1 || e2)?.message}`);
      continue;
    }
    updated++;
  }
  console.log(`  ${cohortName}: 생년월일 ${updated}건 채움 / 매칭 안 됨 ${missing}건`);
}

(async () => {
  console.log('▶ "전체 리스트" 이름→생년월일 매핑...');
  const map = await readBirthMap();
  console.log(`  매핑 ${map.size}명`);

  console.log('\n▶ 1기...');
  await fillForCohort('AI 챔피언 26-1기', map);

  console.log('\n▶ 2기...');
  await fillForCohort('AI 챔피언 26-2기', map);

  console.log('\n✓ 완료');
})();

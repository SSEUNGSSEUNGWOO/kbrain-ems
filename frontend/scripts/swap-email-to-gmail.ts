/**
 * 1기·2기 학생들의 email을 회사 이메일 → 개인 gmail로 교체.
 *
 * 매칭 키: 이름.
 * gmail 컬럼이 빈 경우는 그대로 둠 (안전).
 *
 * 실행:
 *   bun run scripts/swap-email-to-gmail.ts
 */

import ExcelJS from 'exceljs';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/lib/supabase/types';

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

async function readNameGmail(path: string, sheetName: string): Promise<Map<string, string>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const sh = wb.getWorksheet(sheetName);
  if (!sh) throw new Error(`sheet not found: ${sheetName}`);

  const map = new Map<string, string>();
  for (let r = 5; r <= 100; r++) {
    const row = sh.getRow(r);
    const name = text(row.getCell(3).value);
    const gmail = text(row.getCell(9).value);
    if (name && gmail) map.set(name, gmail);
  }
  return map;
}

async function swapForCohort(cohortName: string, nameToGmail: Map<string, string>): Promise<void> {
  const { data: cohort } = await sb.from('cohorts').select('id').eq('name', cohortName).maybeSingle();
  if (!cohort) {
    console.log(`  ${cohortName} — cohort 없음, 스킵`);
    return;
  }

  const { data: students } = await sb
    .from('students')
    .select('id, name, email')
    .eq('cohort_id', cohort.id);

  let ok = 0;
  let skip = 0;
  for (const s of students ?? []) {
    const gmail = nameToGmail.get(s.name);
    if (!gmail) {
      skip++;
      console.log(`  ⊘ ${s.name}: Excel에서 gmail 매칭 안 됨`);
      continue;
    }
    // students + applicants 둘 다 update (같은 id)
    const { error: stuErr } = await sb.from('students').update({ email: gmail }).eq('id', s.id);
    const { error: appErr } = await sb.from('applicants').update({ email: gmail }).eq('id', s.id);
    if (stuErr || appErr) {
      console.warn(`  ✗ ${s.name}: ${(stuErr || appErr)?.message}`);
      continue;
    }
    ok++;
  }
  console.log(`  ${cohortName}: 교체 ${ok}건 / 스킵 ${skip}건`);
}

(async () => {
  console.log('▶ Excel에서 이름·gmail 매핑...');
  const map1 = await readNameGmail('C:/Users/USER/Downloads/★ 1기 운영시트.xlsx', '명단(1기)_운영진용');
  const map2 = await readNameGmail('C:/Users/USER/Downloads/★ 2기 운영시트.xlsx', '명단(2기)_운영진용');
  console.log(`  1기 매핑: ${map1.size}명 / 2기 매핑: ${map2.size}명`);

  console.log('\n▶ 1기 email 교체...');
  await swapForCohort('AI 챔피언 26-1기', map1);

  console.log('\n▶ 2기 email 교체...');
  await swapForCohort('AI 챔피언 26-2기', map2);

  console.log('\n✓ 완료');
})();

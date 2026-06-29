/**
 * 엑셀 선발 명단 vs DB 선발자(status='selected') 명단 비교.
 * blue5 더미 학생(applicant 200명)은 비교에서 제외.
 *
 * 시트별로 cohort 매칭 후 (이름) 기준으로 차이 출력.
 */
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(__dirname, '../.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}

const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const FILE = path.join(
  'C:',
  'Users',
  'USER',
  'Downloads',
  '1. 2026년 AI챔피언 및 공공 AI역량 트랙 교육 (6월2차) 선발 명단.xlsx'
);

// 시트명 → DB cohort name
const SHEET_TO_COHORT: Record<string, string> = {
  'AI챔피언 그린 종합과정 1회차(6.16.~6.29.)': 'AI 챔피언 그린 1회차',
  'AI챔피언 블루 종합과정 2회차(6.23.~7.6.)': 'AI 챔피언 블루 2회차',
  '공공 AI역량 트랙 - ①AI리터러시와~(6.15)': 'AI 리터러시와 업무활용',
  '공공 AI역량 트랙 - ④생성형 AI 활용~(6.16)': '생성형 AI 활용 노코드 데이터분석',
  '공공 AI역량 트랙 - ②데이터 리터러시(6.17)': '데이터 리터러시',
  '공공 AI역량 트랙 - ⑤AI 행정~(6.29~6.30)': 'AI 행정 융합 기획'
};

// ---------- 더미 applicant 식별 (블루 5회차 시드 200명) ----------
const BLUE5_ID = 'f046ddf8-c458-4bf4-a71d-3230bc798e8a';
const { data: blue5 } = await s
  .from('applications')
  .select('applicant_id')
  .eq('cohort_id', BLUE5_ID);
const dummyApplicantIds = new Set((blue5 ?? []).map((a) => a.applicant_id));
console.log(`더미 식별: blue5 시드 ${dummyApplicantIds.size}명 (비교에서 제외)\n`);

// ---------- 엑셀 로드 ----------
const wb = XLSX.readFile(FILE);

type ExcelRow = { name: string; category: string; org: string };

function readSheet(sheetName: string): ExcelRow[] {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
  // row0 = 타이틀, row1 = 컬럼명, row2+ = 데이터
  const out: ExcelRow[] = [];
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i] as unknown[];
    const name = String(r[1] ?? '').trim();
    if (!name) continue;
    out.push({
      name,
      category: String(r[2] ?? '').trim(),
      org: String(r[3] ?? '').trim()
    });
  }
  return out;
}

// ---------- 시트별 비교 ----------
for (const sheetName of wb.SheetNames) {
  const cohortName = SHEET_TO_COHORT[sheetName];
  if (!cohortName) {
    console.log(`⚠ 시트 매칭 안 됨: ${sheetName}`);
    continue;
  }

  const excelRows = readSheet(sheetName);

  // DB에서 cohort 의 selected applicants 조회 (더미 제외)
  const { data: cohort } = await s
    .from('cohorts')
    .select('id')
    .eq('name', cohortName)
    .maybeSingle();
  if (!cohort) {
    console.log(`❌ cohort not found: ${cohortName}`);
    continue;
  }
  type AppRow = {
    applicant_id: string;
    applicants: { name: string; organizations: { name: string } | null } | null;
  };
  const { data: dbApps } = await s
    .from('applications')
    .select('applicant_id, applicants(name, organizations(name))')
    .eq('cohort_id', cohort.id)
    .eq('status', 'selected')
    .returns<AppRow[]>();

  const dbNames = new Map<string, { count: number; orgs: string[] }>();
  let dummyExcluded = 0;
  for (const a of dbApps ?? []) {
    if (dummyApplicantIds.has(a.applicant_id)) {
      dummyExcluded++;
      continue;
    }
    const name = a.applicants?.name?.trim() ?? '';
    if (!name) continue;
    const orgName = a.applicants?.organizations?.name ?? '';
    const cur = dbNames.get(name) ?? { count: 0, orgs: [] };
    cur.count++;
    cur.orgs.push(orgName);
    dbNames.set(name, cur);
  }

  const excelNames = new Map<string, ExcelRow>();
  for (const e of excelRows) excelNames.set(e.name, e);

  const onlyInExcel = excelRows.filter((e) => !dbNames.has(e.name));
  const onlyInDb: { name: string; org: string }[] = [];
  for (const [name, info] of dbNames) {
    if (!excelNames.has(name)) {
      for (const o of info.orgs) onlyInDb.push({ name, org: o });
    }
  }

  console.log(`\n=== ${cohortName} ===`);
  console.log(`엑셀 ${excelRows.length}명 / DB selected ${dbApps?.length ?? 0}명 (더미 ${dummyExcluded}명 제외 → ${(dbApps?.length ?? 0) - dummyExcluded}명)`);
  console.log(`매칭: ${excelRows.length - onlyInExcel.length}명`);
  if (onlyInExcel.length > 0) {
    console.log(`📝 엑셀에만 있음 (${onlyInExcel.length}명):`);
    for (const e of onlyInExcel) console.log(`  - ${e.name} (${e.category}) ${e.org.slice(0, 50)}`);
  }
  if (onlyInDb.length > 0) {
    console.log(`💾 DB에만 있음 (${onlyInDb.length}명):`);
    for (const d of onlyInDb) console.log(`  - ${d.name} :: ${d.org.slice(0, 50)}`);
  }
  if (onlyInExcel.length === 0 && onlyInDb.length === 0) {
    console.log('✓ 완전 일치');
  }
}

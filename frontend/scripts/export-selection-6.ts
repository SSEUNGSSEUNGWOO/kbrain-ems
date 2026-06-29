/**
 * 6월 2차 선발 6개 과정 합본 엑셀 — 시트별 (이름, 부처, 소속기관, 전화번호).
 * blue5 더미 학생은 제외.
 *
 * 출력: C:\Users\USER\Downloads\2026년_6월2차_선발명단_연락처포함.xlsx
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

// (DB cohort name, 시트명) 6개
const COHORTS: { name: string; sheet: string }[] = [
  { name: 'AI 챔피언 그린 1회차', sheet: 'AI챔피언 그린 1회차' },
  { name: 'AI 챔피언 블루 2회차', sheet: 'AI챔피언 블루 2회차' },
  { name: 'AI 리터러시와 업무활용', sheet: 'AI 리터러시와 업무활용' },
  { name: '생성형 AI 활용 노코드 데이터분석', sheet: '생성형 AI 노코드 분석' },
  { name: '데이터 리터러시', sheet: '데이터 리터러시' },
  { name: 'AI 행정 융합 기획', sheet: 'AI 행정 융합 기획' }
];

// 더미 식별 (블루 5회차 시드 200명)
const BLUE5_ID = 'f046ddf8-c458-4bf4-a71d-3230bc798e8a';
const { data: blue5 } = await s
  .from('applications')
  .select('applicant_id')
  .eq('cohort_id', BLUE5_ID);
const dummy = new Set((blue5 ?? []).map((a) => a.applicant_id));
console.log(`더미 ${dummy.size}명 제외`);

const wb = XLSX.utils.book_new();

for (const c of COHORTS) {
  const { data: cohort } = await s
    .from('cohorts')
    .select('id')
    .eq('name', c.name)
    .maybeSingle();
  if (!cohort) {
    console.log(`❌ cohort 없음: ${c.name}`);
    continue;
  }

  type AppRow = {
    applicant_id: string;
    applicants: {
      name: string;
      phone: string | null;
      category: string | null;
      organizations: { name: string } | null;
    } | null;
  };
  const { data: apps } = await s
    .from('applications')
    .select('applicant_id, applicants(name, phone, category, organizations(name))')
    .eq('cohort_id', cohort.id)
    .eq('status', 'selected')
    .returns<AppRow[]>();

  const rows = (apps ?? [])
    .filter((a) => !dummy.has(a.applicant_id))
    .map((a) => ({
      이름: a.applicants?.name ?? '',
      부처: a.applicants?.category ?? '',
      소속기관: a.applicants?.organizations?.name ?? '',
      전화번호: a.applicants?.phone ?? ''
    }))
    .sort((x, y) => x.이름.localeCompare(y.이름, 'ko'));

  // 연번 추가
  const withSeq = rows.map((r, i) => ({ 연번: i + 1, ...r }));

  const ws = XLSX.utils.json_to_sheet(withSeq, {
    header: ['연번', '이름', '부처', '소속기관', '전화번호']
  });
  // 컬럼 너비 (대략적)
  ws['!cols'] = [{ wch: 6 }, { wch: 10 }, { wch: 14 }, { wch: 50 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws, c.sheet);
  console.log(`  ${c.sheet}: ${withSeq.length}명`);
}

const outPath = path.join(
  'C:',
  'Users',
  'USER',
  'Downloads',
  '2026년_6월2차_선발명단_연락처포함.xlsx'
);
XLSX.writeFile(wb, outPath);
console.log(`\n저장: ${outPath}`);

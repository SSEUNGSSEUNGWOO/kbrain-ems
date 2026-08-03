// AI챔피언 수료자 명단 → 기수별 시트로 나눈 엑셀 1개 생성.
//
// 수료 조건(src/lib/completion.ts computeChampionCompletion 과 동일):
//   OT 참석 + 집중교육 3일 이상 참석 + 인증평가 참여
//
// 기존 /api/cohorts/[id]/completion/export 는 category='general' 만 지원하고
// 기수 1개당 파일 1개라, 챔피언 기수 여러 개를 한 파일로 묶기 위해 별도 스크립트로 둔다.
//
// 사용법:
//   bun run scripts/export-champion-completion.ts [출력경로]

import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { createClient } from '@supabase/supabase-js';
import { computeChampionCompletion } from '../src/lib/completion';
import { isTestStudent } from '../src/lib/students';

const envPath = path.resolve(__dirname, '../.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '');
}
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 2026-07-28~30 인증평가를 치른 기수 (시트 순서대로)
const COHORTS = [
  { id: '0e3b0791-5c03-40f8-a632-094ffd7fe5d2', sheet: '그린 1회차' },
  { id: '175c280a-d24b-418a-867e-0ca322ef97f9', sheet: '그린 2회차' },
  { id: '7b1c6e7d-853f-4866-a278-b30e2065dd22', sheet: '블루 3회차' },
  { id: '385f6497-0b85-41d9-8668-bc0c8cf8f9b6', sheet: '블루 4회차' }
];

const FONT = 'Arial';
const PRIMARY = 'FF4A86E8';
const HEADER_BG = 'FFFCFCFC';

const HEADERS = ['NO', '이름', '소속기관', '부서', '직책', '연락처', '이메일', 'OT', '집중교육', '인증평가'];
const WIDTHS = [6, 14, 28, 22, 14, 16, 28, 8, 12, 10];

type StudentRow = {
  id: string;
  name: string;
  department: string | null;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  organizations: { name: string } | null;
};

function styleHeader(cell: ExcelJS.Cell, primary: boolean) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primary ? PRIMARY : HEADER_BG } };
  cell.font = { name: FONT, size: 11, bold: true, color: { argb: primary ? 'FFFFFFFF' : 'FF000000' } };
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  cell.border = {
    top: { style: 'medium' },
    bottom: { style: 'double' },
    left: { style: 'thin' },
    right: { style: 'thin' }
  };
}

function styleData(cell: ExcelJS.Cell, center: boolean) {
  cell.font = { name: FONT, size: 10 };
  cell.alignment = { horizontal: center ? 'center' : 'left', vertical: 'middle', wrapText: true };
  cell.border = {
    top: { style: 'thin' },
    bottom: { style: 'thin' },
    left: { style: 'thin' },
    right: { style: 'thin' }
  };
}

async function main() {
  const outPath =
    process.argv.slice(2).filter((a) => !a.startsWith('--'))[0] ||
    `C:\\Users\\USER\\Downloads\\AI챔피언_수료자명단_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.xlsx`;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'kbrain-ems';
  wb.created = new Date();

  const summarySheet = wb.addWorksheet('요약');
  const summaryRows: (string | number)[][] = [];

  for (const c of COHORTS) {
    const { data: cohort } = await supabase
      .from('cohorts')
      .select('name, intensive_start_at, intensive_end_at')
      .eq('id', c.id)
      .maybeSingle();
    if (!cohort) throw new Error(`cohort 없음: ${c.id}`);

    const { data: raw, error } = await supabase
      .from('students')
      .select('id, name, department, job_title, email, phone, organizations(name)')
      .eq('cohort_id', c.id)
      .order('name', { ascending: true })
      .returns<StudentRow[]>();
    if (error) throw new Error(error.message);
    const students = (raw ?? []).filter((s) => !isTestStudent(s.name));

    const { intensiveSessionCount, perStudent } = await computeChampionCompletion(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase as any,
      c.id,
      students.map((s) => s.id),
      cohort.intensive_start_at,
      cohort.intensive_end_at
    );

    const completed = students.filter((s) => perStudent.get(s.id)?.isCompleted);

    const ws = wb.addWorksheet(c.sheet);
    const title = ws.addRow([`${cohort.name} 수료자 명단 — ${completed.length}명`]);
    ws.mergeCells(title.number, 1, title.number, HEADERS.length);
    const tc = ws.getCell(title.number, 1);
    tc.font = { name: FONT, size: 13, bold: true };
    tc.alignment = { horizontal: 'left', vertical: 'middle' };
    title.height = 24;

    const sub = ws.addRow([
      `수료 조건: OT 참석 + 집중교육 ${intensiveSessionCount}일 중 3일 이상 참석 + 인증평가 참여`
    ]);
    ws.mergeCells(sub.number, 1, sub.number, HEADERS.length);
    ws.getCell(sub.number, 1).font = { name: FONT, size: 9, color: { argb: 'FF666666' } };

    ws.addRow([]);

    const hr = ws.addRow(HEADERS);
    hr.height = 26;
    hr.eachCell((cell, i) => styleHeader(cell, i === 1 || i === 2));
    WIDTHS.forEach((w, i) => (ws.getColumn(i + 1).width = w));

    completed.forEach((s, idx) => {
      const v = perStudent.get(s.id)!;
      const row = ws.addRow([
        idx + 1,
        s.name,
        s.organizations?.name ?? '',
        s.department ?? '',
        s.job_title ?? '',
        s.phone ?? '',
        s.email ?? '',
        v.otAttended ? '○' : '',
        `${v.intensiveDays}일`,
        v.examParticipated ? '○' : ''
      ]);
      row.eachCell((cell, i) => styleData(cell, i === 1 || i >= 8));
    });

    ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 4 }];

    summaryRows.push([
      cohort.name,
      students.length,
      students.filter((s) => perStudent.get(s.id)?.otAttended).length,
      students.filter((s) => (perStudent.get(s.id)?.intensiveDays ?? 0) >= 3).length,
      students.filter((s) => perStudent.get(s.id)?.examParticipated).length,
      completed.length,
      students.length - completed.length
    ]);
    console.log(`${c.sheet}: 학생 ${students.length} → 수료 ${completed.length}`);
  }

  // ---- 요약 시트 ----
  const st = summarySheet.addRow(['AI챔피언 수료 현황 (테스트 학생 제외)']);
  summarySheet.mergeCells(st.number, 1, st.number, 7);
  summarySheet.getCell(st.number, 1).font = { name: FONT, size: 13, bold: true };
  st.height = 24;
  summarySheet.addRow([]);
  const sh = summarySheet.addRow(['기수', '학생 수', 'OT 참석', '집중교육 3일+', '인증평가 참여', '수료', '미수료']);
  sh.height = 26;
  sh.eachCell((cell, i) => styleHeader(cell, i === 1));
  [30, 10, 10, 14, 14, 10, 10].forEach((w, i) => (summarySheet.getColumn(i + 1).width = w));
  for (const r of summaryRows) {
    const row = summarySheet.addRow(r);
    row.eachCell((cell, i) => styleData(cell, i > 1));
  }
  const totals = summaryRows.reduce(
    (a, r) => a.map((v, i) => (i === 0 ? '합계' : (v as number) + (r[i] as number))),
    ['합계', 0, 0, 0, 0, 0, 0] as (string | number)[]
  );
  const tr = summarySheet.addRow(totals);
  tr.eachCell((cell, i) => {
    styleData(cell, i > 1);
    cell.font = { name: FONT, size: 10, bold: true };
  });
  summarySheet.views = [{ state: 'frozen', ySplit: 3 }];

  await wb.xlsx.writeFile(outPath);
  console.log(`\n저장: ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

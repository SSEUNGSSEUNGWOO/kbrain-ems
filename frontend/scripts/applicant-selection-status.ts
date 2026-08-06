/**
 * 지원자·선발 현황 리포트 생성 (CLI).
 *
 * 집계 로직·서식은 src/lib/excel/selection-status-export.ts 공용 —
 * 화면 다운로드(/api/reports/selection-status)와 동일한 결과물이 나온다.
 *
 * 실행: bun run scripts/applicant-selection-status.ts
 *       STAMP=2026-07-30 bun run scripts/applicant-selection-status.ts   (기준일 고정)
 *       OUT_DIR=C:\temp bun run scripts/applicant-selection-status.ts    (저장 위치 변경)
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { buildSelectionStatusWorkbook } from '../src/lib/excel/selection-status-export';

const envPath = path.resolve(__dirname, '../.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const result = await buildSelectionStatusWorkbook(supabase, process.env.STAMP);

const outDir = process.env.OUT_DIR ?? 'C:\\kbrain\\중요자료';
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `지원자_선발현황_${result.stamp.replace(/-/g, '')}.xlsx`);
fs.writeFileSync(out, result.buffer);

console.log('저장:', out);
console.log(
  `지원 ${result.applicationCount}건 · 선발 ${result.selectedCount}건 · 과정 ${result.cohortCount}개 · 기관 ${result.orgCount}곳`
);

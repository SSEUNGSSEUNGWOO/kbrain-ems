// 양식 파일 전체 — 특히 22번 컬럼(다중선택)과 모든 시트 dump
import fs from 'fs';
import * as XLSX from 'xlsx';

const PATHS = [
  ['⑦', 'C:\\Dev\\새 폴더\\자동화용 시트_2026년 ⑦ 생성형 AI 활용 데이터분석 심화.xlsx'],
  ['⑧', 'C:\\Dev\\새 폴더\\자동화용 시트_2026년 ⑧ 바이브 코딩 LLM 서비스 개발.xlsx']
];

for (const [label, p] of PATHS) {
  console.log('\n' + '='.repeat(80));
  console.log(`${label}  ${p}`);
  console.log('='.repeat(80));
  const wb = XLSX.read(fs.readFileSync(p), { type: 'buffer', cellDates: true });
  console.log(`시트 목록: ${wb.SheetNames.join(' / ')}`);
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: false });
    console.log(`\n[시트: ${sheetName}] 총 ${rows.length}행`);
    rows.forEach((row, i) => {
      const cells = (row as unknown[]).map((c) => {
        if (c === null || c === undefined) return null;
        const s = String(c).trim();
        if (!s) return null;
        return s.length > 80 ? s.slice(0, 80) + '…' : s;
      });
      // null 만 있는 행은 스킵
      const nonNull = cells.filter((c) => c !== null);
      if (nonNull.length === 0) {
        console.log(`  행${i}: (빈 행)`);
        return;
      }
      // 짧게: 컬럼번호:값
      const parts = cells
        .map((c, j) => (c === null ? null : `[${j}]${c}`))
        .filter((x) => x !== null);
      console.log(`  행${i}: ${parts.join(' | ')}`);
    });
  }
}

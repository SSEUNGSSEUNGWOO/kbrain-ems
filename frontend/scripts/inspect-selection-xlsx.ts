import * as XLSX from 'xlsx';
import path from 'path';

const file = process.argv[2] ?? path.join('C:', 'Users', 'USER', 'Downloads', '1. 2026년 AI챔피언 및 공공 AI역량 트랙 교육 (6월2차) 선발 명단.xlsx');
console.log('파일:', file);

const wb = XLSX.readFile(file);
console.log('시트:', wb.SheetNames);

for (const sn of wb.SheetNames) {
  const ws = wb.Sheets[sn];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
  console.log(`\n=== ${sn} === 총 ${rows.length}행`);
  for (let i = 0; i < Math.min(8, rows.length); i++) {
    const r = rows[i] as unknown[];
    console.log(`  row${i}:`, JSON.stringify(r).slice(0, 300));
  }
}

import fs from 'fs';
import * as XLSX from 'xlsx';

const FILES = [
  'C:\\Users\\USER\\Downloads\\수료내역_260623_2026년 ① AI 리터러시와 업무 활용.xls',
  'C:\\Users\\USER\\Downloads\\수료내역_260623_2026년 ② 데이터 리터러시.xls'
];

for (const file of FILES) {
  console.log('\n' + '='.repeat(80));
  console.log(file.split('\\').pop());
  console.log('='.repeat(80));
  const buf = fs.readFileSync(file);
  const wb = XLSX.read(buf, { type: 'buffer' });
  console.log(`Sheets: ${wb.SheetNames.join(' | ')}`);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
  console.log(`Rows: ${rows.length}`);
  if (rows.length > 0) {
    console.log(`Headers: ${Object.keys(rows[0]).join(' | ')}`);
    console.log(`Sample row 1:`);
    for (const [k, v] of Object.entries(rows[0])) {
      console.log(`  ${k}: ${String(v).slice(0, 60)}`);
    }
  }
  // 수료=Y 비율
  const yes = rows.filter((r) => String(r['수료'] ?? '').trim().toUpperCase() === 'Y').length;
  console.log(`수료=Y: ${yes} / ${rows.length}`);
}

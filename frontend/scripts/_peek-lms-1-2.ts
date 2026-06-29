import fs from 'fs';
import * as XLSX from 'xlsx';

const FILES = [
  ['① AI 리터러시', 'C:\\Dev\\새 폴더\\수료내역_260626_2026년 ① AI 리터러시와 업무 활용.xls'],
  ['② 데이터 리터러시', 'C:\\Dev\\새 폴더\\수료내역_260626_2026년 ② 데이터 리터러시.xls']
];

for (const [label, p] of FILES) {
  console.log('\n' + '='.repeat(80));
  console.log(label, '—', p);
  console.log('='.repeat(80));
  if (!fs.existsSync(p)) {
    console.log('  ❌ 파일 없음');
    continue;
  }
  const buf = fs.readFileSync(p);
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
  } catch {
    wb = XLSX.read(buf.toString('utf8'), { type: 'string' });
  }
  console.log('  시트:', wb.SheetNames.join(' / '));
  for (const sn of wb.SheetNames) {
    const ws = wb.Sheets[sn];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: false });
    console.log(`\n  [${sn}] 총 ${rows.length}행`);
    rows.slice(0, 5).forEach((r, i) => {
      const cells = (r as unknown[]).map((c) => {
        if (c == null) return '';
        const s = String(c);
        return s.length > 40 ? s.slice(0, 40) + '…' : s;
      });
      console.log(`    행${i}: [${cells.map((c) => `"${c}"`).join(', ')}]`);
    });
  }
}

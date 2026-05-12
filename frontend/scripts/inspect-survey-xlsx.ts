// 일회성 — 만족도 조사 응답 엑셀의 구조를 파악한다.
// 실행: bun run scripts/inspect-survey-xlsx.ts
import ExcelJS from 'exceljs';
import path from 'path';

async function main() {
  const file = path.resolve(__dirname, '../../tmp_survey_57.xlsx');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);

  for (const ws of wb.worksheets) {
    console.log('='.repeat(80));
    console.log(`Sheet: ${ws.name}`);
    console.log(`Rows: ${ws.rowCount}  Cols: ${ws.columnCount}`);
    console.log('-'.repeat(80));

    const header = ws.getRow(1);
    const headers: string[] = [];
    header.eachCell({ includeEmpty: true }, (cell, col) => {
      headers[col] = String(cell.value ?? '').trim();
    });
    headers.slice(1).forEach((h, i) => {
      console.log(`  Col ${i + 1}: ${h}`);
    });

    console.log('-'.repeat(80));
    const sampleCount = Math.min(3, ws.rowCount - 1);
    for (let r = 2; r <= 1 + sampleCount; r++) {
      const row = ws.getRow(r);
      console.log(`\nRow ${r}:`);
      row.eachCell({ includeEmpty: false }, (cell, col) => {
        const val = cell.value;
        const str =
          typeof val === 'object' && val && 'text' in val
            ? String((val as { text?: unknown }).text)
            : String(val ?? '');
        console.log(`  [${col}] ${headers[col]?.slice(0, 30) ?? ''} = ${str.slice(0, 80)}`);
      });
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

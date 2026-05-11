/**
 * 일회용 — "전체 리스트" 시트의 모든 성명 dump + 누락 15명 검색.
 */

import ExcelJS from 'exceljs';

const FILE = 'C:/Users/USER/Downloads/★전문인재 서면심사 리스트.xlsx';

const text = (v: ExcelJS.CellValue): string => {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'object' && 'text' in (v as object)) return String((v as { text: unknown }).text).trim();
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object' && 'result' in (v as object)) return String((v as { result: unknown }).result).trim();
  return String(v).trim();
};

const MISSING = [
  '곽태혁', '권동근', '김윤성', '박기현', '박효철', '이호철', '장성주', '한재진',
  '고진영', '권용환', '김우영', '류승인', '박호용', '정백철', '이치국'
];

(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);

  // 1) "전체 리스트" 모든 row 성명 dump
  const sh = wb.getWorksheet('전체 리스트')!;
  const allNames: string[] = [];
  for (let r = 3; r <= 200; r++) {
    const name = text(sh.getRow(r).getCell(3).value);
    if (name) allNames.push(name);
  }
  console.log(`=== "전체 리스트" 성명 총 ${allNames.length}명 ===`);
  console.log(allNames.join(', '));

  // 2) 누락 15명을 모든 sheet에서 검색
  console.log('\n=== 누락 15명 모든 sheet 검색 ===');
  for (const target of MISSING) {
    const hits: string[] = [];
    for (const sh of wb.worksheets) {
      for (let r = 1; r <= sh.rowCount && r <= 200; r++) {
        const row = sh.getRow(r);
        for (let c = 1; c <= sh.columnCount && c <= 30; c++) {
          if (text(row.getCell(c).value) === target) {
            hits.push(`${sh.name}!R${r}C${c}`);
          }
        }
      }
    }
    console.log(`  ${target}: ${hits.length === 0 ? '❌ 어디에도 없음' : hits.join(', ')}`);
  }
})();

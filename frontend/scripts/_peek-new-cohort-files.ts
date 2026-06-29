// 7·8 일반과정 신청설문/신청자 4개 파일 헤더 peek.
import fs from 'fs';
import * as XLSX from 'xlsx';

const FILES = [
  {
    label: '⑦ 데이터분석 심화 — 신청설문 양식',
    path: 'C:\\Dev\\새 폴더\\자동화용 시트_2026년 ⑦ 생성형 AI 활용 데이터분석 심화.xlsx'
  },
  {
    label: '⑧ 바이브 코딩 — 신청설문 양식',
    path: 'C:\\Dev\\새 폴더\\자동화용 시트_2026년 ⑧ 바이브 코딩 LLM 서비스 개발.xlsx'
  },
  {
    label: '⑦ 데이터분석 심화 — 신청자 (6/26 18시 마감)',
    path: 'C:\\Dev\\새 폴더\\6월 26일 18시 마감된 신청자 내역 파일\\(260626_1800) 2026년 ⑦ 생성형 AI 활용 데이터분석 심화 1회차 (자격연계형).xls'
  },
  {
    label: '⑧ 바이브 코딩 — 신청자 (6/26 18시 마감)',
    path: 'C:\\Dev\\새 폴더\\6월 26일 18시 마감된 신청자 내역 파일\\(260626_1800) 2026년 ⑧ 바이브 코딩 LLM 서비스 개발 1회차 (자격연계형).xls'
  }
];

function peek(p: string, label: string) {
  console.log('\n' + '='.repeat(80));
  console.log(label);
  console.log(p);
  console.log('='.repeat(80));

  if (!fs.existsSync(p)) {
    console.log('  ❌ 파일 없음');
    return;
  }

  const buf = fs.readFileSync(p);
  // HTML(.xls)도 xlsx.read 가 처리해줌 (옵션 type:'buffer')
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
  } catch (e) {
    // HTML 인 경우 type 'string' 으로 재시도
    try {
      wb = XLSX.read(buf.toString('utf8'), { type: 'string' });
    } catch (e2) {
      console.log(`  ❌ 파싱 실패: ${(e2 as Error).message}`);
      return;
    }
  }

  console.log(`시트: ${wb.SheetNames.join(' / ')}`);
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: false });
    console.log(`\n  [시트: ${sheetName}] 총 ${rows.length}행`);
    const preview = rows.slice(0, 6);
    preview.forEach((row, i) => {
      const cells = (row as unknown[]).map((c) => {
        if (c === null || c === undefined) return '';
        const s = String(c);
        return s.length > 50 ? s.slice(0, 50) + '…' : s;
      });
      console.log(`    행${i}: [${cells.map((c) => `"${c}"`).join(', ')}]`);
    });
    if (rows.length > 6) console.log(`    ... (생략 ${rows.length - 6}행)`);
  }
}

for (const f of FILES) {
  peek(f.path, f.label);
}

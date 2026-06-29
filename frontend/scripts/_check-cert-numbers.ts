// Q2 자격증 응답 패턴 분류.
import fs from 'fs';
import * as XLSX from 'xlsx';

const FILES = [
  {
    label: '⑦ 데이터분석 심화 (108명)',
    path: 'C:\\Dev\\새 폴더\\6월 26일 18시 마감된 신청자 내역 파일\\(260626_1800) 2026년 ⑦ 생성형 AI 활용 데이터분석 심화 1회차 (자격연계형).xls'
  },
  {
    label: '⑧ 바이브 코딩 (56명)',
    path: 'C:\\Dev\\새 폴더\\6월 26일 18시 마감된 신청자 내역 파일\\(260626_1800) 2026년 ⑧ 바이브 코딩 LLM 서비스 개발 1회차 (자격연계형).xls'
  }
];

function readRows(p: string): unknown[][] {
  const buf = fs.readFileSync(p);
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
  } catch {
    wb = XLSX.read(buf.toString('utf8'), { type: 'string' });
  }
  return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], {
    header: 1,
    defval: null,
    raw: false
  });
}

const NONE_RE = /^(없음|보유\s*안|미보유|해당\s*없음|x|X|N\/A|n\/a|-+)\s*[.,!?]?\s*$/;
const HAS_NUMBER_RE = /[A-Z]{2,}[-_\s]?\d{3,}|\d{3,}-\d{3,}|BAE-?\d|AICE_?\w*\d/i;

for (const f of FILES) {
  console.log('\n' + '='.repeat(80));
  console.log(f.label);
  console.log('='.repeat(80));
  const rows = readRows(f.path).slice(1).filter((r) => String((r as unknown[])[1] ?? '').trim());
  let empty = 0;
  let noneText = 0;
  let textOnly = 0; // 자격증명은 있는데 번호 없음
  let withNumber = 0; // 번호 포함
  const samples = { none: [] as string[], textOnly: [] as string[], withNumber: [] as string[] };

  for (const r of rows) {
    const v = String((r as unknown[])[9] ?? '').trim();
    if (!v) {
      empty++;
      continue;
    }
    if (NONE_RE.test(v) || /^없음/.test(v.split(/[\s(]/)[0])) {
      noneText++;
      if (samples.none.length < 3) samples.none.push(v.slice(0, 70));
      continue;
    }
    if (HAS_NUMBER_RE.test(v)) {
      withNumber++;
      if (samples.withNumber.length < 3) samples.withNumber.push(v.slice(0, 70));
    } else {
      textOnly++;
      if (samples.textOnly.length < 3) samples.textOnly.push(v.slice(0, 70));
    }
  }

  const total = rows.length;
  const pct = (n: number) => ((n / total) * 100).toFixed(1) + '%';
  console.log(`  총 ${total}명`);
  console.log(`  ┌ 진짜 빈값: ${empty} (${pct(empty)})`);
  console.log(`  ├ "없음" 류 응답: ${noneText} (${pct(noneText)})`);
  console.log(`  ├ 자격증명만, 번호 없음: ${textOnly} (${pct(textOnly)})`);
  console.log(`  └ 자격증 번호 포함: ${withNumber} (${pct(withNumber)})`);

  if (samples.none.length) {
    console.log(`\n  [없음 류 예시]`);
    for (const s of samples.none) console.log(`    "${s}"`);
  }
  if (samples.textOnly.length) {
    console.log(`\n  [번호 없는 응답 예시]`);
    for (const s of samples.textOnly) console.log(`    "${s}"`);
  }
  if (samples.withNumber.length) {
    console.log(`\n  [번호 포함 예시]`);
    for (const s of samples.withNumber) console.log(`    "${s}"`);
  }
}

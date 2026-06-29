// 두 일반과정(⑦, ⑧)의 양식 파일과 신청자 파일을 동시에 검증.
// - 컬럼 매핑이 위치 기반으로 일치하는지
// - 양식의 정답(행2) 기준으로 신청자 답안 채점
// - 신청서 답변(자격증·소속·사무실번호·메일·직렬·직위) 품질 점검
import fs from 'fs';
import * as XLSX from 'xlsx';

type CohortDef = {
  label: string;
  cohortId: string;
  formPath: string;
  applicantPath: string;
};

const COHORTS: CohortDef[] = [
  {
    label: '⑦ 생성형 AI 활용 데이터분석 심화 1회차',
    cohortId: '70a3fc72-0af0-473b-9745-0f39ecaeae9f',
    formPath: 'C:\\Dev\\새 폴더\\자동화용 시트_2026년 ⑦ 생성형 AI 활용 데이터분석 심화.xlsx',
    applicantPath:
      'C:\\Dev\\새 폴더\\6월 26일 18시 마감된 신청자 내역 파일\\(260626_1800) 2026년 ⑦ 생성형 AI 활용 데이터분석 심화 1회차 (자격연계형).xls'
  },
  {
    label: '⑧ 바이브 코딩 LLM 서비스 개발 1회차',
    cohortId: '64fe381e-3bf7-48b5-ac79-d052854c87cc',
    formPath: 'C:\\Dev\\새 폴더\\자동화용 시트_2026년 ⑧ 바이브 코딩 LLM 서비스 개발.xlsx',
    applicantPath:
      'C:\\Dev\\새 폴더\\6월 26일 18시 마감된 신청자 내역 파일\\(260626_1800) 2026년 ⑧ 바이브 코딩 LLM 서비스 개발 1회차 (자격연계형).xls'
  }
];

// 위치(0-indexed) 기반 슬롯. 양식과 신청자 둘 다 24컬럼.
const SLOTS = [
  { idx: 0, key: 'no', label: 'NO' },
  { idx: 1, key: 'login_id', label: '아이디' },
  { idx: 2, key: 'name', label: '이름' },
  { idx: 3, key: 'phone', label: '전화번호' },
  { idx: 4, key: 'email', label: '이메일(가입)' },
  { idx: 5, key: 'org_kind', label: '소속기관구분(DATABUS)' },
  { idx: 6, key: 'org_name', label: '소속기관(DATABUS)' },
  { idx: 7, key: 'survey_kind', label: '설문분류' },
  { idx: 8, key: 'q_agree', label: 'Q1 안내 동의(단일)', type: 'single' },
  { idx: 9, key: 'q_cert', label: 'Q2 자격증 보유(서술)', type: 'text' },
  { idx: 10, key: 'q_org_type', label: 'Q3 소속 기관 형태(단일)', type: 'single' },
  { idx: 11, key: 'q_org_dept', label: 'Q4 소속/실국/부서(서술)', type: 'text' },
  { idx: 12, key: 'q_office_phone', label: 'Q5 사무실번호(서술)', type: 'text' },
  { idx: 13, key: 'q_personal_email', label: 'Q6 외부메일(서술)', type: 'text' },
  { idx: 14, key: 'q_role', label: 'Q7 직렬(단일)', type: 'single' },
  { idx: 15, key: 'q_position', label: 'Q8 직위(단일)', type: 'single' },
  { idx: 16, key: 'q_diag_1', label: 'Q9 진단1(단일·채점)', type: 'graded' },
  { idx: 17, key: 'q_diag_2', label: 'Q10 진단2(단일·채점)', type: 'graded' },
  { idx: 18, key: 'q_diag_3', label: 'Q11 진단3(단일·채점)', type: 'graded' },
  { idx: 19, key: 'q_diag_4', label: 'Q12 진단4(단일·채점)', type: 'graded' },
  { idx: 20, key: 'q_diag_5', label: 'Q13 진단5(단일·채점)', type: 'graded' },
  { idx: 21, key: 'q_diag_ox', label: 'Q14 진단OX(단일·채점)', type: 'graded' },
  { idx: 22, key: 'q_learn_use', label: 'Q15 학습 활용(다중)', type: 'multi' },
  { idx: 23, key: 'q_plan_100', label: 'Q16 100자 적용계획(서술)', type: 'text' }
];

function readRows(p: string): unknown[][] {
  const buf = fs.readFileSync(p);
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
  } catch {
    wb = XLSX.read(buf.toString('utf8'), { type: 'string' });
  }
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: false });
}

function normalize(s: unknown): string {
  if (s === null || s === undefined) return '';
  return String(s).trim();
}

function check(c: CohortDef) {
  console.log('\n' + '█'.repeat(80));
  console.log(`█  ${c.label}`);
  console.log('█'.repeat(80));

  const formRows = readRows(c.formPath);
  const appRows = readRows(c.applicantPath);

  // 양식: 행0 헤더, 행1 문항텍스트, 행2 정답
  const formHeader = formRows[0] as string[];
  const questionTexts = formRows[1] as string[];
  const correctAnswers = formRows[2] as string[];

  // 신청자: 행0 헤더, 행1~ 응답
  const appHeader = appRows[0] as string[];
  const dataRows = appRows.slice(1).filter((r) => normalize((r as unknown[])[1])); // 아이디 있는 행만

  console.log(`\n  - 신청자 수: ${dataRows.length}명`);
  console.log(`  - 양식 컬럼: ${formHeader.length}개, 신청자 컬럼: ${appHeader.length}개`);

  // 1) 헤더 위치 매핑 점검 (양식 vs 신청자, 위치 기반)
  console.log(`\n  ── 컬럼 매핑 점검 (양식 vs 신청자, 위치 기반) ──`);
  let mismatch = 0;
  for (const s of SLOTS) {
    const fH = normalize(formHeader[s.idx]);
    const aH = normalize(appHeader[s.idx]);
    const fT = normalize(questionTexts[s.idx]);
    const ok = fH === aH || (s.idx === 9 && !fH); // 자격증은 양식 헤더 비어있음
    if (!ok) mismatch++;
    const flag = ok ? '✓' : '✗';
    const qPreview = fT ? ` | "${fT.slice(0, 40)}${fT.length > 40 ? '…' : ''}"` : '';
    console.log(`    [${s.idx.toString().padStart(2)}] ${flag} ${s.label.padEnd(28)}${qPreview}`);
  }
  console.log(`  → 헤더 mismatch ${mismatch}개`);

  // 2) 채점 (graded 슬롯만)
  const gradedSlots = SLOTS.filter((s) => s.type === 'graded');
  const correctMap = new Map<number, string>();
  for (const s of gradedSlots) {
    correctMap.set(s.idx, normalize(correctAnswers[s.idx]));
  }
  console.log(`\n  ── 진단 정답 (양식 행2) ──`);
  for (const s of gradedSlots) {
    console.log(`    ${s.label}: "${correctMap.get(s.idx)}"`);
  }

  let totalScore = 0;
  const scoreDist = new Map<number, number>();
  const perQuestionCorrect = new Map<number, number>();
  for (const row of dataRows) {
    let s = 0;
    for (const slot of gradedSlots) {
      const ans = normalize((row as unknown[])[slot.idx]);
      const correct = correctMap.get(slot.idx) ?? '';
      if (ans && ans === correct) {
        s++;
        perQuestionCorrect.set(slot.idx, (perQuestionCorrect.get(slot.idx) ?? 0) + 1);
      }
    }
    totalScore += s;
    scoreDist.set(s, (scoreDist.get(s) ?? 0) + 1);
  }
  const avg = dataRows.length > 0 ? totalScore / dataRows.length : 0;
  console.log(`\n  ── 채점 결과 (6점 만점) ──`);
  console.log(`    평균: ${avg.toFixed(2)}점 / 응시 ${dataRows.length}명`);
  console.log(`    점수 분포:`);
  for (let i = 0; i <= 6; i++) {
    const cnt = scoreDist.get(i) ?? 0;
    const bar = '█'.repeat(Math.round((cnt / Math.max(1, dataRows.length)) * 40));
    console.log(`      ${i}점: ${cnt.toString().padStart(3)}명 ${bar}`);
  }
  console.log(`    문항별 정답률:`);
  for (const slot of gradedSlots) {
    const cnt = perQuestionCorrect.get(slot.idx) ?? 0;
    const pct = dataRows.length > 0 ? ((cnt / dataRows.length) * 100).toFixed(1) : '0.0';
    console.log(`      ${slot.label}: ${cnt}/${dataRows.length} (${pct}%)`);
  }

  // 3) 신청서 답변 품질 점검
  console.log(`\n  ── 신청서 답변 품질 (빈값 / 형식 이상) ──`);
  const reqFields = SLOTS.filter((s) =>
    ['q_cert', 'q_org_type', 'q_org_dept', 'q_office_phone', 'q_personal_email', 'q_role', 'q_position'].includes(s.key)
  );
  for (const f of reqFields) {
    let empty = 0;
    const samples: string[] = [];
    for (const row of dataRows) {
      const v = normalize((row as unknown[])[f.idx]);
      if (!v) empty++;
      else if (samples.length < 2) samples.push(v.slice(0, 50));
    }
    console.log(`    ${f.label.padEnd(28)} 빈값=${empty.toString().padStart(3)} | 예: ${samples.join(' / ')}`);
  }

  // 4) 다중선택 (학습 활용) — || 구분 코드들
  console.log(`\n  ── 학습 활용 다중선택 (Q15) 코드 ──`);
  const codeCount = new Map<string, number>();
  for (const row of dataRows) {
    const raw = normalize((row as unknown[])[22]);
    if (!raw) continue;
    for (const code of raw.split('||').map((c) => c.trim()).filter(Boolean)) {
      codeCount.set(code, (codeCount.get(code) ?? 0) + 1);
    }
  }
  const sortedCodes = [...codeCount.entries()].sort((a, b) => b[1] - a[1]);
  for (const [code, cnt] of sortedCodes) {
    console.log(`    ${code}: ${cnt}명`);
  }

  // 5) 100자 적용 계획 — 빈값/너무 짧음
  let empty100 = 0;
  let short100 = 0;
  for (const row of dataRows) {
    const v = normalize((row as unknown[])[23]);
    if (!v) empty100++;
    else if (v.length < 50) short100++;
  }
  console.log(`\n  ── Q16 적용계획 ──`);
  console.log(`    빈값=${empty100}, 50자 미만=${short100}`);

  // 6) 동일인 중복 검사 (아이디 기준)
  const seen = new Map<string, number>();
  const dup: string[] = [];
  for (const row of dataRows) {
    const id = normalize((row as unknown[])[1]);
    if (!id) continue;
    seen.set(id, (seen.get(id) ?? 0) + 1);
  }
  for (const [id, n] of seen) if (n > 1) dup.push(`${id}×${n}`);
  console.log(`\n  ── 중복 아이디 ──`);
  console.log(`    ${dup.length === 0 ? '없음' : dup.join(', ')}`);
}

for (const c of COHORTS) check(c);

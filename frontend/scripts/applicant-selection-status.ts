/**
 * 지원자·선발 현황 정리 (민원 대응용) — 전문인재 26-1/2기 제외.
 *
 * 집계 기준 (사용자 확정):
 *  - 총 지원자 수 = 연인원(지원 건수)
 *  - 선발 = selected + pre_cancel(사전취소) + same_day_cancel(당일취소), 취소는 별도 컬럼 분리
 *  - 기관 구분 = 신청자 본인응답(applicants.category) 기준 + 기관명 규칙 검증(전수 검수 시트)
 *
 * 출력: C:\Users\USER\Downloads\지원자_선발현황_전수_YYYYMMDD.xlsx
 */
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(__dirname, '../.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function all<T>(table: string, cols: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await s.from(table).select(cols).range(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

// ── 분류 체계 ────────────────────────────────────────────────
/** DB 6분류 → 보고서 5분류 */
const TO5: Record<string, string> = {
  중앙부처: '중앙',
  광역지자체: '지자체',
  기초지자체: '지자체',
  기초자치단체: '지자체', // 표기 흔들림 (4건)
  공공기관: '공공',
  지방공공기관: '공공', // 과거 세분값 — 2026-08-06 공공기관으로 통합, 잔여 데이터 대비 유지
  교육행정기관: '교육기관',
  기타: '기타'
};
const ORDER5 = ['중앙', '지자체', '공공', '교육기관', '기타', '미분류'];

const COHORT_CAT: Record<string, string> = {
  champion: '1. AI 챔피언',
  general: '2. 일반교육',
  special: '3. 특화교육',
  experts: '4. 전문인재'
};

const STATUS_KR: Record<string, string> = {
  selected: '선발',
  rejected: '미선발(탈락)',
  pre_cancel: '선발후 사전취소',
  same_day_cancel: '선발후 당일취소',
  applied: '신청(미결정)'
};
/** 선발군: 한 번이라도 선발된 건 (사용자 확정) */
const SELECTED_SET = new Set(['selected', 'pre_cancel', 'same_day_cancel']);

// ── 기관명 정규화 ────────────────────────────────────────────
function normOrg(raw: string): string {
  return raw
    .replace(/&\s*#\s*40\s*;/g, '(')
    .replace(/&\s*#\s*41\s*;/g, ')')
    .replace(/\s+/g, ' ')
    .trim();
}
// ── 기관명 기반 규칙 분류 (검수용) ───────────────────────────
const METRO_TOPS = [
  '서울특별시', '부산광역시', '대구광역시', '인천광역시', '광주광역시', '대전광역시',
  '울산광역시', '세종특별자치시', '경기도', '강원특별자치도', '충청북도', '충청남도',
  '전라남도', '전라북도', '전북특별자치도', '경상북도', '경상남도', '제주특별자치도',
  '전남광주통합특별시'
];
/** 중앙행정기관 + 소속기관 (top token 기준) */
const CENTRAL_TOPS = new Set([
  '개인정보보호위원회', '경찰청', '고용노동부', '공정거래위원회', '과학기술정보통신부',
  '국가기록원', '국가데이터처', '국가보훈부', '국가정보자원관리원', '국립과학수사연구원',
  '국립재난안전연구원', '국민권익위원회', '국방부', '국토교통부', '기상청', '기후에너지환경부',
  '농림축산식품부', '농촌진흥청', '문화체육관광부', '방위사업청', '법무부', '법제처', '병무청',
  '보건복지부', '산림청', '산업통상부', '산업통상자원부', '성평등가족부', '소방청',
  '식품의약품안전처', '외교부', '우주항공청', '원자력안전위원회', '인사혁신처', '재외동포청',
  '정부청사관리본부', '조달청', '중소벤처기업부', '지방자치인재개발원', '지식재산처',
  '질병관리청', '통일부', '해양경찰청', '해양수산부', '행정안전부', '행정중심복합도시건설청',
  '이북5도',
  // 기관명 없이 실·국명만 입력된 행정안전부 소속 조직
  '기획조정실', '인공지능정부실', '안전예방정책실', '자치혁신실', '재난복구지원국',
  '사회재난실', '중앙재난안전상황실', '지방재정경제실', '참여혁신조직실'
]);

/** 중앙부처 소속이지만 이름만으로는 공공기관처럼 보이는 국립기관 */
const CENTRAL_EXACT = new Set(['국립재활원']);
/** 이름만으로는 판정 어려워 개별 지정하는 공공기관 */
const PUBLIC_EXACT = new Set(['국립생태원', '무역안보관리원', '건축공간연구원']);

/** 규칙 추정 분류 → 6분류 값 또는 null(판단 보류) */
function ruleClassify(orgRaw: string): string | null {
  const name = normOrg(orgRaw);
  if (!name) return null;
  const parts = name.split(' ');
  const top = parts[0];
  const rest = parts.slice(1).join(' ');

  if (CENTRAL_EXACT.has(top)) return '중앙부처';
  if (PUBLIC_EXACT.has(top)) return '공공기관';
  // 교정시설은 법무부 소속
  if (/교도소|구치소$/.test(top)) return '중앙부처';
  // 폴리텍은 고용노동부 산하 공공기관 (아래 대학 판정보다 먼저)
  if (/폴리텍/.test(name)) return '공공기관';

  // 교육청 계열 (본청·교육지원청·직속기관·각급학교)
  if (/교육청$/.test(top)) return '교육행정기관';

  // 국가경찰 — 시도경찰청·경찰서는 경찰청 소속(국가직)
  if (top === '경찰청' || /^(서울|광주|부산|대구|대전|인천|울산|세종)\s*경찰청$/.test(name)) {
    return '중앙부처';
  }

  if (CENTRAL_TOPS.has(top)) return '중앙부처';

  // 광역단체 및 그 하위
  if (METRO_TOPS.includes(top)) {
    if (!rest) return '광역지자체';
    // 국가경찰 조직이 시도명 아래 입력된 경우
    if (/경찰청|경찰서/.test(rest) && !/자치경찰/.test(rest)) return '중앙부처';
    // 자치경찰위원회는 시·도 소속
    if (/자치경찰/.test(rest)) return '광역지자체';
    // 소방 사무는 시·도 소속 (소방청 제외)
    if (/소방/.test(rest)) return '광역지자체';
    // 기초자치단체 (자치구·시·군). 세종·제주는 단층/행정시라 광역으로 둔다.
    if (top === '세종특별자치시') return '광역지자체';
    if (top === '제주특별자치도' && /(제주시|서귀포시)/.test(rest)) return '광역지자체';
    if (/(시|군|구)$/.test(rest)) return '기초지자체';
    return '광역지자체';
  }

  // 단독 기초단체 표기 (예: 구미시청)
  if (/(시청|군청|구청)$/.test(top)) return '기초지자체';

  // 대학 — 국립/사립/시립이 섞여 규칙으로 단정 불가
  if (/대학교$|대학$|캠퍼스$/.test(top)) return null;

  // 그 외 공사·공단·재단·진흥원·연구원 등
  if (
    /공사|공단|재단|진흥원|연구원|평가원|관리원|보장원|진흥회|위원회|공제회|의료원|병원|정보원|개발원|자료원|박물관|과학관|기술원|인재원|인증원|자원관|기념관|거래소|조정원|시험원|보호원|보전원|지원본부|지원단|협회|협력단|체육회|마사회|소비자원|부동산원|치유원|잡월드|은행|기금|㈜|\(주\)|주식회사|센터$|발전$|유통$|투자$/.test(
      name
    )
  ) {
    return '공공기관';
  }
  return null;
}

// ── 데이터 로드 ──────────────────────────────────────────────
const cohorts = await all<{ id: string; name: string; category: string | null; started_at: string | null }>(
  'cohorts', 'id, name, category, started_at'
);
const apps = await all<{
  id: string; cohort_id: string; applicant_id: string; status: string;
  applied_at: string | null; decided_at: string | null;
}>('applications', 'id, cohort_id, applicant_id, status, applied_at, decided_at');
const applicants = await all<{
  id: string; name: string; category: string | null; organization_id: string | null;
  department: string | null; job_title: string | null; phone: string | null; email: string | null;
}>('applicants', 'id, name, category, organization_id, department, job_title, phone, email');
const orgs = await all<{ id: string; name: string }>('organizations', 'id, name');

const cohortById = new Map(cohorts.map((c) => [c.id, c]));
const orgById = new Map(orgs.map((o) => [o.id, o]));
const aById = new Map(applicants.map((a) => [a.id, a]));

const isExcludedCohort = (c: { name: string }) => c.name.startsWith('전문인재');

type Row = {
  cohort: string; cohortCat: string; started: string;
  name: string; orgRaw: string; org: string; dept: string; jobTitle: string;
  self6: string; self5: string; rule6: string; rule5: string; audit: string;
  status: string; statusKr: string; isSelected: boolean;
  phone: string; email: string; appliedAt: string; decidedAt: string;
};

const rows: Row[] = [];
let skippedTest = 0;
let skippedCohort = 0;

for (const app of apps) {
  const c = cohortById.get(app.cohort_id);
  if (!c) continue;
  if (isExcludedCohort(c)) {
    skippedCohort++;
    continue;
  }
  const ap = aById.get(app.applicant_id);
  if (!ap) continue;
  if (ap.name.startsWith('테스트')) {
    skippedTest++;
    continue;
  }

  const orgRaw = ap.organization_id ? (orgById.get(ap.organization_id)?.name ?? '') : '';
  const org = normOrg(orgRaw);
  const self6 = ap.category ?? '';
  const self5 = self6 ? (TO5[self6] ?? '기타') : '미분류';
  const rule6 = org ? (ruleClassify(org) ?? '') : '';
  const rule5 = rule6 ? TO5[rule6] : '';

  let audit = 'OK';
  if (!org) audit = '검수: 소속기관 미기재';
  else if (!self6) audit = '검수: 본인 구분 미응답';
  else if (!rule6) audit = '검수: 기관명으로 판정 불가';
  else if (rule5 !== self5) audit = `검수: 불일치 (본인 ${self5} / 기관명 ${rule5})`;
  else if (rule6 !== self6 && TO5[rule6] === TO5[self6]) audit = `참고: 광역·기초 세부차이 (본인 ${self6} / 기관명 ${rule6})`;

  rows.push({
    cohort: c.name,
    cohortCat: COHORT_CAT[c.category ?? ''] ?? (c.category ?? ''),
    started: c.started_at ?? '',
    name: ap.name,
    orgRaw,
    org,
    dept: ap.department ?? '',
    jobTitle: ap.job_title ?? '',
    self6: self6 || '(미응답)',
    self5,
    rule6: rule6 || '(판정불가)',
    rule5: rule5 || '(판정불가)',
    audit,
    status: app.status,
    statusKr: STATUS_KR[app.status] ?? app.status,
    isSelected: SELECTED_SET.has(app.status),
    phone: ap.phone ?? '',
    email: ap.email ?? '',
    appliedAt: app.applied_at ? app.applied_at.slice(0, 10) : '',
    decidedAt: app.decided_at ? app.decided_at.slice(0, 10) : ''
  });
}

console.log(`대상 지원 건: ${rows.length} (전문인재 제외 ${skippedCohort}, 테스트 제외 ${skippedTest})`);

// ── 시트 1: 요약 ─────────────────────────────────────────────
const cnt = (f: (r: Row) => boolean) => rows.filter(f).length;
const uniq = (rs: Row[]) => new Set(rs.map((r) => `${r.name}|${r.org}|${r.phone}`)).size;

const pct = (n: number, d: number) => (d ? n / d : 0);
// 실행일 기준. 특정 시점으로 고정하려면 STAMP=2026-07-30 환경변수로 넘긴다.
const STAMP_KR = process.env.STAMP ?? new Date().toISOString().slice(0, 10);
const cohortNamesAll = [...new Set(rows.map((r) => r.cohort))];
/** 기관 성격을 규칙으로 단정할 수 없어 본인응답을 유지한 건 (대학·소속 미기재 등) */
const unresolved = rows.filter((r) => r.audit !== 'OK').length;

const sum1: (string | number)[][] = [
  ['2026년 AI 역량강화 교육 — 지원자·선발 현황'],
  [`작성 기준일 ${STAMP_KR} · 전문인재 26-1·2기 및 테스트 계정 제외 · 총 ${cohortNamesAll.length}개 과정`],
  [],
  ['1. 소속기관 구분별 지원·선발'],
  [],
  ['구분', '지원(연인원)', '지원 비율', '선발', '선발 유지', '사전취소', '당일취소', '미선발', '선발률'],
];
for (const k of ORDER5) {
  const g = rows.filter((r) => r.self5 === k);
  if (!g.length) continue;
  const sel = g.filter((r) => r.isSelected).length;
  sum1.push([
    k,
    g.length,
    pct(g.length, rows.length),
    sel,
    g.filter((r) => r.status === 'selected').length,
    g.filter((r) => r.status === 'pre_cancel').length,
    g.filter((r) => r.status === 'same_day_cancel').length,
    g.length - sel,
    pct(sel, g.length)
  ]);
}
const selAll = cnt((r) => r.isSelected);
sum1.push([
  '합계', rows.length, 1, selAll,
  cnt((r) => r.status === 'selected'),
  cnt((r) => r.status === 'pre_cancel'),
  cnt((r) => r.status === 'same_day_cancel'),
  rows.length - selAll,
  pct(selAll, rows.length)
]);
sum1.push([]);
sum1.push(['2. 실인원 기준 (동일인 중복지원 제거) — 참고']);
sum1.push([]);
sum1.push(['구분', '지원(실인원)', '', '선발(실인원)']);
for (const k of ORDER5) {
  const g = rows.filter((r) => r.self5 === k);
  if (!g.length) continue;
  sum1.push([k, uniq(g), '', uniq(g.filter((r) => r.isSelected))]);
}
sum1.push(['합계', uniq(rows), '', uniq(rows.filter((r) => r.isSelected))]);
sum1.push([]);
sum1.push(['3. 집계 기준']);
sum1.push([]);
sum1.push(['지원자 수', '연인원 — 한 사람이 여러 과정에 지원하면 각각 1건으로 집계']);
sum1.push(['선발', '선발 확정된 건 전부 — 이후 사전취소·당일취소한 건도 선발에 포함(우측에 분리 표기)']);
sum1.push(['미선발', '탈락(선발되지 않은 건)']);
sum1.push(['소속기관 구분', '신청서 문항 C2에서 신청자가 직접 선택한 값. 광역·기초지자체는 「지자체」로 합산']);
sum1.push(['', '기관명과 어긋나는 응답 107명분은 기관 성격에 맞게 보정 완료 (경찰=중앙, 소방=지자체 등)']);
if (unresolved) {
  sum1.push(['', `단, 대학 소속 등 ${unresolved}건은 기관 성격을 단정할 수 없어 본인응답을 그대로 두었음`]);
}
sum1.push([
  '제외 대상',
  `전문인재 26-1기·26-2기(${skippedCohort}건), 테스트 계정(${skippedTest}건)`
]);

// ── 시트 2: 과정별 × 구분별 ──────────────────────────────────
const cohortNames = [...new Set(rows.map((r) => r.cohort))].sort((a, b) => {
  const sa = rows.find((r) => r.cohort === a)!.started;
  const sb = rows.find((r) => r.cohort === b)!.started;
  return (sa || 'z').localeCompare(sb || 'z');
});
const sheet2: (string | number)[][] = [
  ['과정명', '과정구분', '교육시작일', '지원 계', ...ORDER5.map((k) => `지원-${k}`), '선발 계', ...ORDER5.map((k) => `선발-${k}`), '미선발 계', '선발률']
];
for (const cn of cohortNames) {
  const g = rows.filter((r) => r.cohort === cn);
  const sel = g.filter((r) => r.isSelected);
  sheet2.push([
    cn, g[0].cohortCat, g[0].started,
    g.length, ...ORDER5.map((k) => g.filter((r) => r.self5 === k).length),
    sel.length, ...ORDER5.map((k) => sel.filter((r) => r.self5 === k).length),
    g.length - sel.length,
    pct(sel.length, g.length)
  ]);
}
const selRows = rows.filter((r) => r.isSelected);
sheet2.push([
  '합계', '', '',
  rows.length, ...ORDER5.map((k) => rows.filter((r) => r.self5 === k).length),
  selRows.length, ...ORDER5.map((k) => selRows.filter((r) => r.self5 === k).length),
  rows.length - selRows.length,
  pct(selRows.length, rows.length)
]);

// ── 시트 3: 기관별 × 과정별 선발/미선발 ──────────────────────
type OrgKey = string;
const byOrgCohort = new Map<OrgKey, Row[]>();
for (const r of rows) {
  const k = `${r.org || '(기관 미기재)'}\u0000${r.cohort}`;
  const arr = byOrgCohort.get(k) ?? [];
  arr.push(r);
  byOrgCohort.set(k, arr);
}
const sheet3: (string | number)[][] = [
  ['소속기관', '구분', '과정명', '과정구분', '지원', '선발', '  ├ 선발 유지', '  ├ 사전취소', '  └ 당일취소', '미선발', '선발률']
];
const orgCohortRows = [...byOrgCohort.entries()]
  .map(([k, g]) => ({ org: k.split('\u0000')[0], cohort: k.split('\u0000')[1], g }))
  .sort((a, b) => a.org.localeCompare(b.org, 'ko') || (a.g[0].started || 'z').localeCompare(b.g[0].started || 'z'));
for (const { org, cohort, g } of orgCohortRows) {
  const sel = g.filter((r) => r.isSelected).length;
  const cats = [...new Set(g.map((r) => r.self5))].join('/');
  sheet3.push([
    org, cats, cohort, g[0].cohortCat, g.length, sel,
    g.filter((r) => r.status === 'selected').length,
    g.filter((r) => r.status === 'pre_cancel').length,
    g.filter((r) => r.status === 'same_day_cancel').length,
    g.length - sel,
    pct(sel, g.length)
  ]);
}

// ── 시트 4: 기관별 합계 (과정 무관) ──────────────────────────
const byOrg = new Map<string, Row[]>();
for (const r of rows) {
  const k = r.org || '(기관 미기재)';
  const arr = byOrg.get(k) ?? [];
  arr.push(r);
  byOrg.set(k, arr);
}
const sheet4: (string | number)[][] = [
  ['소속기관', '구분', '지원', '선발', '미선발', '선발률', '지원 과정 수', '지원 과정 목록']
];
for (const [org, g] of [...byOrg.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const sel = g.filter((r) => r.isSelected).length;
  const cs = [...new Set(g.map((r) => r.cohort))];
  sheet4.push([
    org, [...new Set(g.map((r) => r.self5))].join('/'), g.length, sel, g.length - sel,
    pct(sel, g.length), cs.length, cs.join(', ')
  ]);
}

// ── 시트 5: RAW 전체 ─────────────────────────────────────────
const sheet5: (string | number)[][] = [
  ['과정명', '과정구분', '교육시작일', '상태', '선발여부', '이름', '소속기관', '부서', '직급',
   '소속기관 구분', '세부구분', '연락처', '이메일', '신청일', '결정일', '비고']
];
for (const r of [...rows].sort((a, b) =>
  (a.started || 'z').localeCompare(b.started || 'z') || a.cohort.localeCompare(b.cohort) || a.org.localeCompare(b.org, 'ko') || a.name.localeCompare(b.name, 'ko')
)) {
  sheet5.push([
    r.cohort, r.cohortCat, r.started, r.statusKr, r.isSelected ? '선발' : '미선발',
    r.name, r.org, r.dept, r.jobTitle, r.self5, r.self6,
    r.phone, r.email, r.appliedAt, r.decidedAt,
    r.audit === 'OK' ? '' : '기관명으로 구분 판정 불가 — 본인응답 유지'
  ]);
}

// ── 저장 (서식은 src/lib/excel/* 관례를 따름) ────────────────
const FONT = 'Arial';
const C_PRIMARY = 'FF4A86E8'; // 표 헤더
const C_TITLE = 'FF1F4E79'; // 제목 글씨
const C_BAND = 'FFF2F2F2'; // 합계·섹션 배경
const C_ZEBRA = 'FFFAFBFD'; // 짝수행
const C_WHITE = 'FFFFFFFF';
const C_MUTED = 'FF7F7F7F';
const THIN = { style: 'thin' as const, color: { argb: 'FFD9D9D9' } };

const wb = new ExcelJS.Workbook();
wb.creator = 'kbrain-ems';
wb.created = new Date(2026, 6, 30);

type SheetOpt = {
  widths: number[];
  /** 0-based 열 인덱스 — 백분율 서식 */
  pctCols?: number[];
  /** 헤더가 있는 시트: 자동필터 + 틀고정 + 헤더 서식 */
  headerRow?: number;
  /** 행이 많은 시트는 테두리·줄무늬를 생략해 파일을 가볍게 유지 */
  light?: boolean;
  /** 줄무늬 사용 여부 (기본 true) */
  zebra?: boolean;
  /** 이 행(0-based)부터는 표가 아니라 설명 문단으로 취급 */
  noteFrom?: number;
};

const isNum = (v: unknown): v is number => typeof v === 'number';

function addSheet(name: string, data: (string | number)[][], opt: SheetOpt) {
  const ws = wb.addWorksheet(name, {
    views: opt.headerRow !== undefined ? [{ state: 'frozen', ySplit: opt.headerRow + 1 }] : undefined
  });
  ws.columns = opt.widths.map((w) => ({ width: w }));

  const pctSet = new Set(opt.pctCols ?? []);

  data.forEach((rowData, rIdx) => {
    const row = ws.addRow(rowData);
    const first = String(rowData[0] ?? '');
    const isHeader = opt.headerRow === rIdx || first === '구분';
    const isTotal = first === '합계';
    const isSection = /^\d+\.\s/.test(first);
    const isTitle = rIdx === 0 && opt.headerRow === undefined;
    const isSubtitle = rIdx === 1 && opt.headerRow === undefined;

    if (isTitle) {
      row.height = 26;
      row.getCell(1).font = { name: FONT, size: 15, bold: true, color: { argb: C_TITLE } };
      return;
    }
    if (isSubtitle) {
      row.getCell(1).font = { name: FONT, size: 9, color: { argb: C_MUTED } };
      return;
    }
    if (isSection) {
      row.height = 22;
      row.getCell(1).font = { name: FONT, size: 12, bold: true, color: { argb: C_TITLE } };
      return;
    }
    // 설명 문단 — 표가 아니므로 테두리·배경 없이 첫 열만 강조
    if (opt.noteFrom !== undefined && rIdx > opt.noteFrom) {
      row.getCell(1).font = { name: FONT, size: 10, bold: true };
      row.getCell(2).font = { name: FONT, size: 10, color: { argb: C_MUTED } };
      row.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };
      return;
    }

    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const c0 = colNumber - 1;
      if (isNum(cell.value)) cell.numFmt = pctSet.has(c0) ? '0.0%' : '#,##0';

      if (isHeader) {
        cell.font = { name: FONT, size: 10, bold: true, color: { argb: C_WHITE } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_PRIMARY } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = { top: THIN, bottom: THIN, left: THIN, right: THIN };
        return;
      }

      cell.font = { name: FONT, size: 10, bold: isTotal };
      cell.alignment = {
        horizontal: isNum(cell.value) ? 'right' : 'left',
        vertical: 'middle'
      };
      if (isTotal) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_BAND } };
        cell.border = { top: { style: 'medium', color: { argb: C_PRIMARY } }, bottom: THIN, left: THIN, right: THIN };
        return;
      }
      if (!opt.light) {
        cell.border = { top: THIN, bottom: THIN, left: THIN, right: THIN };
        if (opt.zebra !== false && rIdx % 2 === 1) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_ZEBRA } };
        }
      }
    });
    if (isHeader) row.height = 30;
  });

  if (opt.headerRow !== undefined) {
    const lastCol = Math.max(...data.map((r) => r.length));
    ws.autoFilter = {
      from: { row: opt.headerRow + 1, column: 1 },
      to: { row: data.length, column: lastCol }
    };
  }
}

const NCOL = ORDER5.length;
addSheet('1. 총괄요약', sum1, {
  widths: [30, 15, 12, 12, 12, 12, 12, 12, 10],
  pctCols: [2, 8],
  zebra: false,
  noteFrom: sum1.findIndex((r) => String(r[0] ?? '').startsWith('3. '))
});
addSheet('2. 과정별', sheet2, {
  widths: [36, 13, 12, 10, ...Array(NCOL).fill(10), 10, ...Array(NCOL).fill(10), 10, 9],
  pctCols: [4 + NCOL * 2 + 2],
  headerRow: 0
});
addSheet('3. 기관별 x 과정별', sheet3, {
  widths: [42, 14, 36, 13, 8, 8, 10, 10, 10, 9, 9],
  pctCols: [10],
  headerRow: 0
});
addSheet('4. 기관별 합계', sheet4, {
  widths: [42, 14, 8, 8, 9, 9, 12, 60],
  pctCols: [5],
  headerRow: 0
});
addSheet('5. 전체 명단(raw)', sheet5, {
  widths: [32, 13, 12, 15, 10, 10, 38, 22, 14, 14, 14, 15, 26, 12, 12, 34],
  headerRow: 0,
  light: true
});

const outDir = 'C:\\kbrain\\중요자료';
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const out = `${outDir}\\지원자_선발현황_${STAMP_KR.replace(/-/g, '')}.xlsx`;
await wb.xlsx.writeFile(out);
console.log('저장:', out);
console.log('시트:', wb.worksheets.map((w) => w.name).join(' / '));
console.log(`기관 ${byOrg.size}곳 / 과정 ${cohortNames.length}개 / 본인응답 유지(판정보류) ${unresolved}건`);

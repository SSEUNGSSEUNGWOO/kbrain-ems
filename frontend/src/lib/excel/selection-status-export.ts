// 지원자·선발 현황 통합 리포트 (전 과정 횡단) — 화면 다운로드 / CLI 스크립트 공용.
//
// 집계 기준 (운영 확정):
//  - 지원자 수 = 연인원(지원 건수). 한 사람이 여러 과정에 지원하면 각각 1건
//  - 선발 = selected + pre_cancel(사전취소) + same_day_cancel(당일취소). 취소는 별도 컬럼 분리
//  - 소속기관 구분 = 신청자 본인응답(applicants.category) 기준 + 기관명 규칙 검증(raw 시트 비고)
//  - 전문인재 기수·테스트 계정 제외

import ExcelJS from 'exceljs';
import type { SupabaseClient } from '@supabase/supabase-js';

/** DB 분류 → 보고서 5분류 */
const TO5: Record<string, string> = {
  중앙부처: '중앙',
  광역지자체: '지자체',
  기초지자체: '지자체',
  기초자치단체: '지자체', // 표기 흔들림
  공공기관: '공공',
  지방공공기관: '공공', // 2026-08-06 공공기관으로 통합, 잔여 데이터 대비 유지
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
const SELECTED_SET = new Set(['selected', 'pre_cancel', 'same_day_cancel']);

function normOrg(raw: string): string {
  return raw
    .replace(/&\s*#\s*40\s*;/g, '(')
    .replace(/&\s*#\s*41\s*;/g, ')')
    .replace(/\s+/g, ' ')
    .trim();
}

const METRO_TOPS = [
  '서울특별시', '부산광역시', '대구광역시', '인천광역시', '광주광역시', '대전광역시',
  '울산광역시', '세종특별자치시', '경기도', '강원특별자치도', '충청북도', '충청남도',
  '전라남도', '전라북도', '전북특별자치도', '경상북도', '경상남도', '제주특별자치도',
  '전남광주통합특별시'
];
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
const CENTRAL_EXACT = new Set(['국립재활원']);
const PUBLIC_EXACT = new Set(['국립생태원', '무역안보관리원', '건축공간연구원']);

/** 기관명 기반 추정 분류 → 분류 라벨 또는 null(판단 보류) */
function ruleClassify(orgRaw: string): string | null {
  const name = normOrg(orgRaw);
  if (!name) return null;
  const parts = name.split(' ');
  const top = parts[0];
  const rest = parts.slice(1).join(' ');

  if (CENTRAL_EXACT.has(top)) return '중앙부처';
  if (PUBLIC_EXACT.has(top)) return '공공기관';
  if (top.includes('교도소') || top.endsWith('구치소')) return '중앙부처'; // 법무부 소속
  if (/폴리텍/.test(name)) return '공공기관'; // 대학 판정보다 먼저
  if (top.endsWith('교육청')) return '교육행정기관';
  if (top === '경찰청' || /^(서울|광주|부산|대구|대전|인천|울산|세종)\s*경찰청$/.test(name)) {
    return '중앙부처';
  }
  if (CENTRAL_TOPS.has(top)) return '중앙부처';

  if (METRO_TOPS.includes(top)) {
    if (!rest) return '광역지자체';
    if (/경찰청|경찰서/.test(rest) && !/자치경찰/.test(rest)) return '중앙부처';
    if (/자치경찰/.test(rest)) return '광역지자체';
    if (/소방/.test(rest)) return '광역지자체';
    if (top === '세종특별자치시') return '광역지자체';
    if (top === '제주특별자치도' && /(제주시|서귀포시)/.test(rest)) return '광역지자체';
    if (/(시|군|구)$/.test(rest)) return '기초지자체';
    return '광역지자체';
  }
  if (/(시청|군청|구청)$/.test(top)) return '기초지자체';
  if (/대학교$|대학$|캠퍼스$/.test(top)) return null; // 국립/사립 혼재로 단정 불가
  if (
    /공사|공단|재단|진흥원|연구원|평가원|관리원|보장원|진흥회|위원회|공제회|의료원|병원|정보원|개발원|자료원|박물관|과학관|기술원|인재원|인증원|자원관|기념관|거래소|조정원|시험원|보호원|보전원|지원본부|지원단|협회|협력단|체육회|마사회|소비자원|부동산원|치유원|잡월드|은행|기금|㈜|\(주\)|주식회사|센터$|발전$|유통$|투자$/.test(
      name
    )
  ) {
    return '공공기관';
  }
  return null;
}

type Row = {
  cohort: string; cohortCat: string; started: string;
  name: string; org: string; dept: string; jobTitle: string;
  self6: string; self5: string; rule6: string; rule5: string; audit: string;
  status: string; statusKr: string; isSelected: boolean;
  phone: string; email: string; appliedAt: string; decidedAt: string;
};

// ── 엑셀 서식 (src/lib/excel/* 관례) ─────────────────────────
const FONT = 'Arial';
const C_PRIMARY = 'FF4A86E8';
const C_TITLE = 'FF1F4E79';
const C_BAND = 'FFF2F2F2';
const C_ZEBRA = 'FFFAFBFD';
const C_WHITE = 'FFFFFFFF';
const C_MUTED = 'FF7F7F7F';
const THIN = { style: 'thin' as const, color: { argb: 'FFD9D9D9' } };

type SheetOpt = {
  widths: number[];
  pctCols?: number[];
  headerRow?: number;
  /** 행이 많은 시트는 테두리·줄무늬 생략 (파일 경량화) */
  light?: boolean;
  zebra?: boolean;
  /** 이 행(0-based) 이후는 표가 아니라 설명 문단 */
  noteFrom?: number;
};

const isNum = (v: unknown): v is number => typeof v === 'number';

function addSheet(
  wb: ExcelJS.Workbook,
  name: string,
  data: (string | number)[][],
  opt: SheetOpt
) {
  const ws = wb.addWorksheet(name, {
    views:
      opt.headerRow !== undefined ? [{ state: 'frozen', ySplit: opt.headerRow + 1 }] : undefined
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
        cell.border = {
          top: { style: 'medium', color: { argb: C_PRIMARY } },
          bottom: THIN,
          left: THIN,
          right: THIN
        };
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

export type SelectionStatusResult = {
  buffer: Buffer;
  stamp: string;
  applicationCount: number;
  selectedCount: number;
  cohortCount: number;
  orgCount: number;
};

/**
 * 지원자·선발 현황 워크북 생성.
 * @param supabase service_role 클라이언트 (RLS 우회 필요)
 * @param stamp 작성 기준일 'YYYY-MM-DD'. 생략 시 오늘
 */
export async function buildSelectionStatusWorkbook(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  stamp?: string
): Promise<SelectionStatusResult> {
  const STAMP_KR = stamp ?? new Date().toISOString().slice(0, 10);

  async function all<T>(table: string, cols: string): Promise<T[]> {
    const out: T[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from(table).select(cols).range(from, from + 999);
      if (error) throw new Error(`${table}: ${error.message}`);
      out.push(...((data ?? []) as T[]));
      if (!data || data.length < 1000) break;
    }
    return out;
  }

  const [cohorts, apps, applicants, orgs] = await Promise.all([
    all<{ id: string; name: string; category: string | null; started_at: string | null }>(
      'cohorts',
      'id, name, category, started_at'
    ),
    all<{
      id: string; cohort_id: string; applicant_id: string; status: string;
      applied_at: string | null; decided_at: string | null;
    }>('applications', 'id, cohort_id, applicant_id, status, applied_at, decided_at'),
    all<{
      id: string; name: string; category: string | null; organization_id: string | null;
      department: string | null; job_title: string | null; phone: string | null; email: string | null;
    }>('applicants', 'id, name, category, organization_id, department, job_title, phone, email'),
    all<{ id: string; name: string }>('organizations', 'id, name')
  ]);

  const cohortById = new Map(cohorts.map((c) => [c.id, c]));
  const orgById = new Map(orgs.map((o) => [o.id, o]));
  const aById = new Map(applicants.map((a) => [a.id, a]));

  const rows: Row[] = [];
  let skippedTest = 0;
  let skippedCohort = 0;

  for (const app of apps) {
    const c = cohortById.get(app.cohort_id);
    if (!c) continue;
    if (c.name.startsWith('전문인재')) {
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
    else if (rule6 !== self6 && TO5[rule6] === TO5[self6]) {
      audit = `참고: 광역·기초 세부차이 (본인 ${self6} / 기관명 ${rule6})`;
    }

    rows.push({
      cohort: c.name,
      cohortCat: COHORT_CAT[c.category ?? ''] ?? (c.category ?? ''),
      started: c.started_at ?? '',
      name: ap.name,
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

  const cnt = (f: (r: Row) => boolean) => rows.filter(f).length;
  const uniq = (rs: Row[]) => new Set(rs.map((r) => `${r.name}|${r.org}|${r.phone}`)).size;
  const pct = (n: number, d: number) => (d ? n / d : 0);
  const cohortNamesAll = [...new Set(rows.map((r) => r.cohort))];
  const unresolved = rows.filter((r) => r.audit !== 'OK').length;

  // ── 시트 1: 총괄요약 ──
  const sum1: (string | number)[][] = [
    ['2026년 AI 역량강화 교육 — 지원자·선발 현황'],
    [
      `작성 기준일 ${STAMP_KR} · 전문인재 26-1·2기 및 테스트 계정 제외 · 총 ${cohortNamesAll.length}개 과정`
    ],
    [],
    ['1. 소속기관 구분별 지원·선발'],
    [],
    ['구분', '지원(연인원)', '지원 비율', '선발', '선발 유지', '사전취소', '당일취소', '미선발', '선발률']
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
  sum1.push(['', '기관명과 어긋나는 응답은 기관 성격에 맞게 보정 (경찰=중앙, 소방=지자체 등)']);
  if (unresolved) {
    sum1.push(['', `단, 대학 소속 등 ${unresolved}건은 기관 성격을 단정할 수 없어 본인응답을 그대로 두었음`]);
  }
  sum1.push([
    '제외 대상',
    `전문인재 26-1기·26-2기(${skippedCohort}건), 테스트 계정(${skippedTest}건)`
  ]);

  // ── 시트 2: 과정별 ──
  const cohortNames = [...new Set(rows.map((r) => r.cohort))].toSorted((a, b) => {
    const sa = rows.find((r) => r.cohort === a)!.started;
    const sb = rows.find((r) => r.cohort === b)!.started;
    return (sa || 'z').localeCompare(sb || 'z');
  });
  const sheet2: (string | number)[][] = [
    [
      '과정명', '과정구분', '교육시작일', '지원 계',
      ...ORDER5.map((k) => `지원-${k}`),
      '선발 계',
      ...ORDER5.map((k) => `선발-${k}`),
      '미선발 계', '선발률'
    ]
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

  // ── 시트 3: 기관별 × 과정별 ──
  // 기관명·과정명에 공백이 있어 구분자는 NUL 이스케이프를 쓴다
  // 기관명·과정명에 공백이 있어 구분자는 NUL 을 쓴다
  const SEP = '\u0000';
  const byOrgCohort = new Map<string, Row[]>();
  for (const r of rows) {
    const k = `${r.org || '(기관 미기재)'}${SEP}${r.cohort}`;
    const arr = byOrgCohort.get(k) ?? [];
    arr.push(r);
    byOrgCohort.set(k, arr);
  }
  const sheet3: (string | number)[][] = [
    ['소속기관', '구분', '과정명', '과정구분', '지원', '선발', '  ├ 선발 유지', '  ├ 사전취소', '  └ 당일취소', '미선발', '선발률']
  ];
  const orgCohortRows = [...byOrgCohort.entries()]
    .map(([k, g]) => ({ org: k.split(SEP)[0], cohort: k.split(SEP)[1], g }))
    .toSorted(
      (a, b) =>
        a.org.localeCompare(b.org, 'ko') ||
        (a.g[0].started || 'z').localeCompare(b.g[0].started || 'z')
    );
  for (const { org, cohort, g } of orgCohortRows) {
    const sel = g.filter((r) => r.isSelected).length;
    sheet3.push([
      org, [...new Set(g.map((r) => r.self5))].join('/'), cohort, g[0].cohortCat, g.length, sel,
      g.filter((r) => r.status === 'selected').length,
      g.filter((r) => r.status === 'pre_cancel').length,
      g.filter((r) => r.status === 'same_day_cancel').length,
      g.length - sel,
      pct(sel, g.length)
    ]);
  }

  // ── 시트 4: 기관별 합계 ──
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
  for (const [org, g] of [...byOrg.entries()].toSorted((a, b) => b[1].length - a[1].length)) {
    const sel = g.filter((r) => r.isSelected).length;
    const cs = [...new Set(g.map((r) => r.cohort))];
    sheet4.push([
      org, [...new Set(g.map((r) => r.self5))].join('/'), g.length, sel, g.length - sel,
      pct(sel, g.length), cs.length, cs.join(', ')
    ]);
  }

  // ── 시트 5: RAW 전체 ──
  const sheet5: (string | number)[][] = [
    ['과정명', '과정구분', '교육시작일', '상태', '선발여부', '이름', '소속기관', '부서', '직급',
     '소속기관 구분', '세부구분', '연락처', '이메일', '신청일', '결정일', '비고']
  ];
  for (const r of rows.toSorted(
    (a, b) =>
      (a.started || 'z').localeCompare(b.started || 'z') ||
      a.cohort.localeCompare(b.cohort) ||
      a.org.localeCompare(b.org, 'ko') ||
      a.name.localeCompare(b.name, 'ko')
  )) {
    sheet5.push([
      r.cohort, r.cohortCat, r.started, r.statusKr, r.isSelected ? '선발' : '미선발',
      r.name, r.org, r.dept, r.jobTitle, r.self5, r.self6,
      r.phone, r.email, r.appliedAt, r.decidedAt,
      r.audit === 'OK' ? '' : '기관명으로 구분 판정 불가 — 본인응답 유지'
    ]);
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'kbrain-ems';

  const NCOL = ORDER5.length;
  addSheet(wb, '1. 총괄요약', sum1, {
    widths: [30, 15, 12, 12, 12, 12, 12, 12, 10],
    pctCols: [2, 8],
    zebra: false,
    noteFrom: sum1.findIndex((r) => String(r[0] ?? '').startsWith('3. '))
  });
  addSheet(wb, '2. 과정별', sheet2, {
    widths: [36, 13, 12, 10, ...Array(NCOL).fill(10), 10, ...Array(NCOL).fill(10), 10, 9],
    pctCols: [4 + NCOL * 2 + 2],
    headerRow: 0
  });
  addSheet(wb, '3. 기관별 x 과정별', sheet3, {
    widths: [42, 14, 36, 13, 8, 8, 10, 10, 10, 9, 9],
    pctCols: [10],
    headerRow: 0
  });
  addSheet(wb, '4. 기관별 합계', sheet4, {
    widths: [42, 14, 8, 8, 9, 9, 12, 60],
    pctCols: [5],
    headerRow: 0
  });
  addSheet(wb, '5. 전체 명단(raw)', sheet5, {
    widths: [32, 13, 12, 15, 10, 10, 38, 22, 14, 14, 14, 15, 26, 12, 12, 34],
    headerRow: 0,
    light: true
  });

  const buffer = (await wb.xlsx.writeBuffer()) as unknown as Buffer;
  return {
    buffer,
    stamp: STAMP_KR,
    applicationCount: rows.length,
    selectedCount: selAll,
    cohortCount: cohortNames.length,
    orgCount: byOrg.size
  };
}

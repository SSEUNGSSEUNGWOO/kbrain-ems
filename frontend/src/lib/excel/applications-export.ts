import ExcelJS from 'exceljs';

const FONT_NAME = 'Arial';
const COLOR_HEADER_SELECTED = 'FF1F7A4F'; // emerald
const COLOR_HEADER_REJECTED = 'FFA12B3F'; // rose
const COLOR_HEADER_INFO = 'FFF2F2F2';
const COLOR_NOTE_ROW = 'FFFFF8DC'; // 옅은 크림색 — 비고 있는 행
const COLOR_WHITE = 'FFFFFFFF';
const COLOR_BLACK = 'FF000000';

const CATEGORY_LABEL: Record<string, string> = {
  '①': '중앙부처',
  '②': '광역지자체',
  '③': '기초지자체',
  '④': '공공기관',
  '⑤': '교육행정기관',
  '⑥': '기타'
};

const STAGE_LABEL: Record<string, string> = {
  docs: '서류',
  interview: '면접',
  final: '최종'
};

export type PriorCertSummary = {
  year: number;
  track: 'green' | 'blue' | 'expert' | 'continuing';
  round: number | null;
  event: 'hackathon' | 'miniproject' | 'private' | null;
};

export type ExportApplication = {
  id: string;
  name: string;
  organization: string | null;
  department: string | null;
  jobRole: string | null;
  c2Choice: string | null;
  /** applicants.category — 운영자 보정이 반영된 값. C2 원응답보다 우선한다 */
  applicantCategory?: string | null;
  knowledgeScore: number | null;
  knowledgeCorrect: number | null;
  knowledgeTotal: number | null;
  multiSelectedCount: number | null;
  multiChoicesMax: number;
  planCharCount: number | null;
  prereqDoneCount: number;
  prereqMax: number;
  finalScore: number | null;
  decidedAt: string | null;
  rejectedStage: string | null;
  priorCerts: PriorCertSummary[];
  // 올해 전문인재 cohort 라벨 (예: "26-1", "26-2"). 없으면 빈 배열.
  expertCohortLabels: string[];
  // 다른 cohort(블루 등)에 selected라서 제외 정책으로 빠진 경우
  excludedByOtherCohort?: boolean;
  // 미선발 사유 (buildApplicationsWorkbook에서 자동 채움)
  rejectionReason?: string;
  // 신청 상태 (selected / same_day_cancel). 당일취소자 포함 export 시 구분용.
  applicationStatus?: string;
};

export const REJECTION_REASONS = [
  '다른 cohort 중복 합격 (제외 정책)',
  '사전학습 미이수',
  '기관별 배정 인원 기준 적용',
  '상위부처 인원 기준 초과',
  '역량점수 미흡',
  '업무활용 계획 구체성 미흡'
] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

function parentOrgKey(org: string | null | undefined): string {
  if (!org) return '';
  const t = org.trim();
  const i = t.indexOf(' ');
  return i === -1 ? t : t.slice(0, i);
}

function classifyRejection(
  r: ExportApplication,
  config: SelectionConfigSummary,
  selected: ExportApplication[]
): string {
  // 0. 다른 cohort 중복 합격 (최우선 제외 정책)
  if (r.excludedByOtherCohort) {
    return '다른 cohort 중복 합격 (제외 정책)';
  }
  // 1. 사전학습 미이수
  if (config.excludeNoPrereq && r.prereqMax > 0 && r.prereqDoneCount < r.prereqMax) {
    return '사전학습 미이수';
  }
  // 2. 기관별 배정 인원 초과
  if (config.maxPerOrg > 0 && r.organization) {
    const sameOrgSelected = selected.filter((x) => x.organization === r.organization);
    if (sameOrgSelected.length >= config.maxPerOrg) {
      return '기관별 배정 인원 기준 적용';
    }
  }
  // 3. 상위부처 인원 초과
  if (config.parentOrgCap && config.parentOrgCap > 0 && r.organization) {
    const parent = parentOrgKey(r.organization);
    if (parent) {
      const sameParentSelected = selected.filter((x) => parentOrgKey(x.organization) === parent);
      if (sameParentSelected.length >= config.parentOrgCap) {
        return '상위부처 인원 기준 초과';
      }
    }
  }
  // 4 vs 5: 지식 vs 정성 정규화 비교
  const kTotal = r.knowledgeTotal ?? 0;
  const kNorm = kTotal > 0 && r.knowledgeScore !== null ? r.knowledgeScore / kTotal : null;
  const planNorm = Math.min((r.planCharCount ?? 0) / 100, 1);
  const multiNorm =
    r.multiChoicesMax > 0 ? Math.min((r.multiSelectedCount ?? 0) / r.multiChoicesMax, 1) : 0;
  const pNorm = (planNorm + multiNorm) / 2;
  if (kNorm === null) return '역량점수 미흡';
  return kNorm < pNorm ? '역량점수 미흡' : '업무활용 계획 구체성 미흡';
}

type ColumnDef = {
  key:
    | keyof ExportApplication
    | 'no'
    | 'category'
    | 'knowledge'
    | 'multiCheck'
    | 'prereq'
    | 'notes'
    | 'rejectionReason'
    | 'statusLabel';
  header: string;
  width: number;
};

const COMMON_COLUMNS: ColumnDef[] = [
  { key: 'no', header: '번호', width: 6 },
  { key: 'name', header: '이름', width: 12 },
  { key: 'category', header: '분류', width: 14 },
  { key: 'organization', header: '소속기관', width: 28 },
  { key: 'department', header: '실·국·과명', width: 30 },
  { key: 'prereq', header: '사전학습', width: 10 },
  { key: 'knowledge', header: '역량점수', width: 14 },
  { key: 'multiCheck', header: '업무활용성', width: 12 },
  { key: 'planCharCount', header: '활용계획(자)', width: 14 },
  { key: 'finalScore', header: '종합점수', width: 12 }
];

const SELECTED_COLUMNS: ColumnDef[] = [
  ...COMMON_COLUMNS,
  { key: 'decidedAt', header: '선발일', width: 14 },
  { key: 'notes', header: '비고', width: 32 }
];

// 당일취소자 포함 export 시 사용 — 상태 컬럼 추가로 '선발'/'당일취소' 구분
const SELECTED_WITH_STATUS_COLUMNS: ColumnDef[] = [
  ...COMMON_COLUMNS,
  { key: 'statusLabel', header: '상태', width: 10 },
  { key: 'decidedAt', header: '선발일', width: 14 },
  { key: 'notes', header: '비고', width: 32 }
];

const REJECTED_COLUMNS: ColumnDef[] = [
  ...COMMON_COLUMNS,
  { key: 'rejectionReason', header: '미선발 사유', width: 26 },
  { key: 'notes', header: '비고', width: 32 }
];

// 분류별 분포 — 4그룹으로 묶어서 표시
const DISTRIBUTION_GROUPS: { label: string; choices: string[] }[] = [
  { label: '중앙부처', choices: ['①'] },
  { label: '지자체', choices: ['②', '③'] },
  { label: '공공·교육', choices: ['④', '⑤'] },
  { label: '기타', choices: ['⑥'] }
];

export type CohortTrack = 'green' | 'blue' | 'expert' | 'continuing' | null;

// cohorts.selection_config jsonb 스냅샷. applySelections에서 저장.
export type SelectionConfigSummary = {
  weights: { knowledge: number; plan: number };
  quotaRatio: { central: number; local: number; public_edu: number };
  maxPerOrg: number; // 0 = 무제한
  excludeNoPrereq: boolean;
  totalCapacity: number;
  withReserve: boolean;
  effectiveCapacity: number;
  parentOrgCap?: number; // 상위부처당 최대 인원 (0 = 비활성)
  excludedCohortIds?: string[]; // 이 cohort들의 selected를 제외
  appliedAt: string;
};

function fmtPeriod(startedAt: string | null, endedAt: string | null): string {
  const fmt = (s: string | null) => {
    if (!s) return null;
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[1]}.${m[2]}.${m[3]}` : s;
  };
  const a = fmt(startedAt);
  const b = fmt(endedAt);
  if (a && b) return a === b ? a : `${a} ~ ${b}`;
  if (a) return a;
  if (b) return b;
  return '';
}

export async function buildApplicationsWorkbook({
  cohortName,
  cohortTrack,
  selected,
  rejected,
  selectionConfig,
  excludedCohortNames,
  startedAt,
  endedAt,
  includeCancel
}: {
  cohortName: string;
  cohortTrack: CohortTrack;
  selected: ExportApplication[];
  rejected: ExportApplication[];
  selectionConfig: SelectionConfigSummary | null;
  excludedCohortNames?: string[];
  startedAt?: string | null;
  endedAt?: string | null;
  /** true면 selected 리스트에 당일취소자가 섞여 있고, 선발 시트에 '상태' 컬럼 추가 */
  includeCancel?: boolean;
}): Promise<Buffer> {
  const period = fmtPeriod(startedAt ?? null, endedAt ?? null);
  // 미선발 사유 자동 분류 (selection_config 있을 때만)
  if (selectionConfig) {
    for (const r of rejected) {
      r.rejectionReason = classifyRejection(r, selectionConfig, selected);
    }
  }

  const wb = new ExcelJS.Workbook();
  buildSummarySheet(
    wb,
    cohortName,
    selected,
    rejected,
    selectionConfig,
    period,
    excludedCohortNames ?? []
  );
  const selSheetName = period ? `선발 (${period})` : '선발';
  const rejSheetName = period ? `미선발 (${period})` : '미선발';
  const selCols = includeCancel ? SELECTED_WITH_STATUS_COLUMNS : SELECTED_COLUMNS;
  buildSheet(
    wb,
    selSheetName,
    cohortName,
    cohortTrack,
    selected,
    selCols,
    COLOR_HEADER_SELECTED,
    period
  );
  buildSheet(
    wb,
    rejSheetName,
    cohortName,
    cohortTrack,
    rejected,
    REJECTED_COLUMNS,
    COLOR_HEADER_REJECTED,
    period
  );
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

function buildSummarySheet(
  wb: ExcelJS.Workbook,
  cohortName: string,
  selected: ExportApplication[],
  rejected: ExportApplication[],
  selectionConfig: SelectionConfigSummary | null,
  period: string,
  excludedCohortNames: string[]
) {
  const ws = wb.addWorksheet('요약');

  ws.getColumn(1).width = 3;
  ws.getColumn(2).width = 42;
  ws.getColumn(3).width = 28;
  ws.getColumn(4).width = 28;
  const lastCol = 4;

  // 제목 (B2:D3)
  ws.mergeCells(`${cellRef(2, 2)}:${cellRef(lastCol, 3)}`);
  const titleCell = ws.getCell(2, 2);
  titleCell.value = `「${cohortName}」 선발 결과 요약`;
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: COLOR_HEADER_SELECTED }
  };
  titleCell.font = {
    name: FONT_NAME,
    size: 18,
    bold: true,
    color: { argb: COLOR_WHITE }
  };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  applyBorder(titleCell, 'medium');

  // 출력일 + 교육기간 (B4)
  ws.mergeCells(`${cellRef(2, 4)}:${cellRef(lastCol, 4)}`);
  const metaCell = ws.getCell(4, 2);
  const today = new Date().toISOString().slice(0, 10);
  metaCell.value = period ? `교육기간 ${period} · 출력일 ${today}` : `출력일 ${today}`;
  metaCell.font = { name: FONT_NAME, size: 10, color: { argb: '666666' } };
  metaCell.alignment = { horizontal: 'right', vertical: 'middle' };

  let row = 6;

  // 1) 지원 현황
  row = addSummarySectionHeader(ws, row, '지원 현황', lastCol);
  const total = selected.length + rejected.length;
  const selPct = total > 0 ? Math.round((selected.length / total) * 1000) / 10 : 0;
  row = addSummaryRow(ws, row, '총 지원자', `${total}명`);
  row = addSummaryRow(ws, row, '선발', `${selected.length}명 (${selPct}%)`);
  row = addSummaryRow(ws, row, '미선발', `${rejected.length}명`);
  row++;

  // 2) 분류별 합격 현황 — 지원 대비 합격. 지원자 0명 그룹은 생략
  row = addSummarySectionHeader(ws, row, '분류별 합격 현황', lastCol);
  const allApps = [...selected, ...rejected];
  if (allApps.length === 0) {
    row = addSummaryRow(ws, row, '—', '지원자 없음');
  } else {
    for (const group of DISTRIBUTION_GROUPS) {
      const applied = allApps.filter(
        (r) => r.c2Choice && group.choices.includes(r.c2Choice)
      ).length;
      if (applied === 0) continue;
      const accepted = selected.filter(
        (r) => r.c2Choice && group.choices.includes(r.c2Choice)
      ).length;
      const pct = Math.round((accepted / applied) * 1000) / 10;
      row = addSummaryRow(ws, row, group.label, `지원 ${applied}명 → 선발 ${accepted}명 (${pct}%)`);
    }
  }

  // 3) 선발 정책 — selection_config가 저장돼 있을 때만
  if (selectionConfig) {
    row++;
    row = addSummarySectionHeader(ws, row, '선발 정책', lastCol);
    const c = selectionConfig;
    const capLabel = c.withReserve
      ? `${c.totalCapacity}명 (110% 예비: ${c.effectiveCapacity}명)`
      : `${c.totalCapacity}명`;
    row = addSummaryRow(ws, row, '정원', capLabel);
    row = addSummaryRow(
      ws,
      row,
      '점수 가중치',
      `지식 ${c.weights.knowledge} : 정성 ${c.weights.plan}`
    );
    row = addSummaryRow(
      ws,
      row,
      '부처별 비율',
      `중앙 ${c.quotaRatio.central} : 지자체 ${c.quotaRatio.local} : 공공·교육 ${c.quotaRatio.public_edu}`
    );
    row = addSummaryRow(ws, row, '기관당 최대', c.maxPerOrg > 0 ? `${c.maxPerOrg}명` : '무제한');
    row = addSummaryRow(ws, row, '사전학습 미수료 제외', c.excludeNoPrereq ? '예' : '아니오');
    if (c.parentOrgCap && c.parentOrgCap > 0) {
      row = addSummaryRow(ws, row, '상위부처당 최대', `${c.parentOrgCap}명`);
    }
    if (c.excludedCohortIds && c.excludedCohortIds.length > 0) {
      const namesLabel =
        excludedCohortNames.length > 0
          ? excludedCohortNames.join(', ')
          : `${c.excludedCohortIds.length}개 (이름 조회 실패)`;
      row = addSummaryRow(
        ws,
        row,
        '중복 제외 cohort',
        `${namesLabel} — 위 cohort들에서 합격한 신청자는 후보에서 제외`
      );
    }
    row = addSummaryRow(ws, row, '적용 시점', fmtDateTime(c.appliedAt));
  }

  // 4) 미선발 사유 — 4 카테고리별 인원
  row++;
  row = addSummarySectionHeader(ws, row, '미선발 사유', lastCol);
  if (rejected.length === 0) {
    row = addSummaryRow(ws, row, '—', '미선발자 없음');
  } else {
    const reasonCount = new Map<string, number>();
    for (const r of rejected) {
      const k = r.rejectionReason ?? '—';
      reasonCount.set(k, (reasonCount.get(k) ?? 0) + 1);
    }
    const ORDER: string[] = [...REJECTION_REASONS];
    for (const k of ORDER) {
      const n = reasonCount.get(k) ?? 0;
      if (n === 0) continue;
      let labelSuffix = '';
      if (k === '기관별 배정 인원 기준 적용' && selectionConfig?.maxPerOrg) {
        labelSuffix = ` (${selectionConfig.maxPerOrg}명 이내)`;
      } else if (k === '상위부처 인원 기준 초과' && selectionConfig?.parentOrgCap) {
        labelSuffix = ` (${selectionConfig.parentOrgCap}명 이내)`;
      }
      const pct = Math.round((n / rejected.length) * 1000) / 10;
      row = addSummaryRow(ws, row, `${k}${labelSuffix}`, `${n}명 (${pct}%)`);
    }
    const other = reasonCount.get('—') ?? 0;
    if (other > 0) {
      const pct = Math.round((other / rejected.length) * 1000) / 10;
      row = addSummaryRow(ws, row, '미분류', `${other}명 (${pct}%)`);
    }
  }

  // 5) 종합점수 분포 (합격)
  row++;
  row = addSummarySectionHeader(ws, row, '종합점수 분포 (합격)', lastCol);
  const scores = selected
    .map((s) => s.finalScore)
    .filter((s): s is number => s !== null)
    .toSorted((a, b) => a - b);
  if (scores.length === 0) {
    row = addSummaryRow(ws, row, '—', '점수 정보 없음');
  } else {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const median =
      scores.length % 2 === 0
        ? (scores[scores.length / 2 - 1] + scores[scores.length / 2]) / 2
        : scores[Math.floor(scores.length / 2)];
    row = addSummaryRow(ws, row, '평균', fmtScore(avg));
    row = addSummaryRow(ws, row, '중앙값', fmtScore(median));
    row = addSummaryRow(ws, row, '최저', fmtScore(scores[0]));
    row = addSummaryRow(ws, row, '최고', fmtScore(scores[scores.length - 1]));
  }

  // 6) 기관별 지원 현황 (2명 이상) — 기관당 정원 정책 효과 확인용
  row++;
  row = addSummarySectionHeader(ws, row, '기관별 지원 현황 (2명 이상)', lastCol);
  const orgStats = new Map<string, { applied: number; accepted: number }>();
  for (const r of [...selected, ...rejected]) {
    if (!r.organization) continue;
    const cur = orgStats.get(r.organization) ?? { applied: 0, accepted: 0 };
    cur.applied++;
    orgStats.set(r.organization, cur);
  }
  for (const r of selected) {
    if (!r.organization) continue;
    const cur = orgStats.get(r.organization);
    if (cur) cur.accepted++;
  }
  const overTwo = [...orgStats.entries()]
    .filter(([, v]) => v.applied >= 2)
    .toSorted((a, b) => b[1].applied - a[1].applied || a[0].localeCompare(b[0], 'ko'));
  if (overTwo.length === 0) {
    row = addSummaryRow(ws, row, '—', '2명 이상 지원 기관 없음');
  } else {
    for (const [org, v] of overTwo) {
      row = addSummaryRow(ws, row, org, `지원 ${v.applied}명 → 선발 ${v.accepted}명`);
    }
  }
}

function addSummarySectionHeader(
  ws: ExcelJS.Worksheet,
  row: number,
  label: string,
  lastCol: number
): number {
  ws.mergeCells(`${cellRef(2, row)}:${cellRef(lastCol, row)}`);
  const cell = ws.getCell(row, 2);
  cell.value = label;
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: COLOR_HEADER_INFO }
  };
  cell.font = {
    name: FONT_NAME,
    size: 12,
    bold: true,
    color: { argb: COLOR_BLACK }
  };
  cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  applyBorder(cell, 'thin');
  ws.getRow(row).height = 22;
  return row + 1;
}

function addSummaryRow(ws: ExcelJS.Worksheet, row: number, label: string, value: string): number {
  const labelCell = ws.getCell(row, 2);
  labelCell.value = label;
  labelCell.font = { name: FONT_NAME, size: 11, color: { argb: COLOR_BLACK } };
  labelCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1, wrapText: true };
  applyBorder(labelCell, 'thin');

  ws.mergeCells(`${cellRef(3, row)}:${cellRef(4, row)}`);
  const valueCell = ws.getCell(row, 3);
  valueCell.value = value;
  valueCell.font = { name: FONT_NAME, size: 11, color: { argb: COLOR_BLACK } };
  valueCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1, wrapText: true };
  applyBorder(valueCell, 'thin');

  // 셀 너비 대비 텍스트 길이가 길면 행 높이 자동 늘리기
  const maxLen = Math.max(label.length, value.length);
  if (maxLen > 28) {
    ws.getRow(row).height = Math.max(ws.getRow(row).height ?? 18, Math.ceil(maxLen / 28) * 18);
  }

  return row + 1;
}

function fmtScore(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function buildSheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  cohortName: string,
  cohortTrack: CohortTrack,
  rows: ExportApplication[],
  cols: ColumnDef[],
  titleColor: string,
  period: string
) {
  const ws = wb.addWorksheet(sheetName);

  // 컬럼 너비 (A 여백 + 1열 시작)
  ws.getColumn(1).width = 3;
  for (let i = 0; i < cols.length; i++) {
    ws.getColumn(2 + i).width = cols[i].width;
  }

  // 제목 (B2:lastCol3) — 2~3행 머지
  const lastCol = 1 + cols.length;
  const titleRange = `${cellRef(2, 2)}:${cellRef(lastCol, 3)}`;
  ws.mergeCells(titleRange);
  const titleCell = ws.getCell(2, 2);
  // 시트 제목: 「cohort명」 (교육기간) 선발/미선발 명단
  const baseName = sheetName.startsWith('선발')
    ? '선발'
    : sheetName.startsWith('미선발')
      ? '미선발'
      : sheetName;
  titleCell.value = period
    ? `「${cohortName}」 (교육기간 ${period}) ${baseName} 명단`
    : `「${cohortName}」 ${baseName} 명단`;
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: titleColor }
  };
  titleCell.font = {
    name: FONT_NAME,
    size: 18,
    bold: true,
    color: { argb: COLOR_WHITE }
  };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  applyBorder(titleCell, 'medium');

  // 메타 (4행) — 총 인원, 출력일
  const metaRange = `${cellRef(2, 4)}:${cellRef(lastCol, 4)}`;
  ws.mergeCells(metaRange);
  const metaCell = ws.getCell(4, 2);
  const today = new Date().toISOString().slice(0, 10);
  metaCell.value = period
    ? `총 ${rows.length}명 · 교육기간 ${period} · 출력일 ${today}`
    : `총 ${rows.length}명 · 출력일 ${today}`;
  metaCell.font = {
    name: FONT_NAME,
    size: 10,
    color: { argb: '666666' }
  };
  metaCell.alignment = { horizontal: 'right', vertical: 'middle' };

  // 분류 분포 (5행)
  const distRange = `${cellRef(2, 5)}:${cellRef(lastCol, 5)}`;
  ws.mergeCells(distRange);
  const distCell = ws.getCell(5, 2);
  distCell.value = buildDistributionText(rows);
  distCell.font = {
    name: FONT_NAME,
    size: 10,
    bold: true,
    color: { argb: '333333' }
  };
  distCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  distCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFAFAFA' }
  };
  applyBorder(distCell, 'thin');
  ws.getRow(5).height = 22;

  // 컬럼 헤더 (6행)
  const headerRow = 6;
  for (let i = 0; i < cols.length; i++) {
    const cell = ws.getCell(headerRow, 2 + i);
    cell.value = cols[i].header;
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLOR_HEADER_INFO }
    };
    cell.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: COLOR_BLACK } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    applyBorder(cell, 'thin');
  }
  widenLeft(ws.getCell(headerRow, 2));
  widenRight(ws.getCell(headerRow, lastCol));
  ws.getCell(headerRow, 2).border = {
    ...ws.getCell(headerRow, 2).border,
    top: { style: 'medium' },
    bottom: { style: 'medium' }
  };

  // 데이터 행
  if (rows.length === 0) {
    const emptyRange = `${cellRef(2, headerRow + 1)}:${cellRef(lastCol, headerRow + 1)}`;
    ws.mergeCells(emptyRange);
    const emptyCell = ws.getCell(headerRow + 1, 2);
    emptyCell.value = '대상자가 없습니다';
    emptyCell.font = {
      name: FONT_NAME,
      size: 11,
      color: { argb: '999999' },
      italic: true
    };
    emptyCell.alignment = { horizontal: 'center', vertical: 'middle' };
    applyBorder(emptyCell, 'thin');
    return;
  }

  for (let idx = 0; idx < rows.length; idx++) {
    const r = rows[idx];
    const rowNum = headerRow + 1 + idx;
    // 음영 조건:
    //  1) 현재 cohort 트랙과 동일 트랙의 25 인증자 (그린→그린, 블루→블루)
    //  2) 26 전문인재 수강자 (트랙 무관)
    const sameTrackPrior =
      cohortTrack !== null && r.priorCerts.some((c) => c.track === cohortTrack);
    const hasNote = sameTrackPrior || r.expertCohortLabels.length > 0;
    for (let ci = 0; ci < cols.length; ci++) {
      const col = cols[ci];
      const cell = ws.getCell(rowNum, 2 + ci);
      cell.value = renderValue(col, r, idx + 1);
      cell.font = { name: FONT_NAME, size: 11, color: { argb: COLOR_BLACK } };
      cell.alignment = {
        horizontal: alignFor(col.key),
        vertical: 'middle'
      };
      applyBorder(cell, 'thin');
      if (hasNote) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: COLOR_NOTE_ROW }
        };
      }
    }
    widenLeft(ws.getCell(rowNum, 2));
    widenRight(ws.getCell(rowNum, lastCol));
  }

  // 마지막 행 아래쪽 border 강조
  const lastRow = headerRow + rows.length;
  for (let ci = 0; ci < cols.length; ci++) {
    const cell = ws.getCell(lastRow, 2 + ci);
    cell.border = { ...cell.border, bottom: { style: 'medium' } };
  }

  // 컬럼 헤더에 AutoFilter (드롭다운으로 필터·정렬 가능)
  ws.autoFilter = {
    from: { row: headerRow, column: 2 },
    to: { row: lastRow, column: lastCol }
  };
}

function renderValue(col: ColumnDef, r: ExportApplication, no: number): string | number | null {
  switch (col.key) {
    case 'no':
      return no;
    case 'name':
      return r.name;
    case 'category':
      // 지원자 마스터 값 우선 — 운영자가 직접 보정한 분류가 C2 원응답으로 덮이면 안 된다.
      return r.applicantCategory ?? (r.c2Choice ? (CATEGORY_LABEL[r.c2Choice] ?? '—') : '—');
    case 'organization':
      return r.organization ?? '—';
    case 'department':
      return r.department ?? '—';
    case 'jobRole':
      return r.jobRole ?? '—';
    case 'knowledge':
      if (r.knowledgeScore === null) return '—';
      if (r.knowledgeCorrect !== null && r.knowledgeTotal !== null) {
        return `${r.knowledgeScore} (${r.knowledgeCorrect}/${r.knowledgeTotal})`;
      }
      return r.knowledgeScore;
    case 'multiCheck':
      if (r.multiSelectedCount === null) return '—';
      return r.multiChoicesMax > 0
        ? `${r.multiSelectedCount}/${r.multiChoicesMax}`
        : `${r.multiSelectedCount}`;
    case 'prereq':
      if (r.prereqMax === 0) return '—';
      return `${r.prereqDoneCount}/${r.prereqMax}`;
    case 'planCharCount':
      return r.planCharCount ?? '—';
    case 'finalScore':
      return r.finalScore !== null ? Math.round(r.finalScore * 10) / 10 : '—';
    case 'decidedAt':
      return r.decidedAt ?? '—';
    case 'rejectionReason':
      return r.rejectionReason ?? '—';
    case 'statusLabel':
      return r.applicationStatus === 'same_day_cancel' ? '당일취소' : '선발';
    case 'notes':
      return buildNotesText(r);
    default:
      return '—';
  }
}

const PRIOR_TRACK_LABEL: Record<PriorCertSummary['track'], string> = {
  green: '그린',
  blue: '블루',
  expert: '전문인재',
  continuing: '보수교육'
};
const PRIOR_EVENT_LABEL: Record<NonNullable<PriorCertSummary['event']>, string> = {
  hackathon: '해커톤',
  miniproject: '미니프로젝트',
  private: '민간협업'
};

function buildNotesText(r: ExportApplication): string {
  const parts: string[] = [];
  if (r.priorCerts.length > 0) {
    const sorted = [...r.priorCerts].toSorted((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      if (a.track !== b.track) return a.track.localeCompare(b.track);
      return (a.round ?? 0) - (b.round ?? 0);
    });
    const items = sorted.map((c) => {
      const label = PRIOR_TRACK_LABEL[c.track] ?? c.track;
      const yy = String(c.year).slice(-2);
      const suffix = c.round ? `${yy}-${c.round}` : yy;
      const event = c.event ? `(${PRIOR_EVENT_LABEL[c.event]})` : '';
      return `${label} ${suffix}${event}`;
    });
    parts.push(`${items.join(', ')} 인증자`);
  }
  if (r.expertCohortLabels.length > 0) {
    parts.push(`전문인재 ${r.expertCohortLabels.join(', ')}`);
  }
  return parts.length > 0 ? parts.join(' / ') : '';
}

function alignFor(key: ColumnDef['key']): 'left' | 'center' | 'right' {
  if (
    key === 'no' ||
    key === 'planCharCount' ||
    key === 'finalScore' ||
    key === 'multiCheck' ||
    key === 'prereq'
  ) {
    return 'right';
  }
  if (
    key === 'organization' ||
    key === 'department' ||
    key === 'jobRole' ||
    key === 'notes' ||
    key === 'rejectionReason'
  ) {
    return 'left';
  }
  return 'center';
}

function buildDistributionText(rows: ExportApplication[]): string {
  const total = rows.length;
  if (total === 0) return '분류 분포: —';
  const parts: string[] = [];
  for (const group of DISTRIBUTION_GROUPS) {
    const count = rows.filter((r) => r.c2Choice && group.choices.includes(r.c2Choice)).length;
    if (count === 0) continue;
    const pct = Math.round((count / total) * 1000) / 10;
    parts.push(`${group.label} ${count}명 (${pct}%)`);
  }
  return parts.length > 0 ? `분류 분포 · ${parts.join('   ·   ')}` : '분류 분포: —';
}

function applyBorder(cell: ExcelJS.Cell, style: 'thin' | 'medium') {
  cell.border = {
    top: { style },
    bottom: { style },
    left: { style },
    right: { style }
  };
}

function widenLeft(cell: ExcelJS.Cell) {
  cell.border = { ...cell.border, left: { style: 'medium' } };
}

function widenRight(cell: ExcelJS.Cell) {
  cell.border = { ...cell.border, right: { style: 'medium' } };
}

function cellRef(col: number, row: number): string {
  let c = '';
  let n = col;
  while (n > 0) {
    n--;
    c = String.fromCharCode(65 + (n % 26)) + c;
    n = Math.floor(n / 26);
  }
  return `${c}${row}`;
}

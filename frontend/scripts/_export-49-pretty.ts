// 49명 행안부 답변용 — exceljs 풀스타일 (헤더 강조 · zebra · 분류 색상 · border).
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { createClient } from '@supabase/supabase-js';

const envPath = path.resolve(__dirname, '../.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const FILE = 'C:\\Users\\USER\\Downloads\\EMS_미선발집계자.xlsx';

const COHORTS_OF_INTEREST = [
  { id: 'a58022fc-324a-44cb-b418-91f008e7f1a0', label: '그린3' },
  { id: '6ef1b2f3-3054-4933-87d9-7964842e2250', label: '그린4' },
  { id: '385f6497-0b85-41d9-8668-bc0c8cf8f9b6', label: '블루4' },
  { id: '70a3fc72-0af0-473b-9745-0f39ecaeae9f', label: '⑦데이터분석심화1' },
  { id: '64fe381e-3bf7-48b5-ac79-d052854c87cc', label: '⑧바이브코딩1' }
];
const COHORT_ID_SET = new Set(COHORTS_OF_INTEREST.map((c) => c.id));

const STATUS_KR: Record<string, string> = {
  selected: '선발',
  rejected: '탈락',
  applied: '심사중',
  cancel_notice: '취소통보',
  cancel_confirmed: '취소확정',
  same_day_cancel: '당일취소'
};

// ── 스타일 팔레트 ──
const COLOR = {
  headerBg: 'FF1F4E78', // 진한 파랑
  headerFg: 'FFFFFFFF',
  zebra: 'FFF5F8FB',
  border: 'FFD9E2EC',
  red: 'FFE74C3C',
  redBg: 'FFFDEDEC',
  green: 'FF27AE60',
  greenBg: 'FFE9F7EF',
  grayBg: 'FFEAEDED',
  amberBg: 'FFFEF5E7',
  amberFg: 'FF8A5A00',
  sectionBg: 'FFE3E8EE'
};

const thinBorder = {
  top: { style: 'thin' as const, color: { argb: COLOR.border } },
  left: { style: 'thin' as const, color: { argb: COLOR.border } },
  bottom: { style: 'thin' as const, color: { argb: COLOR.border } },
  right: { style: 'thin' as const, color: { argb: COLOR.border } }
};

function isYellowHex(hex: string | undefined): boolean {
  if (!hex) return false;
  const h = hex.toUpperCase().replace(/^#/, '');
  const start = h.length === 8 ? 2 : 0;
  if (h.length !== 6 && h.length !== 8) return false;
  const r = parseInt(h.slice(start, start + 2), 16);
  const g = parseInt(h.slice(start + 2, start + 4), 16);
  const b = parseInt(h.slice(start + 4, start + 6), 16);
  return r > 200 && g > 200 && b < 200;
}

const visualWidth = (s: string) => {
  let w = 0;
  for (const ch of s) w += /[ㄱ-힝]/.test(ch) ? 2 : 1;
  return w;
};

type Person = { name: string; org: string; phone: string };

async function extractYellow(): Promise<Person[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);
  const out: Person[] = [];
  for (const ws of wb.worksheets) {
    const header: Record<number, string> = {};
    ws.getRow(1).eachCell((cell, c) => {
      header[c] = String(cell.value ?? '');
    });
    const cName = Object.entries(header).find(([_, v]) => v === '이름')?.[0];
    const cOrg = Object.entries(header).find(([_, v]) => v === '소속기관')?.[0];
    const cPhone = Object.entries(header).find(([_, v]) => v === '전화번호')?.[0];
    if (!cName) continue;
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      let hasY = false;
      row.eachCell((cell) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fill = (cell as any).fill;
        if (!fill) return;
        const fg = fill.fgColor?.argb ?? fill.fgColor?.rgb;
        const bg = fill.bgColor?.argb ?? fill.bgColor?.rgb;
        if (isYellowHex(fg) || isYellowHex(bg)) hasY = true;
      });
      if (!hasY) continue;
      out.push({
        name: String(row.getCell(Number(cName)).value ?? '').trim(),
        org: cOrg ? String(row.getCell(Number(cOrg)).value ?? '').trim() : '',
        phone: cPhone ? String(row.getCell(Number(cPhone)).value ?? '').trim() : ''
      });
    }
  }
  const seen = new Set<string>();
  return out.filter((p) => {
    const k = `${p.name}::${p.phone}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

type StyledSheetOpts = {
  headers: string[];
  rows: (string | number)[][];
  freezeCols?: number;
  // 행별 분류 (선택) — 'review' | 'noApply' | 'partial' | null
  rowCategory?: (string | null)[];
  // 컬럼 인덱스별 정렬·포맷
  colAlign?: Record<number, 'left' | 'center' | 'right'>;
  // 컬럼별 상태 텍스트면 색상 배지 처리
  statusCols?: number[];
};

function applyStyledTable(ws: ExcelJS.Worksheet, opts: StyledSheetOpts) {
  const { headers, rows, freezeCols = 2, rowCategory, colAlign, statusCols } = opts;

  // 헤더
  ws.addRow(headers);
  const headerRow = ws.getRow(1);
  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: COLOR.headerFg }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.headerBg } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = thinBorder;
  });

  // 데이터
  rows.forEach((r, ri) => {
    const dataRow = ws.addRow(r);
    dataRow.height = 20;
    const isZebra = ri % 2 === 1;
    const cat = rowCategory?.[ri];

    dataRow.eachCell((cell, colNumber) => {
      cell.border = thinBorder;
      cell.font = { size: 10 };
      cell.alignment = {
        vertical: 'middle',
        horizontal: colAlign?.[colNumber - 1] ?? 'left',
        wrapText: false
      };
      if (isZebra) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.zebra } };
      }

      // 분류 컬럼 색상
      if (statusCols?.includes(colNumber - 1)) {
        const v = String(cell.value ?? '');
        if (v === '선발') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.greenBg } };
          cell.font = { color: { argb: COLOR.green }, bold: true, size: 10 };
        } else if (v === '탈락') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.redBg } };
          cell.font = { color: { argb: COLOR.red }, size: 10 };
        } else if (v === '심사중') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.amberBg } };
          cell.font = { color: { argb: COLOR.amberFg }, size: 10 };
        } else if (v === '-') {
          cell.font = { color: { argb: 'FFB0B0B0' }, size: 10 };
        }
      }
    });

    // 행 전체 분류 강조
    if (cat === 'review') {
      const lastCell = dataRow.getCell(headers.length);
      lastCell.font = { color: { argb: COLOR.red }, bold: true, size: 10 };
    }
  });

  // 컬럼 너비 자동
  ws.columns.forEach((col, ci) => {
    const headerW = visualWidth(headers[ci] ?? '');
    let maxW = headerW;
    for (const r of rows) {
      const v = r[ci];
      const s = v === null || v === undefined ? '' : String(v);
      const w = visualWidth(s);
      if (w > maxW) maxW = w;
    }
    col.width = Math.min(50, Math.max(6, Math.ceil(maxW * 1.15) + 2));
  });

  // freeze + filter
  ws.views = [
    {
      state: 'frozen',
      ySplit: 1,
      xSplit: freezeCols,
      showGridLines: false
    }
  ];
  if (rows.length > 0) {
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: rows.length + 1, column: headers.length }
    };
  }
}

async function main() {
  console.log('노란 셀 추출...');
  const yellow = await extractYellow();
  console.log(`→ ${yellow.length}명`);

  type AppRec = {
    cohort_id: string;
    cohort_name: string;
    status: string;
    applied_at: string | null;
    isOfInterest: boolean;
  };
  type Out = {
    person: Person;
    matched: boolean;
    apps: AppRec[];
    apps5: AppRec[];
    selectedCount5: number;
    rejectedCount5: number;
  };
  const result: Out[] = [];
  for (const p of yellow) {
    let q = supabase.from('applicants').select('id').eq('name', p.name);
    if (p.phone) q = q.eq('phone', p.phone);
    const { data: apps } = await q;
    const applicantIds = (apps ?? []).map((a) => (a as { id: string }).id);
    if (applicantIds.length === 0) {
      result.push({
        person: p,
        matched: false,
        apps: [],
        apps5: [],
        selectedCount5: 0,
        rejectedCount5: 0
      });
      continue;
    }
    const { data: appRecs } = await supabase
      .from('applications')
      .select('cohort_id, status, applied_at, cohorts(name)')
      .in('applicant_id', applicantIds)
      .order('applied_at', { ascending: true });
    const allApps: AppRec[] = (appRecs ?? []).map((a) => {
      const aa = a as unknown as {
        cohort_id: string;
        status: string;
        applied_at: string | null;
        cohorts: { name: string } | null;
      };
      return {
        cohort_id: aa.cohort_id,
        cohort_name: aa.cohorts?.name ?? '?',
        status: aa.status,
        applied_at: aa.applied_at,
        isOfInterest: COHORT_ID_SET.has(aa.cohort_id)
      };
    });
    const apps5 = allApps.filter((a) => a.isOfInterest);
    result.push({
      person: p,
      matched: true,
      apps: allApps,
      apps5,
      selectedCount5: apps5.filter((a) => a.status === 'selected').length,
      rejectedCount5: apps5.filter((a) => a.status === 'rejected').length
    });
  }

  const noApplyTo5 = result.filter((r) => r.apps5.length === 0);
  const allRejectedIn5 = result.filter((r) => r.apps5.length > 0 && r.selectedCount5 === 0);
  const partialSelected = result.filter((r) => r.selectedCount5 > 0);
  const appsToCells = (apps5: AppRec[]): string[] =>
    COHORTS_OF_INTEREST.map((c) => {
      const f = apps5.find((a) => a.cohort_id === c.id);
      return f ? STATUS_KR[f.status] ?? f.status : '-';
    });
  const categoryOf = (r: Out): string =>
    !r.matched
      ? 'EMS 매칭 X'
      : r.apps5.length === 0
        ? '5개 미신청'
        : r.selectedCount5 > 0
          ? '일부 선발됨'
          : '전부 미선발 (추가검토)';

  // ── 워크북 ──
  const wb = new ExcelJS.Workbook();
  wb.creator = 'EMS 운영지원';
  wb.created = new Date();

  // ── 요약 시트 ──
  const wsSummary = wb.addWorksheet('📋 요약', {
    properties: { defaultRowHeight: 22 }
  });
  wsSummary.columns = [{ width: 4 }, { width: 38 }, { width: 22 }, { width: 50 }];

  // 제목
  wsSummary.mergeCells('B2:D2');
  const title = wsSummary.getCell('B2');
  title.value = '행안부 민원 49명 — 5개 모집중 cohort 대조 결과';
  title.font = { bold: true, size: 16, color: { argb: COLOR.headerBg } };
  title.alignment = { vertical: 'middle' };
  wsSummary.getRow(2).height = 32;

  wsSummary.mergeCells('B3:D3');
  const sub = wsSummary.getCell('B3');
  sub.value = `집계 기준일: ${new Date().toISOString().slice(0, 10)}  ·  소스: ${path.basename(FILE)}`;
  sub.font = { size: 10, color: { argb: 'FF6B7280' } };

  // 섹션: 대상 cohort
  let row = 5;
  const section = (label: string) => {
    wsSummary.mergeCells(`B${row}:D${row}`);
    const c = wsSummary.getCell(`B${row}`);
    c.value = label;
    c.font = { bold: true, size: 11, color: { argb: COLOR.headerBg } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.sectionBg } };
    c.alignment = { vertical: 'middle', indent: 1 };
    wsSummary.getRow(row).height = 22;
    row++;
  };
  const kv = (k: string, v: string | number, valFontColor?: string, valBold?: boolean) => {
    const kc = wsSummary.getCell(`B${row}`);
    kc.value = k;
    kc.font = { size: 10 };
    kc.alignment = { vertical: 'middle', indent: 1 };
    kc.border = { bottom: { style: 'dotted', color: { argb: COLOR.border } } };
    const vc = wsSummary.getCell(`C${row}`);
    vc.value = v;
    vc.font = { size: 10, bold: !!valBold, color: valFontColor ? { argb: valFontColor } : undefined };
    vc.alignment = { vertical: 'middle' };
    vc.border = { bottom: { style: 'dotted', color: { argb: COLOR.border } } };
    const dc = wsSummary.getCell(`D${row}`);
    dc.border = { bottom: { style: 'dotted', color: { argb: COLOR.border } } };
    row++;
  };
  const kvNote = (k: string, v: string | number, note: string, fg?: string) => {
    const kc = wsSummary.getCell(`B${row}`);
    kc.value = k;
    kc.font = { size: 10 };
    kc.alignment = { vertical: 'middle', indent: 1 };
    kc.border = { bottom: { style: 'dotted', color: { argb: COLOR.border } } };
    const vc = wsSummary.getCell(`C${row}`);
    vc.value = v;
    vc.font = { size: 11, bold: true, color: fg ? { argb: fg } : undefined };
    vc.alignment = { vertical: 'middle' };
    vc.border = { bottom: { style: 'dotted', color: { argb: COLOR.border } } };
    const dc = wsSummary.getCell(`D${row}`);
    dc.value = note;
    dc.font = { size: 9, color: { argb: 'FF6B7280' }, italic: true };
    dc.alignment = { vertical: 'middle' };
    dc.border = { bottom: { style: 'dotted', color: { argb: COLOR.border } } };
    row++;
  };

  section('대상 cohort (5개, 모집·선발 중)');
  for (const c of COHORTS_OF_INTEREST) kv('  • ' + c.label, c.id);
  row++;

  section('인원 분류');
  kvNote('총 인원', result.length, '행안부에서 표시한 노란색 셀 추출');
  kvNote(
    '  └ EMS 매칭 안 됨',
    result.filter((r) => !r.matched).length,
    '신청자 명단에 동일 이름·전화 없음'
  );
  kvNote(
    '  ├ 5개 cohort 미신청',
    noApplyTo5.length,
    '⚠️ 본인이 신청 안 함 → 추가 선발 불가',
    COLOR.headerBg
  );
  kvNote(
    '  ├ 5개 중 일부 선발됨',
    partialSelected.length,
    '이미 합격 → 추가 선발 대상 아님',
    COLOR.green
  );
  kvNote(
    '  └ 5개 신청·전부 미선발',
    allRejectedIn5.length,
    '▶ 차회차 우선 검토 대상',
    COLOR.red
  );
  row++;

  section('행안부 답변 키 포인트');
  wsSummary.mergeCells(`B${row}:D${row + 2}`);
  const note = wsSummary.getCell(`B${row}`);
  note.value =
    `49명 중 ${noApplyTo5.length}명(${Math.round((noApplyTo5.length / 49) * 100)}%)은 현재 모집 중인 5개 과정에 신청 접수 자체가 없어 추가 선발 대상이 될 수 없습니다.\n` +
    `${partialSelected.length}명은 이미 다른 cohort에서 선발되었으며, 나머지 ${allRejectedIn5.length}명만 현재 정원·기관 cap 정책으로 미선발된 상태로 차회차 우선 검토 대상입니다.`;
  note.alignment = { vertical: 'top', wrapText: true, indent: 1 };
  note.font = { size: 10 };
  note.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.amberBg } };
  note.border = thinBorder;
  for (let i = 0; i < 3; i++) wsSummary.getRow(row + i).height = 22;

  wsSummary.views = [{ showGridLines: false }];

  // ── 전체 49명 시트 ──
  const headersAll = [
    '순번',
    '이름',
    '소속기관',
    '전화번호',
    '매칭',
    ...COHORTS_OF_INTEREST.map((c) => c.label),
    '분류',
    '전체신청',
    '5개중신청',
    '5개중선발',
    '5개중미선발'
  ];
  const rowsAll: (string | number)[][] = [];
  const rowCatAll: (string | null)[] = [];
  result.forEach((r, i) => {
    rowsAll.push([
      i + 1,
      r.person.name,
      r.person.org,
      r.person.phone,
      r.matched ? 'O' : 'X',
      ...appsToCells(r.apps5),
      categoryOf(r),
      r.apps.length,
      r.apps5.length,
      r.selectedCount5,
      r.rejectedCount5
    ]);
    const cat = categoryOf(r);
    rowCatAll.push(cat === '전부 미선발 (추가검토)' ? 'review' : null);
  });
  const statusColsAll = COHORTS_OF_INTEREST.map((_, i) => 5 + i); // 5~9번 컬럼
  const wsAll = wb.addWorksheet('전체 49명');
  applyStyledTable(wsAll, {
    headers: headersAll,
    rows: rowsAll,
    freezeCols: 2,
    rowCategory: rowCatAll,
    colAlign: {
      0: 'center',
      4: 'center',
      ...Object.fromEntries(statusColsAll.map((c) => [c, 'center'])),
      [headersAll.length - 4]: 'center',
      [headersAll.length - 3]: 'center',
      [headersAll.length - 2]: 'center',
      [headersAll.length - 1]: 'center'
    },
    statusCols: statusColsAll
  });

  // ── 추가검토 대상 시트 (9명) ──
  const headersReview = [
    '순번',
    '이름',
    '소속기관',
    '전화번호',
    ...COHORTS_OF_INTEREST.map((c) => c.label),
    '5개중신청',
    '5개중미선발',
    '5개 외 신청 이력'
  ];
  const rowsReview: (string | number)[][] = allRejectedIn5.map((r, i) => [
    i + 1,
    r.person.name,
    r.person.org,
    r.person.phone,
    ...appsToCells(r.apps5),
    r.apps5.length,
    r.rejectedCount5,
    r.apps
      .filter((a) => !a.isOfInterest)
      .map((a) => `${a.cohort_name}(${STATUS_KR[a.status] ?? a.status})`)
      .join(' / ') || '없음'
  ]);
  const statusColsReview = COHORTS_OF_INTEREST.map((_, i) => 4 + i);
  const wsReview = wb.addWorksheet(`🔴 추가검토(${allRejectedIn5.length})`);
  applyStyledTable(wsReview, {
    headers: headersReview,
    rows: rowsReview,
    freezeCols: 2,
    colAlign: {
      0: 'center',
      ...Object.fromEntries(statusColsReview.map((c) => [c, 'center'])),
      [headersReview.length - 3]: 'center',
      [headersReview.length - 2]: 'center'
    },
    statusCols: statusColsReview
  });

  // ── 5개 미신청 시트 (36명) ──
  const headersNo = [
    '순번',
    '이름',
    '소속기관',
    '전화번호',
    '전체신청 수',
    '신청 cohort 목록'
  ];
  const rowsNo: (string | number)[][] = noApplyTo5.map((r, i) => [
    i + 1,
    r.person.name,
    r.person.org,
    r.person.phone,
    r.apps.length,
    r.apps.map((a) => `${a.cohort_name}(${STATUS_KR[a.status] ?? a.status})`).join(' / ') ||
      (r.matched ? '신청 이력 없음' : 'EMS 매칭 X')
  ]);
  const wsNo = wb.addWorksheet(`⚪ 5개 미신청(${noApplyTo5.length})`);
  applyStyledTable(wsNo, {
    headers: headersNo,
    rows: rowsNo,
    freezeCols: 2,
    colAlign: { 0: 'center', 4: 'center' }
  });

  // ── 일부 선발 시트 (4명) ──
  const headersPartial = [
    '순번',
    '이름',
    '소속기관',
    '전화번호',
    ...COHORTS_OF_INTEREST.map((c) => c.label),
    '5개중선발',
    '선발 cohort'
  ];
  const rowsPartial: (string | number)[][] = partialSelected.map((r, i) => [
    i + 1,
    r.person.name,
    r.person.org,
    r.person.phone,
    ...appsToCells(r.apps5),
    r.selectedCount5,
    r.apps5.filter((a) => a.status === 'selected').map((a) => a.cohort_name).join(' / ')
  ]);
  const statusColsPartial = COHORTS_OF_INTEREST.map((_, i) => 4 + i);
  const wsPartial = wb.addWorksheet(`🟢 일부선발(${partialSelected.length})`);
  applyStyledTable(wsPartial, {
    headers: headersPartial,
    rows: rowsPartial,
    freezeCols: 2,
    colAlign: {
      0: 'center',
      ...Object.fromEntries(statusColsPartial.map((c) => [c, 'center'])),
      [headersPartial.length - 2]: 'center'
    },
    statusCols: statusColsPartial
  });

  // ── 전체 신청이력 raw ──
  const headersRaw = ['이름', '소속기관', 'cohort', 'status', 'applied_at', '5개중'];
  const rowsRaw: (string | number)[][] = [];
  for (const r of result) {
    if (r.apps.length === 0) {
      rowsRaw.push([
        r.person.name,
        r.person.org,
        r.matched ? '(신청 이력 없음)' : '(EMS 매칭 X)',
        '',
        '',
        ''
      ]);
    } else {
      for (const a of r.apps) {
        rowsRaw.push([
          r.person.name,
          r.person.org,
          a.cohort_name,
          STATUS_KR[a.status] ?? a.status,
          a.applied_at ?? '',
          a.isOfInterest ? 'Y' : ''
        ]);
      }
    }
  }
  const wsRaw = wb.addWorksheet('🗂 raw 신청이력');
  applyStyledTable(wsRaw, {
    headers: headersRaw,
    rows: rowsRaw,
    freezeCols: 2,
    colAlign: { 5: 'center' },
    statusCols: [3]
  });

  const out = `C:\\Dev\\새 폴더\\EMS_49명_행안부답변용_pretty_${new Date()
    .toISOString()
    .replace(/[-:T]/g, '')
    .slice(0, 12)}.xlsx`;
  await wb.xlsx.writeFile(out);
  console.log('\n✓ 파일:', out);
}

main().catch((e) => { console.error(e); process.exit(1); });
